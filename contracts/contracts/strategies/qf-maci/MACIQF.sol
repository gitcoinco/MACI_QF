// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.20;

// MACI Contracts & Libraries
import {ClonableMACIFactory} from "../../ClonableMaciContracts/ClonableMACIFactory.sol";
import {DomainObjs} from "maci-contracts/contracts/utilities/DomainObjs.sol";
import {ClonableMACI} from "../../ClonableMaciContracts/ClonableMACI.sol";
import {Params} from "maci-contracts/contracts/utilities/Params.sol";
import {Tally} from "maci-contracts/contracts/Tally.sol";
import {Poll} from "maci-contracts/contracts/Poll.sol";

// OpenZeppelin
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

// Core Contracts
import {IAllo, IERC20, IZuPassVerifier} from "./interfaces/Constants.sol";
import {MACIQFBase} from "./MACIQFBase.sol";

/// @title MACIQF
/// @notice This contract handles the quadratic funding mechanism using MACI (Minimal Anti-Collusion Infrastructure).
/// It extends the MACIQFBase contract and integrates MACI-related functionalities.
contract MACIQF is MACIQFBase, DomainObjs, Params {
    using EnumerableSet for EnumerableSet.UintSet;

    /// ======================
    /// ======= Storage ======
    /// ======================

    /// @notice Set of valid event IDs
    EnumerableSet.UintSet private VALID_EVENT_IDS;

    /// @notice The required number of valid event IDs for a contribution
    uint256 public requiredValidEventIds;

    /// @notice The maximum contribution amount for users with Zupass
    uint256 public maxContributionAmountForZupass;

    /// @notice The maximum contribution amount for users without Zupass
    uint256 public maxContributionAmountForNonZupass;

    /// @notice Poll contracts for MACI
    ClonableMACI.PollContracts public _pollContracts;

    /// @notice Address of the MACI factory
    address public maciFactory;

    /// @notice The verifier contract instance
    IZuPassVerifier public zupassVerifier;

    /// ======================
    /// ======= Structs ======
    /// ======================

    /// @notice Parameters for initializing MACI
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

    /// @notice Initialization parameters for the strategy
    struct InitializeParamsMACI {
        InitializeParams initializeParams;
        MaciParams maciParams;
    }

    /// @notice Structure to claim funds
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

        address strategy = address(allo.getPool(_poolId).strategy);

        coordinator = _params.maciParams.coordinator;
        zupassVerifier = IZuPassVerifier(_params.maciParams.verifier);

        for (uint i = 0; i < _params.maciParams.validEventIds.length; ) {
            VALID_EVENT_IDS.add(_params.maciParams.validEventIds[i]);
            unchecked {
                i++;
            }
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
            _params.maciParams.coordinatorPubKey,
            Mode.QV
        );

        maciFactory = _params.maciParams.maciFactory;
    }

    /// =======================================
    /// ====== Allo Related Functions =========
    /// =======================================

    /// @notice Allocate votes to a recipient
    /// @param _data The data containing allocation details
    /// @param _sender The sender of the transaction
    function _allocate(bytes memory _data, address _sender) internal override {
        (
            PubKey memory pubKey,
            uint256 amount,
            uint[2] memory _pA,
            uint[2][2] memory _pB,
            uint[2] memory _pC,
            uint[38] memory _pubSignals
        ) = abi.decode(_data, (PubKey, uint256, uint[2], uint[2][2], uint[2], uint[38]));

        if (isAddressZero(_maci)) revert MaciNotSet();
        if (isFinalized) revert RoundAlreadyFinalized();
        if (contributorCredits[_sender] != 0) revert AlreadyContributed();
        if (amount > MAX_VOICE_CREDITS * voiceCreditFactor) revert ContributionAmountTooLarge();

        // Validate proof of attendance if provided
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

        if (!_validateDistribution(recipientId) || !_isAcceptedRecipient(recipientId) || amount == 0) {
            revert RECIPIENT_ERROR(recipientId);
        }

        paidOut[recipientId] = true;
        IAllo.Pool memory pool = allo.getPool(poolId);

        _transferAmount(pool.token, recipientId, amount);

        emit Distributed(recipientId, recipient.recipientAddress, amount, address(0));
    }

    /// =======================================
    /// ====== MACI Related Functions =========
    /// =======================================

    /// @notice Register a user for voting
    /// @dev This function is part of the SignUpGatekeeper interface
    /// @param _data Encoded address of a contributor
    function register(address /* _caller */, bytes memory _data) external view {
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

        totalRecipientVotes += _tallyResult;
        totalVotesSquares = totalVotesSquares + (_tallyResult * _tallyResult);

        _tallyRecipientVotes(_voteOptionIndex, _tallyResult);

        emit TallyResultsAdded(_voteOptionIndex, _tallyResult);
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

        recipient.tallyVerified = true;

        if (!_isAcceptedRecipient(recipientId)) return;
        if (_voiceCreditsToAllocate == 0) return;

        recipient.totalVotesReceived = _voiceCreditsToAllocate;

        emit TallyResultsAdded(_voteOptionIndex, _voiceCreditsToAllocate);
    }

    /// @notice Publish the IPFS hash of the vote tally. Only the coordinator can publish.
    /// @param _tallyHash IPFS hash of the vote tally.
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
    ) external onlyPoolManager(msg.sender) onlyAfterAllocation {
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

    /// @notice Reset the tally results
    function resetTally() external onlyCoordinator onlyAfterAllocation {
        if (isAddressZero(address(_maci))) revert MaciNotSet();
        if (isFinalized) revert RoundAlreadyFinalized();

        (Poll poll, Tally tally) = getMaciContracts();

        address verifier = address(tally.verifier());
        address vkRegistry = address(tally.vkRegistry());

        address mp = ClonableMACIFactory(maciFactory).deployMessageProcessor(verifier, vkRegistry, address(poll), coordinator, Mode.QV);
        address newTally = ClonableMACIFactory(maciFactory).deployTally(verifier, vkRegistry, address(poll), mp, coordinator, Mode.QV);

        _pollContracts.tally = newTally;
        _pollContracts.messageProcessor = mp;
    }

    /// @notice Withdraw contributed funds for a list of contributors if the round has been cancelled
    /// @param _contributors List of contributors
    /// @return result List of boolean results indicating success or failure for each contributor
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

    /// ===========================
    /// ==== Zupass Functions =====
    /// ===========================

    /// @notice Validate the event IDs from the public signals
    /// @param _pubSignals The public signals
    function validateEventIds(uint256[38] memory _pubSignals) internal view {
        uint256 numberOfValidEventIDs = getAmountOfValidEventIDsFromPublicSignals(_pubSignals);
        if (requiredValidEventIds > numberOfValidEventIDs) revert NotEnoughValidEventIDs();
    }

    /// @notice Get the amount of valid event IDs from the public signals
    /// @param _pubSignals The public signals
    /// @return The number of valid event IDs
    function getAmountOfValidEventIDsFromPublicSignals(
        uint256[38] memory _pubSignals
    ) internal view returns (uint256) {
        uint256 validEvents;
        for (uint256 i = 0; i < VALID_EVENT_IDS.length(); i++) {
            uint256 currEvent = _pubSignals[15 + i];
            if (VALID_EVENT_IDS.contains(currEvent)) {
                validEvents++;
            }
        }
        return validEvents;
    }

    /// @notice Validate the signer from the public signals
    /// @param _pubSignals The public signals
    function validateSigner(uint256[38] memory _pubSignals) internal pure {
        uint256[2] memory signer = [_pubSignals[13], _pubSignals[14]];
        if (signer[0] != ZUPASS_SIGNER_G1 || signer[1] != ZUPASS_SIGNER_G2) revert InvalidSigner();
    }

    /// @notice Validate proof of attendance
    /// @param _pA Proof part A
    /// @param _pB Proof part B
    /// @param _pC Proof part C
    /// @param _pubSignals The public signals
    function validateProofOfAttendance(
        uint[2] memory _pA,
        uint[2][2] memory _pB,
        uint[2] memory _pC,
        uint[38] memory _pubSignals
    ) internal {
        if (!zupassVerifier.verifyProof(_pA, _pB, _pC, _pubSignals)) {
            revert InvalidProof();
        }

        validateEventIds(_pubSignals);
        validateSigner(_pubSignals);

        uint256 publicSignalsHash = _pubSignals[9];

        if (usedPublicSignals[publicSignalsHash]) revert AlreadyUsedZupass();

        usedPublicSignals[publicSignalsHash] = true;
    }

    /// @notice Get the whitelisted events
    /// @return List of whitelisted event IDs
    function getWhitelistedEvents() external view returns (uint256[] memory) {
        return VALID_EVENT_IDS.values();
    }

    /// =========================
    /// ==== Util Functions =====
    /// =========================

    /// @notice Check if the given address is zero
    /// @param _address The address to check
    /// @return True if the address is zero, otherwise false
    function isAddressZero(address _address) internal pure returns (bool) {
        return _address == address(0);
    }
}