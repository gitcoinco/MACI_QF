// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.20;

// Importing necessary libraries and contracts
import {ClonableMACIFactory} from "../../ClonableMaciContracts/ClonableMACIFactory.sol";
import {DomainObjs} from "maci-contracts/contracts/utilities/DomainObjs.sol";
import {ClonableMACI} from "../../ClonableMaciContracts/ClonableMACI.sol";
import {Params} from "maci-contracts/contracts/utilities/Params.sol";
import {Tally} from "maci-contracts/contracts/Tally.sol";
import {Poll} from "maci-contracts/contracts/Poll.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {IAllo, IERC20, IVerifier} from "./interfaces/Constants.sol";
import {QFMACIBase} from "./QFMACIBase.sol";

contract MACIQF is QFMACIBase, DomainObjs, Params {
    using EnumerableSet for EnumerableSet.UintSet;

    /// ======================
    /// ======= Storage ======
    /// ======================

    /// @notice Set of valid event IDs for Zupass users this defines 
    /// the events that are valid for Zupass users hence the allowlist 
    EnumerableSet.UintSet private VALID_EVENT_IDS;

    /// @notice Required number of valid event IDs for validation
    uint256 public requiredValidEventIds;

    /// @notice Maximum contribution amount for Zupass users
    uint256 public maxContributionAmountForZupass;

    /// @notice Maximum contribution amount for non-Zupass users
    uint256 public maxContributionAmountForNonZupass;

    /// @notice Struct holding deployed Poll contracts
    ClonableMACI.PollContracts public _pollContracts;

    /// @notice Address of the MACI factory contract
    address public maciFactory;

    /// ======================
    /// ======= Structs ======
    /// ======================

    /// @notice Struct to hold MACI parameters
    struct MaciParams {
        address coordinator;
        PubKey coordinatorPubKey;
        address maciFactory;
        address verifier;
        uint8 maciId;
        uint256[] validEventIds;
        uint256 requiredValidEventIds;
        uint256 maxContributionAmountForZupass;
        uint256 maxContributionAmountForNonZupass;
    }

    /// @notice Struct to hold initialization parameters for MACI
    struct InitializeParamsMACI {
        InitializeParams initializeParams;
        MaciParams maciParams;
    }

    /// @notice Struct to hold details for claiming funds
    struct claimFunds {
        uint256 voteOptionIndex;
        uint256 spent;
        uint256[][] spentProof;
        uint256 spentSalt;
        uint256 resultsCommitment;
        uint256 spentVoiceCreditsCommitment;
    }

    /// ====================================
    /// ========== Constructor =============
    /// ====================================

    /// @notice Constructor to initialize the strategy with Allo address and name
    constructor(address _allo, string memory _name) QFMACIBase(_allo, _name) {}

    /// ====================================
    /// =========== Initialize =============
    /// ====================================

    /// @notice Initialize the strategy
    /// @param _poolId The ID of the pool
    /// @param _data The initialization data for the strategy
    function initialize(uint256 _poolId, bytes memory _data) external virtual override onlyAllo {
        InitializeParamsMACI memory _initializeParams = abi.decode(_data, (InitializeParamsMACI));
        __QFMACIStrategy_init(_poolId, _initializeParams);
        emit Initialized(_poolId, _data);
    }

    /// @notice Internal initialize function
    /// @param _poolId The ID of the pool
    /// @param _params The initialize params for the strategy
    function __QFMACIStrategy_init(uint256 _poolId, InitializeParamsMACI memory _params) internal {
        __QFMACIBaseStrategy_init(_poolId, _params.initializeParams);

        address strategy = address(allo.getPool(_poolId).strategy);
        coordinator = _params.maciParams.coordinator;
        verifier = IVerifier(_params.maciParams.verifier);

        for (uint256 i = 0; i < _params.maciParams.validEventIds.length; i++) {
            VALID_EVENT_IDS.add(_params.maciParams.validEventIds[i]);
        }

        if (_params.maciParams.validEventIds.length < _params.maciParams.requiredValidEventIds) {
            revert INVALID();
        }

        requiredValidEventIds = _params.maciParams.requiredValidEventIds;
        maxContributionAmountForZupass = _params.maciParams.maxContributionAmountForZupass;
        maxContributionAmountForNonZupass = _params.maciParams.maxContributionAmountForNonZupass;

        _maci = ClonableMACIFactory(_params.maciParams.maciFactory).createMACI(
            strategy,
            strategy,
            coordinator,
            _params.maciParams.maciId
        );

        uint256 _pollDuration = _params.initializeParams.allocationEndTime - block.timestamp;

        _pollContracts = ClonableMACI(_maci).deployPoll(
            _pollDuration,
            _params.maciParams.coordinatorPubKey
        );

        maciFactory = _params.maciParams.maciFactory;
    }

    /// =======================================
    /// ====== Allo related functions =========
    /// =======================================

    /// @notice Allocate votes to a recipient
    /// @param _data The data
    /// @param _sender The sender of the transaction
    function _allocate(bytes memory _data, address _sender) internal override {
        (
            PubKey memory pubKey,
            uint256 amount,
            uint256[2] memory _pA,
            uint256[2][2] memory _pB,
            uint256[2] memory _pC,
            uint256[38] memory _pubSignals
        ) = abi.decode(_data, (PubKey, uint256, uint256[2], uint256[2][2], uint256[2], uint256[38]));

        if (isAddressZero(_maci)) revert MaciNotSet();
        if (isFinalized) revert RoundAlreadyFinalized();
        if (contributorCredits[_sender] != 0) revert AlreadyContributed();
        if (amount > MAX_VOICE_CREDITS * voiceCreditFactor) revert ContributionAmountTooLarge();

        // Validate the proof of attendance if proof of attendance is provided
        if (_pA[0] != 0) {
            validateProofOfAttendance(_pA, _pB, _pC, _pubSignals);
            if (amount > maxContributionAmountForZupass) {
                revert ContributionAmountTooLarge();
            }
        } else {
            if (amount > maxContributionAmountForNonZupass) {
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
        contributorCredits[_sender] = voiceCredits;
        totalContributed += amount;

        bytes memory signUpGatekeeperData = abi.encode(_sender, voiceCredits);
        bytes memory initialVoiceCreditProxyData = abi.encode(_sender);

        ClonableMACI(_maci).signUp(pubKey, signUpGatekeeperData, initialVoiceCreditProxyData);

        emit Allocated(address(0), amount, token, _sender);
    }

    /// @notice Distribute the tokens to the recipients
    /// @notice Distribute the tokens to the recipients
    /// @dev The "_sender" must be a pool manager and 
    /// the allocation period must have ended
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

    /// @notice Distribute the funds to the recipients
    /// @param _claim The claim funds
    function _distributeFunds(bytes memory _claim) internal {
        claimFunds memory claim = abi.decode(_claim, (claimFunds));

        uint256 index = claim.voteOptionIndex;
        address recipientId = recipientIndexToAddress[index];
        Recipient memory recipient = _recipients[recipientId];

        uint256 amount = getAllocatedAmount(recipient.totalVotesReceived, claim.spent);

        claim.voteOptionIndex = recipientToVoteIndex[recipientId];
        verifyClaim(claim);

        if (!_validateDistribution(index) || !_isAcceptedRecipient(recipientId) || amount == 0) {
            revert RECIPIENT_ERROR(recipientId);
        }

        IAllo.Pool memory pool = allo.getPool(poolId);

        _transferAmount(pool.token, recipientId, amount);

        _setDistributed(index);

        emit Distributed(recipientId, recipient.recipientAddress, amount, address(0));
    }

    /// =======================================
    /// ====== MACI related functions =========
    /// =======================================

    /// @notice Register user for voting
    /// @dev Only the MACI contract can register users
    /// called after calling _allocation function in the
    /// MACI contract using the SignUp function 
    /// @param _data Encoded address of a contributor
    function register(address /*_caller*/ , bytes memory _data) external view {
        if (msg.sender != _maci) {
            revert OnlyMaciCanRegisterVoters();
        }

        address user = abi.decode(_data, (address));

        bool verified = contributorCredits[user] > 0;

        if (!verified) {
            revert UserNotVerified();
        }
    }

    /// @notice Add and verify tally results by batch
    /// @param _voteOptionIndices Vote option indices
    /// @param _tallyResults The results of vote tally for the recipients
    /// @param _tallyResultProofs Proofs of correctness of the vote tally results
    /// @param _tallyResultSalt The salt
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
    /// @param _voteOptionIndex Vote option index
    /// @param _tallyResult The results of vote tally for the recipients
    /// @param _tallyResultProof Proofs of correctness of the vote tally results
    /// @param _tallyResultSalt The salt
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

        totalRecipientVotes += _tallyResult;
        totalVotesSquares = totalVotesSquares + (_tallyResult * _tallyResult);

        _tallyRecipientVotes(_voteOptionIndex, _tallyResult);

        emit TallyResultsAdded(_voteOptionIndex, _tallyResult);
    }

    /// @notice Tally votes to a recipient
    /// @param _voteOptionIndex The vote option index
    /// @param _voiceCreditsToAllocate The voice credits to allocate
    function _tallyRecipientVotes(
        uint256 _voteOptionIndex,
        uint256 _voiceCreditsToAllocate
    ) internal {
        address recipientId = recipientIndexToAddress[_voteOptionIndex];
        Recipient storage recipient = _recipients[recipientId];

        if (recipient.tallyVerified) {
            return;
        }

        recipient.tallyVerified = true;

        if (!_isAcceptedRecipient(recipientId)) return;

        if (_voiceCreditsToAllocate == 0) return;

        recipient.totalVotesReceived = _voiceCreditsToAllocate;

        emit TallyResultsAdded(_voteOptionIndex, _voiceCreditsToAllocate);
    }

    /// @notice Publish the IPFS hash of the vote tally
    /// @param _tallyHash IPFS hash of the vote tally
    function publishTallyHash(string calldata _tallyHash) external onlyCoordinator onlyAfterAllocation {
        if (isFinalized) {
            revert RoundAlreadyFinalized();
        }
        if (bytes(_tallyHash).length == 0) {
            revert EmptyTallyHash();
        }

        tallyHash = _tallyHash;
        emit TallyPublished(_tallyHash);
    }

    /// @notice Finalize the results and allow recipients to claim funds
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
        uint256 _poolAmount = _getBalance(allo.getPool(poolId).token, address(this));
        alpha = calcAlpha(_poolAmount, totalVotesSquares, _totalSpent);
        matchingPoolSize = _poolAmount - _totalSpent * voiceCreditFactor;
        isFinalized = true;
    }

    /// @notice Claim allocated tokens
    /// @param __claimFunds The claim funds
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

    /**
    * @dev Reset tally results. This should only be used if the tally script
    * failed to proveOnChain due to unexpected error processing MACI logs
    */
    function resetTally() external onlyCoordinator onlyAfterAllocation {
        if (isAddressZero(address(_maci))) revert MaciNotSet();
        if (isFinalized) {
            revert RoundAlreadyFinalized();
        }

        (Poll poll, Tally tally) = getMaciContracts();

        address verifier = address(tally.verifier());
        address vkRegistry = address(tally.vkRegistry());

        address mp = ClonableMACIFactory(maciFactory).deployMessageProcessor(verifier, vkRegistry, address(poll), coordinator);
        address newTally = ClonableMACIFactory(maciFactory).deployTally(verifier, vkRegistry, address(poll), mp, coordinator);
        
        _pollContracts.tally = newTally;
        _pollContracts.messageProcessor = mp;
    }

    /// @notice Withdraw contributed funds for a list of contributors if the round has been cancelled
    /// @param _contributors List of contributor addresses
    /// @return result Array of results indicating success or failure of withdrawals
    function withdrawContributions(address[] memory _contributors) public returns (bool[] memory result) {
        if (!isCancelled) {
            revert RoundNotCancelled();
        }

        result = new bool[](_contributors.length);
        for (uint256 i = 0; i < _contributors.length; i++) {
            address contributor = _contributors[i];
            uint256 amount = contributorCredits[contributor] * voiceCreditFactor;
            if (amount > 0) {
                contributorCredits[contributor] = 0;
                if (allo.getPool(poolId).token != NATIVE) {
                    _transferAmountFrom(allo.getPool(poolId).token, TransferData(address(this), contributor, amount));
                } else {
                    _transferAmountFrom(NATIVE, TransferData(address(this), contributor, amount));
                }
                result[i] = true;
            } else {
                result[i] = false;
            }
        }
    }

    /// @notice Withdraw contributed funds by the caller
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

    /// ===========================
    /// ==== Zupass Functions =====
    /// ===========================

    /// @notice Validate event IDs
    /// @param _pubSignals Public signals from the proof
    function validateEventIds(uint256[38] memory _pubSignals) internal view {
        uint256 numberOfValidEventIDs = getAmountOfValidEventIDsFromPublicSignals(_pubSignals);
        if (requiredValidEventIds > numberOfValidEventIDs) revert NotEnoughValidEventIDs();
    }

    /// @notice Get the amount of valid event IDs from public signals
    /// @param _pubSignals Public signals from the proof
    /// @return The number of valid event IDs
    function getAmountOfValidEventIDsFromPublicSignals(uint256[38] memory _pubSignals) internal view returns (uint256) {
        uint256 validEvents;
        for (uint256 i = 0; i < VALID_EVENT_IDS.length(); i++) {
            uint256 currEvent = _pubSignals[15 + i];
            if (VALID_EVENT_IDS.contains(currEvent)) {
                validEvents++;
            }
        }
        return validEvents;
    }

    /// @notice Validate the signer of the proof
    /// @param _pubSignals Public signals from the proof
    function validateSigner(uint256[38] memory _pubSignals) internal pure {
        uint256[2] memory signer = [_pubSignals[13], _pubSignals[14]];
        if (signer[0] != ZUPASS_SIGNER_G1 || signer[1] != ZUPASS_SIGNER_G2) revert InvalidSigner();
    }

    /// @notice Validate proof of attendance
    /// @param _pA Proof A
    /// @param _pB Proof B
    /// @param _pC Proof C
    /// @param _pubSignals Public signals from the proof
    function validateProofOfAttendance(
        uint256[2] memory _pA,
        uint256[2][2] memory _pB,
        uint256[2] memory _pC,
        uint256[38] memory _pubSignals
    ) internal {
        if (!verifier.verifyProof(_pA, _pB, _pC, _pubSignals)) {
            revert InvalidProof();
        }

        validateEventIds(_pubSignals);
        validateSigner(_pubSignals);

        uint256 publicSignalsHash = _pubSignals[9];
        if (usedPublicSignals[publicSignalsHash]) revert AlreadyUsedZupass();
        usedPublicSignals[publicSignalsHash] = true;
    }

    /// @notice Get the whitelisted events
    /// @return Array of whitelisted events
    function getWhitelistedEvents() external view returns (uint256[] memory) {
        return VALID_EVENT_IDS.values();
    }

    /// =========================
    /// ==== Util Functions =====
    /// =========================

    /// @notice Check if an address is zero
    /// @param _address The address to check
    /// @return True if the address is zero, otherwise false
    function isAddressZero(address _address) internal pure returns (bool) {
        return _address == address(0);
    }
}
