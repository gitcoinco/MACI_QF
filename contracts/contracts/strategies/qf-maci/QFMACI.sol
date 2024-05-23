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
import {IAllo, IERC20, IVerifier} from "./interfaces/Constants.sol";

import {QFMACIBase} from "./QFMACIBase.sol";

// ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣾⣿⣷⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣼⣿⣿⣷⣄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⣿⣿⣿⣗⠀⠀⠀⢸⣿⣿⣿⡯⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
// ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣿⣿⣿⣿⣷⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣼⣿⣿⣿⣿⣿⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⣿⣿⣿⣗⠀⠀⠀⢸⣿⣿⣿⡯⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
// ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⣿⣿⣿⣿⣿⣿⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣸⣿⣿⣿⢿⣿⣿⣿⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⣿⣿⣿⣗⠀⠀⠀⢸⣿⣿⣿⡯⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
// ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⣿⣿⣿⣿⣿⣿⣿⣄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣰⣿⣿⣿⡟⠘⣿⣿⣿⣷⡀⠀⠀⠀⠀⠀⠀⠀⠀⢸⣿⣿⣿⣗⠀⠀⠀⢸⣿⣿⣿⡯⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
// ⠀⠀⠀⠀⠀⠀⠀⠀⣀⣴⣾⣿⣿⣿⣿⣾⠻⣿⣿⣿⣿⣿⣿⣿⡆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⣿⣿⣿⡿⠀⠀⠸⣿⣿⣿⣧⠀⠀⠀⠀⠀⠀⠀⠀⢸⣿⣿⣿⣗⠀⠀⠀⢸⣿⣿⣿⡯⠀⠀⠀⠀⠀⠀⢀⣠⣴⣴⣶⣶⣶⣦⣦⣀⡀⠀⠀⠀⠀⠀⠀
// ⠀⠀⠀⠀⠀⠀⠀⣴⣿⣿⣿⣿⣿⣿⡿⠃⠀⠙⣿⣿⣿⣿⣿⣿⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⣿⣿⣿⣿⠁⠀⠀⠀⢻⣿⣿⣿⣧⠀⠀⠀⠀⠀⠀⠀⢸⣿⣿⣿⣗⠀⠀⠀⢸⣿⣿⣿⡯⠀⠀⠀⠀⣠⣾⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣶⡀⠀⠀⠀⠀
// ⠀⠀⠀⠀⠀⢀⣾⣿⣿⣿⣿⣿⣿⡿⠁⠀⠀⠀⠘⣿⣿⣿⣿⣿⡿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣾⣿⣿⣿⠃⠀⠀⠀⠀⠈⢿⣿⣿⣿⣆⠀⠀⠀⠀⠀⠀⢸⣿⣿⣿⣗⠀⠀⠀⢸⣿⣿⣿⡯⠀⠀⠀⣰⣿⣿⣿⡿⠋⠁⠀⠀⠈⠘⠹⣿⣿⣿⣿⣆⠀⠀⠀
// ⠀⠀⠀⠀⢀⣾⣿⣿⣿⣿⣿⣿⡿⠀⠀⠀⠀⠀⠀⠈⢿⣿⣿⣿⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣾⣿⣿⣿⠏⠀⠀⠀⠀⠀⠀⠘⣿⣿⣿⣿⡄⠀⠀⠀⠀⠀⢸⣿⣿⣿⣗⠀⠀⠀⢸⣿⣿⣿⡯⠀⠀⢰⣿⣿⣿⣿⠁⠀⠀⠀⠀⠀⠀⠀⠘⣿⣿⣿⣿⡀⠀⠀
// ⠀⠀⠀⢠⣿⣿⣿⣿⣿⣿⣿⣟⠀⡀⢀⠀⡀⢀⠀⡀⢈⢿⡟⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣼⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡄⠀⠀⠀⠀⢸⣿⣿⣿⣗⠀⠀⠀⢸⣿⣿⣿⡯⠀⠀⢸⣿⣿⣿⣗⠀⠀⠀⠀⠀⠀⠀⠀⠀⣿⣿⣿⣿⡇⠀⠀
// ⠀⠀⣠⣿⣿⣿⣿⣿⣿⡿⠋⢻⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⣶⣄⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣸⣿⣿⣿⡿⢿⠿⠿⠿⠿⠿⠿⠿⠿⠿⢿⣿⣿⣿⣷⡀⠀⠀⠀⢸⣿⣿⣿⣗⠀⠀⠀⢸⣿⣿⣿⡯⠀⠀⠸⣿⣿⣿⣷⡀⠀⠀⠀⠀⠀⠀⠀⢠⣿⣿⣿⣿⠂⠀⠀
// ⠀⠀⠙⠛⠿⠻⠻⠛⠉⠀⠀⠈⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⣄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣰⣿⣿⣿⣿⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢿⣿⣿⣿⣧⠀⠀⠀⢸⣿⣿⣿⣗⠀⠀⠀⢸⣿⣿⣿⡯⠀⠀⠀⢻⣿⣿⣿⣷⣀⢀⠀⠀⠀⡀⣰⣾⣿⣿⣿⠏⠀⠀⠀
// ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠛⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⢰⣿⣿⣿⣿⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⣿⣿⣿⣿⣧⠀⠀⢸⣿⣿⣿⣗⠀⠀⠀⢸⣿⣿⣿⡯⠀⠀⠀⠀⠹⢿⣿⣿⣿⣿⣾⣾⣷⣿⣿⣿⣿⡿⠋⠀⠀⠀⠀
// ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠙⠙⠋⠛⠙⠋⠛⠙⠋⠛⠙⠋⠃⠀⠀⠀⠀⠀⠀⠀⠀⠠⠿⠻⠟⠿⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠸⠟⠿⠟⠿⠆⠀⠸⠿⠿⠟⠯⠀⠀⠀⠸⠿⠿⠿⠏⠀⠀⠀⠀⠀⠈⠉⠻⠻⡿⣿⢿⡿⡿⠿⠛⠁⠀⠀⠀⠀⠀⠀
//                    allo.gitcoin.co

contract QFMACI is QFMACIBase, DomainObjs, Params {
    using EnumerableSet for EnumerableSet.UintSet;

    /// ======================
    /// ======= Storage ======
    /// ======================

    // This are DevConnect events UUIDs converted to bigint
    EnumerableSet.UintSet private VALID_EVENT_IDS;

    uint256 public requiredValidEventIds;

    uint256 public maxContributionAmountForZupass;

    uint256 public maxContributionAmountForNonZupass;

    ClonableMACI.PollContracts public _pollContracts;

    address public maciFactory;

    // It may not be necessary to store TODO
    // PubKey public coordinatorPubKey; // coordinator public key

    /// ======================
    /// ======= Structs ======
    /// ======================

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

    struct InitializeParamsMACI {
        InitializeParams initializeParams;
        MaciParams maciParams;
    }

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

    constructor(address _allo, string memory _name) QFMACIBase(_allo, _name) {}

    /// ====================================
    /// =========== Initialize =============
    /// ====================================

    /// @notice Initialize the strategy
    /// @param _poolId The ID of the pool
    /// @param _data The initialization data for the strategy
    /// @custom:data (InitializeParamsSimple)
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

        for (uint i = 0; i < _params.maciParams.validEventIds.length; ) {
            VALID_EVENT_IDS.add(_params.maciParams.validEventIds[i]);
            unchecked {
                i++;
            }
        }

        // If the number of valid event ids is less than the required number of valid event ids
        // Prevent the strategy from initializing
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
    /// @dev Only the pool manager(s) can call this function
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

    // TODO are we going to allow anyone to distribute the funds? or only the pool manager?
    /// @notice Distribute the tokens to the recipients
    /// @dev The "_sender" must be a pool manager and the allocation must have ended
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

        // This allows 125 accepted recipients to claim funds instead of 125 recipients
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

    /**
     * @dev Register user for voting.
     * This function is part of SignUpGatekeeper interface.
     * @param _data Encoded address of a contributor.
     */
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

    /**
     * @dev Add and verify tally results by batch.
     * @param _voteOptionIndices Vote option index.
     * @param _tallyResults The results of vote tally for the recipients.
     * @param _tallyResultProofs Proofs of correctness of the vote tally results.
     * @param _tallyResultSalt the respective salt in the results object in the tally.json
     * @param _spentVoiceCreditsHashes hashLeftRight(number of spent voice credits, spent salt)
     * @param _perVOSpentVoiceCreditsHashes hashLeftRight(merkle root of the no spent voice credits per vote option, perVOSpentVoiceCredits salt)
     */
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

    /**
     * @dev Add and verify tally votes and calculate sum of tally squares for alpha calculation.
     * @param _voteOptionIndex Vote option index.
     * @param _tallyResult The results of vote tally for the recipients.
     * @param _tallyResultProof Proofs of correctness of the vote tally results.
     * @param _tallyResultSalt the respective salt in the results object in the tally.json
     * @param _spentVoiceCreditsHash hashLeftRight(number of spent voice credits, spent salt)
     * @param _perVOSpentVoiceCreditsHash hashLeftRight(merkle root of the no spent voice credits per vote option, perVOSpentVoiceCredits salt)
     */
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

    /// @notice _tallyRecipientVotes votes to a recipient
    /// @param _voteOptionIndex The vote option index
    /// @param _voiceCreditsToAllocate The voice credits to allocate
    /// @dev Only the pool manager(s) can call this function
    function _tallyRecipientVotes(
        uint256 _voteOptionIndex,
        uint256 _voiceCreditsToAllocate
    ) internal {
        address recipientId = recipientIndexToAddress[_voteOptionIndex];

        // spin up the structs in storage for updating
        Recipient storage recipient = _recipients[recipientId];

        // check if the recipient has already been tallied
        // if they have, we don't want to tally them again
        if (recipient.tallyVerified) {
            return;
        }

        recipient.tallyVerified = true;

        // check that the recipient is accepted
        // if they are not, we don't want to tally them
        if (!_isAcceptedRecipient(recipientId)) return;

        // check the `_voiceCreditsToAllocate` is > 0
        // We don't want to allocate 0 voice credits
        if (_voiceCreditsToAllocate == 0) return;

        recipient.totalVotesReceived = _voiceCreditsToAllocate;

        // emit the event with the vote results
        emit TallyResultsAdded(_voteOptionIndex, _voiceCreditsToAllocate);
    }

    /**
     * @dev Publish the IPFS hash of the vote tally. Only coordinator can publish.
     * @param _tallyHash IPFS hash of the vote tally.
     */
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

    /**
     * @dev Get the total amount of votes from MACI,
     * verify the total amount of spent voice credits across all recipients,
     * calculate the quadratic alpha value,
     * and allow recipients to claim funds.
     * @param _totalSpent Total amount of spent voice credits.
     * @param _totalSpentSalt The salt.
     */
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

        // If nobody voted, the round should be cancelled to avoid locking of matching funds
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

        // Total amount of spent voice credits is the size of the pool of direct rewards.
        // Everything else, including unspent voice credits and downscaling error,
        // is considered a part of the matching pool
        alpha = calcAlpha(_poolAmount, totalVotesSquares, _totalSpent);

        matchingPoolSize = _poolAmount - _totalSpent * voiceCreditFactor;

        isFinalized = true;
    }

    /**
     * @dev Claim allocated tokens.
     * @param __claimFunds Vote option index.
     */
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
    function resetTally()
        external
        onlyCoordinator
        onlyAfterAllocation()
    {
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
        // TODO Does this one needs to get updated ?
        _pollContracts.messageProcessor = mp;
    }

    /**
        * @dev Withdraw contributed funds for a list of contributors if the round has been cancelled.
    */
    function withdrawContributions(address[] memory _contributors)
        public
        returns (bool[] memory result)
    {
        if (!isCancelled) {
            revert RoundNotCancelled();
        }

        result = new bool[](_contributors.length);
        // Reconstruction of exact contribution amount from VCs may not be possible due to a loss of precision
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

    /**
        * @dev Withdraw contributed funds by the caller.
        */
    function withdrawContribution()
        external
    {
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

    function validateEventIds(uint256[38] memory _pubSignals) internal view {
        uint256 numberOfValidEventIDs = getAmountOfValidEventIDsFromPublicSignals(_pubSignals);

        if (requiredValidEventIds > numberOfValidEventIDs) revert NotEnoughValidEventIDs();
    }

    // Numbers of events is arbitary but for this example we are using 10 (including test eventID)
    // TODO make this accept a dynamic number of events or at least X valid events
    function getAmountOfValidEventIDsFromPublicSignals(
        uint256[38] memory _pubSignals
    ) internal view returns (uint256) {
        // Events are stored from starting index 15 to till valid event ids length
        uint256 validEvents;
        for (uint256 i = 0; i < VALID_EVENT_IDS.length(); i++) {
            uint256 currEvent = _pubSignals[15 + i];
            if (VALID_EVENT_IDS.contains(currEvent)) {
                validEvents++;
            }
        }
        return validEvents;
    }

    function validateSigner(uint256[38] memory _pubSignals) internal pure {
        // getting the Zupass Signer From the Public Signals
        uint256[2] memory signer = [_pubSignals[13], _pubSignals[14]];
        if (signer[0] != ZUPASS_SIGNER_G1 || signer[1] != ZUPASS_SIGNER_G2) revert InvalidSigner();
    }

    function validateProofOfAttendance(
        uint[2] memory _pA,
        uint[2][2] memory _pB,
        uint[2] memory _pC,
        uint[38] memory _pubSignals
    ) internal {
        if (!verifier.verifyProof(_pA, _pB, _pC, _pubSignals)) {
            revert InvalidProof();
        }

        validateEventIds(_pubSignals);

        validateSigner(_pubSignals);
        // Nullifier check on the 9th public signal which is the email of the user zupass
        uint256 publicSignalsHash = _pubSignals[9];

        // make sure that the 9th public signal is not used before and not equal to 21888242871839275222246405745257275088548364400416034343698204186575808495616
        if (usedPublicSignals[publicSignalsHash]) revert AlreadyUsedZupass();

        usedPublicSignals[publicSignalsHash] = true;
    }

    // @notice Get the whitelisted events
    function getWhitelistedEvents() external view returns (uint256[] memory) {
        return VALID_EVENT_IDS.values();
    }

    /// =========================
    /// ==== Util Functions =====
    /// =========================

    function isAddressZero(address _address) internal pure returns (bool) {
        return _address == address(0);
    }
}
