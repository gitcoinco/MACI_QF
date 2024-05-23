// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.20;

// Interfaces
import {IAllo} from "../../../core/interfaces/IAllo.sol";

import {IRegistry} from "../../../core/interfaces/IRegistry.sol";

// Interfaces
import {IStrategy} from "../../../core/interfaces/IStrategy.sol";

// Internal Libraries
import {Metadata} from "../../../core/libraries/Metadata.sol";

// External Libraries
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Constants {

    mapping(uint256 => bool) public usedPublicSignals;

    // Constants
    uint256 public constant MAX_VOICE_CREDITS = 10 ** 9; // MACI allows 2 ** 32 voice credits max
    uint256 public constant MAX_CONTRIBUTION_AMOUNT = 10 ** 4; // In tokens
    uint256 public constant ALPHA_PRECISION = 10 ** 18; // to account for loss of precision in division

	// This is hex to bigint conversion for Zupass signer
	uint256 public constant ZUPASS_SIGNER_G1 = 2658696990997679927259430495938453033612384821046330804164935913637421782846;
    uint256 public constant ZUPASS_SIGNER_G2 = 18852953264765021758165045442761617487242246681540213362114332008455443692095;

    /// ======================
    /// ======= Errors ======
    /// ======================
    error NotCoordinator();
    error MaciNotSet();
    error RoundAlreadyFinalized();
    error VotesNotTallied();
    error TallyHashNotPublished();
    error IncompleteTallyResults(uint256 total, uint256 actual);
    error NoVotes();
    error OnlyMaciCanRegisterVoters();
    error UserNotVerified();
    error EmptyTallyHash();
    error IncorrectSpentVoiceCredits();
    error IncorrectTallyResult();
    error IncorrectPerVOSpentVoiceCredits();
    error VoteResultsAlreadyVerified();
    error InvalidAmount();
    error AlreadyContributed();
    error ContributionAmountTooLarge();
    error NoProjectHasMoreThanOneVote();
    error InvalidBudget();
    error InvalidSigner();
    error InvalidProof();
    error AlreadyUsedZupass();
    error NotEnoughValidEventIDs();

    error RoundNotCancelled();
    error RoundCancelled();
    error RoundNotFinalized();
    error NothingToWithdraw();
    error ContributionWithdrawn();


    /// ======================
    /// ======= Events ======
    /// ======================

    /// @notice Emitted when a recipient updates their registration
    /// @param recipientId Id of the recipient
    /// @param data The encoded data - (address recipientId, address recipientAddress, Metadata metadata)
    /// @param sender The sender of the transaction
    /// @param status The updated status of the recipient
    event UpdatedRegistration(address indexed recipientId, bytes data, address sender, uint8 status);

    /// @notice Emitted when a recipient is registered and the status is updated
    /// @param rowIndex The index of the row in the bitmap
    /// @param fullRow The value of the row
    /// @param sender The sender of the transaction
    event RecipientStatusUpdated(uint256 indexed rowIndex, uint256 fullRow, address sender);


    /// @notice Emitted when funds are distributed to a recipient
    /// @param amount The amount of tokens distributed
    /// @param grantee The address of the recipient
    /// @param token The address of the token
    /// @param recipientId The id of the recipient
    event FundsDistributed(uint256 amount, address grantee, address indexed token, address indexed recipientId);

    /// @notice Emitted when a recipient is registered
    /// @param recipientId ID of the recipient
    /// @param applicationId ID of the recipient"s application
    /// @param status The status of the recipient
    /// @param sender The sender of the transaction
    event RecipientStatusUpdated(
        address indexed recipientId,
        uint256 applicationId,
        IStrategy.Status status,
        address sender
    );

    /// @notice Emitted when a recipient is reviewed
    /// @param recipientId ID of the recipient
    /// @param applicationId ID of the recipient"s application
    /// @param status The status of the recipient
    /// @param sender The sender of the transaction
    event Reviewed(
        address indexed recipientId,
        uint256 applicationId,
        IStrategy.Status status,
        address sender
    );

    /// @notice Emitted when a recipient updates their registration
    /// @param recipientId ID of the recipient
    /// @param applicationId ID of the recipient"s application
    /// @param data The encoded data - (address recipientId, address recipientAddress, Metadata metadata)
    /// @param sender The sender of the transaction
    /// @param status The updated status of the recipient
    event UpdatedRegistration(
        address indexed recipientId,
        uint256 applicationId,
        bytes data,
        address sender,
        IStrategy.Status status
    );

    /// @notice Emitted when a recipient is added
    /// @param recipientId ID of the recipient
    /// @param recipientIndex ID of the recipient"s MACI voting option
    event RecipientVotingOptionAdded(address recipientId, uint256 recipientIndex);

    /// @notice Emitted when the tally hash is published
    /// @param tallyHash The IPFS hash of the tally
    event TallyPublished(string tallyHash);

    event TallyResultsAdded(uint256 indexed voteOptionIndex, uint256 tally);

    /// @notice Emitted when the pool timestamps are updated
    /// @param registrationStartTime The start time for the registration
    /// @param registrationEndTime The end time for the registration
    /// @param allocationStartTime The start time for the allocation
    /// @param allocationEndTime The end time for the allocation
    /// @param sender The sender of the transaction
    event TimestampsUpdated(
        uint64 registrationStartTime,
        uint64 registrationEndTime,
        uint64 allocationStartTime,
        uint64 allocationEndTime,
        address sender
    );
}

interface IVerifier {
    function verifyProof(
        uint[2] memory _pA,
        uint[2][2] memory _pB,
        uint[2] memory _pC,
        uint[38] memory _pubSignals
    ) external view returns (bool);
}
