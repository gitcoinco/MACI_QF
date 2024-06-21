// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.20;

// MACI Contracts & Libraries
import {ClonableMACIFactory} from "../../ClonableMaciContracts/ClonableMACIFactory.sol";
import {DomainObjs} from "maci-contracts/contracts/utilities/DomainObjs.sol";
import {ClonableMACI} from "../../ClonableMaciContracts/ClonableMACI.sol";
import {Params} from "maci-contracts/contracts/utilities/Params.sol";
import {Tally} from "maci-contracts/contracts/Tally.sol";
import {Poll} from "maci-contracts/contracts/Poll.sol";

// Interfaces
import {IAlowlistVerifier} from "./interfaces/IAlowlistVerifier.sol";

import {IAllo} from "../../core/interfaces/IAllo.sol";

// Core Contracts
import {MACIQFBase} from "./MACIQFBase.sol";

/// @notice This contract handles the quadratic funding mechanism using MACI (Minimal Anti-Collusion Infrastructure).
/// Allo x MACI Capital Constrained Quadratic Funding Strategy (MACIQF)
/// It extends the MACIQFBase contract and integrates MACI-related functionalities.
/// Inspired by CLR.Fund https://github.com/clrfund/monorepo/blob/develop/contracts/contracts/FundingRound.sol 
contract MACIQF is MACIQFBase, DomainObjs, Params {
    /// ======================
    /// ======= Structs ======
    /// ======================

    /// @notice Parameters for initializing MACI
    struct MaciParams {
        // The MACI coordinator is responsible for deploying the MACI contracts
        // And Submit the results of the vote tally. He is the only one that can create
        // Valid proofs to finalize the round. He is the only one that can decrypt the votes
        // Coordinator must be a trusted party
        address coordinator;
        // The coordinator public key is used to verify the MACI messages
        PubKey coordinatorPubKey;
        // The MACI factory is used to deploy the MACI contracts
        address maciFactory;
        // The verifier contract is used to verify the proof of attendance
        // In ZuZalu events
        address verifier;
        // The MACI ID is used to differentiate between different MACI instances
        // Each instance is using a different set of circuits and verification keys
        // Different circuits define how many vote options are available how many 
        // signups how many votes messages can get handled
        uint8 maciId;
        // The AllowlistDetails are used in a modular way to create the allowlist 
        // Based on the verifier contract logic.
        bytes allowlistDetails;
        // Those Variables might change in the future TODO
        // We are still getting feedback from the Zuzalu community
        // Those values purpose is to limit the amount of voice credits
        // Hence make the QF sybil resistant to some extent
        // Another idea is to use a weight so that non-allowlisted users can contribute
        // But if they contribute X amount they will get X * weight voice credits
        // Weight can be a value between 0 and 1
        uint256 maxContributionAllowlisted;
        uint256 maxContributionNotAllowlisted;
    }

    /// @notice Initialization parameters for the strategy
    struct InitializeParamsMACI {
        InitializeParams initializeParams;
        MaciParams maciParams;
    }

    /// @notice Structure to store the Contributor details
    struct Contributor {
        uint256 voiceCredits;
        bool signedUp;
    }

    /// @notice Structure to claim funds
    // Used as a proof to verify and distribute funds to the recipients
    // Anyone can generate a claim and submit it to the contract
    // After Tally IPFS hash is published and the round is finalized
    struct claimFunds {
        uint256 voteOptionIndex;
        uint256 spent;
        uint256[][] spentProof;
        uint256 spentSalt;
        uint256 resultsCommitment;
        uint256 spentVoiceCreditsCommitment;
    }

    /// ======================
    /// ======= Events ======
    /// ======================

    /// @notice Emitted when the tally hash is published
    /// @param tallyHash The IPFS hash of the tally
    event TallyPublished(string tallyHash);

    /// @notice Emitted when the tally results are added
    /// @param voteOptionIndex The index of the vote option
    /// @param tally The tally for the vote option
    event TallyResultsAdded(uint256 indexed voteOptionIndex, uint256 tally);

    /// @notice Emitted when funds are distributed to a recipient
    /// @param amount The amount of tokens distributed
    /// @param grantee The address of the recipient
    /// @param token The address of the token
    /// @param recipientId The id of the recipient
    event FundsDistributed(
        uint256 amount,
        address grantee,
        address indexed token,
        address indexed recipientId
    );

    /// ======================
    /// ======= Errors ======
    /// ======================

    error MaciNotSet();
    error VotesNotTallied();
    error TallyHashNotPublished();
    error NoVotes();
    error OnlyMaciCanRegisterVoters();
    error UserAlreadySignedUp();
    error EmptyTallyHash();
    error IncorrectSpentVoiceCredits();
    error IncorrectTallyResult();
    error IncorrectPerVOSpentVoiceCredits();
    error InvalidAmount();
    error AlreadyContributed();
    error InvalidProof();
    error ContributionAmountTooLarge();
    error RoundNotCancelled();
    error RoundCancelled();
    error RoundNotFinalized();
    error NothingToWithdraw();
    error ContributionWithdrawn();

    /// ======================
    /// ======= Storage ======
    /// ======================

     /// @notice The maximum contribution amount for users in allowlist
    uint256 public maxContributionAllowlisted;

    /// @notice The maximum contribution amount for users not in allowlist
    uint256 public maxContributionNotAllowlisted;

    /// @notice Poll contracts for MACI
    ClonableMACI.PollContracts public _pollContracts;

    /// @notice Address of the MACI factory
    address public maciFactory;

    /// @notice The verifier contract instance
    IAlowlistVerifier public allowlistVerifier;

    /// @notice Mapping from contributor address to total credits
    mapping(address => Contributor) public contributorInfo;

    /// ====================================
    /// ========== Constructor =============
    /// ====================================

    /// @notice Initializes the MACIQF contract
    /// @param _allo The address of the Allo contract
    /// @param _name The name of the strategy
    constructor(address _allo, string memory _name) MACIQFBase(_allo, _name) {}

    /// ====================================
    /// =========== Initialize =============
    /// ====================================

    /// @notice Initialize the strategy
    /// @param _poolId The ID of the pool
    /// @param _data The initialization data for the strategy
    function initialize(uint256 _poolId, bytes memory _data) external virtual override onlyAllo {
        InitializeParamsMACI memory _initializeParams = abi.decode(_data, (InitializeParamsMACI));
        __MACIQFStrategy_init(_poolId, _initializeParams);
        emit Initialized(_poolId, _data);
    }

    /// @notice Internal initialize function
    /// @param _poolId The ID of the pool
    /// @param _params The initialize params for the strategy
    function __MACIQFStrategy_init(uint256 _poolId, InitializeParamsMACI memory _params) internal {
        __MACIQFBaseStrategy_init(_poolId, _params.initializeParams);
        // Initialize the allowlistVerifier contract
        allowlistVerifier = IAlowlistVerifier(_params.maciParams.verifier);
        // Round Whitelisted events registration
        allowlistVerifier.setRoundAllowlist(_params.maciParams.allowlistDetails);
        // Set the maximum contribution amounts for Zupass and non-Zupass users
        maxContributionAllowlisted = _params.maciParams.maxContributionAllowlisted;
        maxContributionNotAllowlisted= _params.maciParams.maxContributionNotAllowlisted;

        // Deploy the MACI contracts
        coordinator = _params.maciParams.coordinator;

        maciFactory = _params.maciParams.maciFactory;

        ClonableMACIFactory _maciFactory = ClonableMACIFactory(maciFactory);

        uint8 _maciId = _params.maciParams.maciId;

        _maci = _maciFactory.createMACI(address(this), address(this), coordinator, _maciId);

        maxAcceptedRecipients = _maciFactory.getMaxVoteOptions(_maciId);

        uint256 _pollDuration = _params.initializeParams.allocationEndTime - block.timestamp;

        _pollContracts = ClonableMACI(_maci).deployPoll(
            _pollDuration,
            _params.maciParams.coordinatorPubKey,
            Mode.QV,
            _maciId
        );
    }

    /// =======================================
    /// ====== Allo Related Functions =========
    /// =======================================

    /// @notice Allocate votes to a recipient
    /// @param _data The data containing allocation details
    /// @param _sender The sender of the transaction
    function _allocate(bytes memory _data, address _sender) internal override onlyActiveAllocation {
        (
            PubKey memory pubKey,
            uint256 amount,
            bytes memory _proof
        ) = abi.decode(_data, (PubKey, uint256, bytes));

        if (isAddressZero(_maci)) revert MaciNotSet();
        if (isFinalized) revert RoundAlreadyFinalized();
        if (contributorInfo[_sender].signedUp) revert AlreadyContributed();
        if (amount > MAX_VOICE_CREDITS * voiceCreditFactor) revert ContributionAmountTooLarge();

        // Validate allowlist proof if provided GAS optimization
        // Don't check if the proof is empty
        if (_proof.length != 0) {
            if (!allowlistVerifier.validateAllowlist(_proof)) {
                revert InvalidProof();
            }
            if (amount > maxContributionAllowlisted) {
                revert ContributionAmountTooLarge();
            }
        } else {
            if (amount > maxContributionNotAllowlisted) {
                revert ContributionAmountTooLarge();
            }
        }

        address token = allo.getPool(poolId).token;

        if (token != NATIVE) {
            _transferAmountFrom(token, TransferData(_sender, address(this), amount));
        } else {
            if (msg.value != amount) revert InvalidAmount();
        }

        uint256 voiceCredits = amount / voiceCreditFactor;
        // A contributor is considered signed only if he calls the allocate function    
        contributorInfo[_sender].voiceCredits = voiceCredits;
        totalContributed += amount;
        
        // Something needed after removing _poolAmount using getBalance in finalize after calcAlpha 
        // for updating the matchingPoolSize and only relying on poolAmount not in the audit report TODO CHECK
        poolAmount += amount;

        // Make use same data for _signUpGatekeeperData and _initialVoiceCreditProxyData
        bytes memory data = abi.encode(_sender);

        ClonableMACI(_maci).signUp(pubKey, data, data);

        emit Allocated(address(0), amount, token, _sender);
    }

    /// @notice Distribute the tokens to the recipients
    /// @dev The sender must be a pool manager and the allocation must have ended
    /// @param data The data containing distribution details
    function _distribute(
        address[] memory /* _recipientIds */,
        bytes memory data,
        address /* _sender */
    ) internal override onlyAfterAllocation {
        if (!isFinalized) {
            revert RoundNotFinalized();
        }

        if (isCancelled) {
            revert RoundCancelled();
        }

        bytes[] memory claims = abi.decode(data, (bytes[]));

        for (uint256 i = 0; i < claims.length; i++) {
            _distributeFunds(claims[i]);
        }
    }

    /// @notice Distribute the funds to a recipient
    /// @param _claim The claim funds
    function _distributeFunds(bytes memory _claim) internal {
        claimFunds memory claim = abi.decode(_claim, (claimFunds));

        uint256 index = claim.voteOptionIndex;

        address recipientId = recipientVoteIndexToAddress[index];

        Recipient memory recipient = _recipients[recipientId];

        uint256 amount = getAllocatedAmount(recipient.totalVotesReceived, claim.spent);

        verifyClaim(claim);

        if (
            !_validateDistribution(recipientId) || !_isAcceptedRecipient(recipientId) || amount == 0
        ) {
            revert RECIPIENT_ERROR(recipientId);
        }

        paidOut[recipientId] = true;
        IAllo.Pool memory pool = allo.getPool(poolId);

        _transferAmount(pool.token, recipient.recipientAddress, amount);

        emit FundsDistributed(amount, recipient.recipientAddress, pool.token, recipientId);
    }

    /// =======================================
    /// ====== MACI Related Functions =========
    /// =======================================

    /// @notice Register a user for voting
    /// @dev This function is part of the SignUpGatekeeper interface
    /// @param _data Encoded address of a contributor
    function register(address /* _caller */, bytes memory _data) external {
        if (msg.sender != _maci) {
            revert OnlyMaciCanRegisterVoters();
        }

        address user = abi.decode(_data, (address));
        
        bool AlreadySignedUp = contributorInfo[user].signedUp;

        if (AlreadySignedUp) {
            revert UserAlreadySignedUp();
        }

        contributorInfo[user].signedUp = true;
    }

    /// @notice Returns the voice credits for a given address
    /// @param _data Encoded address of a user
    /// @return The amount of voice credits
    function getVoiceCredits(
        address /* _caller */,
        bytes memory _data
    ) external view returns (uint256) {
        address _allocator = abi.decode(_data, (address));
        return contributorInfo[_allocator].voiceCredits;
    }

    /// @notice Checks if an allocator is valid
    /// @param _allocator The allocator address
    function _isValidAllocator(address _allocator) internal view override returns (bool _isValid) {}

    /// @notice Add and verify tally results by batch
    /// @param _voteOptionIndices List of vote option indices
    /// @param _tallyResults List of tally results
    /// @param _tallyResultProofs List of tally result proofs
    /// @param _tallyResultSalt Salt for the tally result
    /// @param _spentVoiceCreditsHashes Hash of spent voice credits
    /// @param _perVOSpentVoiceCreditsHashes Hash of per vote option spent voice credits
    function addTallyResultsBatch(
        uint256[] calldata _voteOptionIndices,
        uint256[] calldata _tallyResults,
        uint256[][][] calldata _tallyResultProofs,
        uint256 _tallyResultSalt,
        uint256 _spentVoiceCreditsHashes,
        uint256 _perVOSpentVoiceCreditsHashes
    ) external onlyCoordinator {
        if (_voteOptionIndices.length != _tallyResults.length) {
            revert INVALID();
        }

        for (uint256 i = 0; i < _voteOptionIndices.length; i++) {
            _addTallyResult(
                _voteOptionIndices[i],
                _tallyResults[i],
                _tallyResultProofs[i],
                _tallyResultSalt,
                _spentVoiceCreditsHashes,
                _perVOSpentVoiceCreditsHashes
            );
        }
    }

    /// @notice Add and verify tally votes and calculate sum of tally squares for alpha calculation
    /// @param _voteOptionIndex The vote option index
    /// @param _tallyResult The result of the vote tally for the recipients
    /// @param _tallyResultProof Proof of correctness of the vote tally result
    /// @param _tallyResultSalt Salt for the tally result
    /// @param _spentVoiceCreditsHash Hash of spent voice credits
    /// @param _perVOSpentVoiceCreditsHash Hash of per vote option spent voice credits
    function _addTallyResult(
        uint256 _voteOptionIndex,
        uint256 _tallyResult,
        uint256[][] memory _tallyResultProof,
        uint256 _tallyResultSalt,
        uint256 _spentVoiceCreditsHash,
        uint256 _perVOSpentVoiceCreditsHash
    ) internal {
        (Poll poll, Tally tally) = getMaciContracts();

        (, , , uint8 voteOptionTreeDepth) = poll.treeDepths();

        bool resultVerified = tally.verifyTallyResult(
            _voteOptionIndex,
            _tallyResult,
            _tallyResultProof,
            _tallyResultSalt,
            voteOptionTreeDepth,
            _spentVoiceCreditsHash,
            _perVOSpentVoiceCreditsHash
        );

        if (!resultVerified) {
            revert IncorrectTallyResult();
        }

        _tallyRecipientVotes(_voteOptionIndex, _tallyResult);
    }

    /// @notice Tally votes for a recipient
    /// @param _voteOptionIndex The vote option index
    /// @param _voiceCreditsToAllocate The voice credits to allocate
    function _tallyRecipientVotes(
        uint256 _voteOptionIndex,
        uint256 _voiceCreditsToAllocate
    ) internal {
        address recipientId = recipientVoteIndexToAddress[_voteOptionIndex];
        Recipient storage recipient = _recipients[recipientId];

        if (recipient.tallyVerified) {
            return;
        }

        if (!_isAcceptedRecipient(recipientId)) return;

        if (_voiceCreditsToAllocate == 0) return;

        recipient.tallyVerified = true;

        totalRecipientVotes += _voiceCreditsToAllocate;

        totalVotesSquares = totalVotesSquares + (_voiceCreditsToAllocate * _voiceCreditsToAllocate);

        recipient.totalVotesReceived = _voiceCreditsToAllocate;

        emit TallyResultsAdded(_voteOptionIndex, _voiceCreditsToAllocate);
    }

    /// @notice Publish the IPFS hash of the vote tally. Only the coordinator can publish.
    /// @param _tallyHash IPFS hash of the vote tally.
    function publishTallyHash(
        string calldata _tallyHash
    ) external onlyCoordinator onlyAfterAllocation {
        if (isFinalized) {
            revert RoundAlreadyFinalized();
        }
        if (bytes(_tallyHash).length == 0) {
            revert EmptyTallyHash();
        }

        tallyHash = _tallyHash;
        emit TallyPublished(_tallyHash);
    }

    /// @notice Finalize the round
    /// @param _totalSpent Total amount of spent voice credits
    /// @param _totalSpentSalt The salt
    /// @param _newResultCommitment New result commitment
    /// @param _perVOSpentVoiceCreditsHash Hash of per vote option spent voice credits
    function finalize(
        uint256 _totalSpent,
        uint256 _totalSpentSalt,
        uint256 _newResultCommitment,
        uint256 _perVOSpentVoiceCreditsHash
    ) external onlyCoordinator onlyAfterAllocation {
        (, Tally tally) = getMaciContracts();

        if (isFinalized) {
            revert RoundAlreadyFinalized();
        }

        if (isAddressZero(_maci)) revert MaciNotSet();
        if (!tally.isTallied()) {
            revert VotesNotTallied();
        }
        if (bytes(tallyHash).length == 0) {
            revert TallyHashNotPublished();
        }
        if (_totalSpent == 0) {
            revert NoVotes();
        }

        bool verified = tally.verifySpentVoiceCredits(
            _totalSpent,
            _totalSpentSalt,
            _newResultCommitment,
            _perVOSpentVoiceCreditsHash
        );

        if (!verified) {
            revert IncorrectSpentVoiceCredits();
        }

        totalSpent = _totalSpent;

        alpha = calcAlpha(poolAmount, totalVotesSquares, _totalSpent);
        matchingPoolSize = poolAmount - _totalSpent * voiceCreditFactor;

        isFinalized = true;
    }

    /// @notice Verify the claim for allocated tokens
    /// @param __claimFunds The claim funds structure
    function verifyClaim(claimFunds memory __claimFunds) internal view {
        (Poll poll, Tally tally) = getMaciContracts();

        (, , , uint8 voteOptionTreeDepth) = poll.treeDepths();

        bool verified = tally.verifyPerVOSpentVoiceCredits(
            __claimFunds.voteOptionIndex,
            __claimFunds.spent,
            __claimFunds.spentProof,
            __claimFunds.spentSalt,
            voteOptionTreeDepth,
            __claimFunds.spentVoiceCreditsCommitment,
            __claimFunds.resultsCommitment
        );

        if (!verified) {
            revert IncorrectPerVOSpentVoiceCredits();
        }
    }

    /// @dev Reset tally results. This should only be used if the tally script
    /// failed to proveOnChain due to unexpected error processing MACI logs
    function resetTally() external onlyCoordinator onlyAfterAllocation {
        if (isAddressZero(address(_maci))) revert MaciNotSet();
        if (isFinalized) revert RoundAlreadyFinalized();

        (Poll poll, Tally tally) = getMaciContracts();

        address verifier = address(tally.verifier());
        address vkRegistry = address(tally.vkRegistry());

        address newMessageProcessor = ClonableMACIFactory(maciFactory).deployMessageProcessor(
            verifier,
            vkRegistry,
            address(poll),
            coordinator,
            Mode.QV
        );
        address newTally = ClonableMACIFactory(maciFactory).deployTally(
            verifier,
            vkRegistry,
            address(poll),
            newMessageProcessor,
            coordinator,
            Mode.QV
        );

        _pollContracts.tally = newTally;
        _pollContracts.messageProcessor = newMessageProcessor;
    }

    /// @notice Withdraw contributed funds for a list of contributors if the round has been cancelled
    /// @param _contributors List of contributors
    /// @return result List of boolean results indicating success or failure for each contributor
    function withdrawContributions(
        address[] memory _contributors
    ) public returns (bool[] memory result) {
        if (!isCancelled) {
            revert RoundNotCancelled();
        }

        result = new bool[](_contributors.length);

        for (uint256 i = 0; i < _contributors.length; i++) {
            address contributor = _contributors[i];
            uint256 amount = contributorInfo[contributor].voiceCredits * voiceCreditFactor;
            if (amount > 0) {
                // Decrease the total contributed amount
                totalContributed -= amount;
                // Reset before sending funds the contributor credits to prevent Re-entrancy
                contributorInfo[contributor].voiceCredits = 0;                
                _transferAmountFrom(
                    allo.getPool(poolId).token,
                    TransferData(address(this), contributor, amount)
                );
                result[i] = true;
            } else {
                result[i] = false;
            }
        }
    }

    /// @notice Withdraw the contributed funds by the caller
    function withdrawContribution() external {
        address[] memory msgSender = new address[](1);
        msgSender[0] = msg.sender;

        bool[] memory results = withdrawContributions(msgSender);
        if (!results[0]) {
            revert NothingToWithdraw();
        }
    }

    // @notice get Poll and Tally contracts
    // @return Poll and Tally contracts
    function getMaciContracts() internal view returns (Poll _poll, Tally _tally) {
        return (Poll(_pollContracts.poll), Tally(_pollContracts.tally));
    }

    /// ========================
    /// ==== Util Function =====
    /// ========================

    /// @notice Check if the given address is zero
    /// @param _address The address to check
    /// @return True if the address is zero, otherwise false
    function isAddressZero(address _address) internal pure returns (bool) {
        return _address == address(0);
    }
}
