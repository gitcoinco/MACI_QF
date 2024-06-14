// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.20;

// Interfaces
import {IStrategy} from "../../core/interfaces/IStrategy.sol";

import {IRegistry} from "../../core/interfaces/IRegistry.sol";

import {IAllo} from "../../core/interfaces/IAllo.sol";

// Internal Libraries
import {Metadata} from "../../core/libraries/Metadata.sol";

import {BaseStrategy} from "../BaseStrategy.sol";

// External Libraries
// TODO - Do we really need this?
import {Multicall} from "@openzeppelin/contracts/utils/Multicall.sol";

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MACIQFBase
/// @notice This contract serves as the base for quadratic funding strategies that involve MACI.
/// It extends the BaseStrategy and Multicall contracts
abstract contract MACIQFBase is BaseStrategy, Multicall {
    /// ================================
    /// ========== Structs =============
    /// ================================

    /// @notice The parameters used to initialize the strategy
    struct InitializeParams {
        bool useRegistryAnchor;
        bool metadataRequired;
        uint64 registrationStartTime;
        uint64 registrationEndTime;
        uint64 allocationStartTime;
        uint64 allocationEndTime;
    }

    /// @notice The details of a recipient in the pool
    struct Recipient {
        bool useRegistryAnchor;
        address recipientAddress;
        Metadata metadata;
        uint256 totalVotesReceived;
        bool tallyVerified;
        Status status;
    }

    /// ======================
    /// ======= Events ======
    /// ======================

    /// @notice Emitted when a recipient is registered and the status is updated
    /// @param recipientId The recipientId
    /// @param status The status of the review
    /// @param sender The sender of the transaction
    event RecipientStatusUpdated(
        address indexed recipientId,
        IStrategy.Status status,
        address sender
    );

    /// @notice Emitted when a recipient updates their registration
    /// @param recipientId ID of the recipient
    /// @param data The encoded data - (address recipientId, address recipientAddress, Metadata metadata)
    /// @param sender The sender of the transaction
    /// @param status The updated status of the recipient
    event UpdatedRegistration(
        address indexed recipientId,
        bytes data,
        address sender,
        IStrategy.Status status
    );

    /// @notice Emitted when a recipient is added
    /// @param recipientId ID of the recipient
    /// @param recipientIndex ID of the recipient"s MACI voting option
    event RecipientVotingOptionAdded(address recipientId, uint256 recipientIndex);

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

    /// =====================
    /// ======= Errors ======
    /// =====================
    error NotCoordinator();
    error RoundAlreadyFinalized();
    error NoProjectHasMoreThanOneVote();
    error InvalidBudget();
    error MAX_RECIPIENTS_REACHED();

    /// ======================
    /// ======= Storage ======
    /// ======================

    /// @notice The total number of votes cast for all recipients
    uint256 public totalRecipientVotes;

    /// @notice The start and end times for registrations and allocations
    uint64 public registrationStartTime;
    uint64 public registrationEndTime;
    uint64 public allocationStartTime;
    uint64 public allocationEndTime;

    /// @notice Flag to indicate whether to use the registry anchor or not.
    bool public useRegistryAnchor;

    /// @notice Flag to indicate whether metadata is required or not.
    bool public metadataRequired;

    /// @notice The registry contract instance
    IRegistry private _registry;

    /// @notice The total number of accepted recipients
    uint256 public acceptedRecipientsCounter;

    /// @notice The maximum number of accepted recipients
    uint256 public maxAcceptedRecipients;

    /// @notice The voice credit factor for scaling
    uint256 public voiceCreditFactor;

    /// @notice The total squares of votes received
    uint256 public totalVotesSquares;

    /// @notice The size of the matching pool
    uint256 public matchingPoolSize;

    /// @notice The total amount contributed to the pool
    uint256 public totalContributed;

    /// @notice The total amount spent from the pool
    uint256 public totalSpent;

    /// @notice Flag to indicate if the pool has been finalized
    bool public isFinalized;

    /// @notice Flag to indicate if the pool has been cancelled
    bool public isCancelled;

    /// @notice The alpha value used in quadratic funding formula
    uint256 public alpha;

    /// @notice The address of the coordinator
    address public coordinator;

    /// @notice The hash of the tally
    string public tallyHash;

    /// @notice The MACI contract address
    address public _maci;

    // Constants
    uint256 public constant MAX_VOICE_CREDITS = 10 ** 9; // MACI allows 2 ** 32 voice credits max
    uint256 public constant MAX_CONTRIBUTION_AMOUNT = 10 ** 4; // In tokens
    uint256 public constant ALPHA_PRECISION = 10 ** 18; // to account for loss of precision in division

    /// @notice Mapping from vote index to recipient address
    mapping(uint256 => address) public recipientVoteIndexToAddress;

    /// @notice Mapping to track if the recipient has been paid out
    mapping(address => bool) public paidOut;

    /// @notice Mapping from recipient ID to recipient details
    mapping(address => Recipient) public _recipients;

    /// ================================
    /// ========== Modifiers ===========
    /// ================================

    /// @notice Ensures the caller is the coordinator
    modifier onlyCoordinator() {
        if (msg.sender != coordinator) {
            revert NotCoordinator();
        }
        _;
    }

    /// @notice Ensures the registration period is active
    modifier onlyActiveRegistration() {
        _checkOnlyActiveRegistration();
        _;
    }

    /// @notice Ensures the allocation period has ended
    modifier onlyAfterAllocation() {
        _checkOnlyAfterAllocation();
        _;
    }

    /// @notice Ensures the allocation period has not ended
    modifier onlyBeforeAllocationEnds() {
        _checkOnlyBeforeAllocationEnds();
        _;
    }

    /// ====================================
    /// ========== Constructor =============
    /// ====================================

    /// @notice Initializes the MACIQFBase contract
    /// @param _allo The address of the Allo contract
    /// @param _name The name of the strategy
    constructor(address _allo, string memory _name) BaseStrategy(_allo, _name) {}

    /// ====================================
    /// =========== Initialize =============
    /// ====================================

    /// @notice Internal initialize function
    /// @param _poolId The ID of the pool
    /// @param _params The initialization parameters for the strategy
    function __MACIQFBaseStrategy_init(uint256 _poolId, InitializeParams memory _params) internal {
        __BaseStrategy_init(_poolId);

        IAllo.Pool memory pool = allo.getPool(_poolId);
        uint256 tokenDecimals;
        if (address(pool.token) == NATIVE) {
            tokenDecimals = 10 ** 18;
        } else {
            tokenDecimals = 10 ** ERC20(pool.token).decimals();
        }
        // Calculate the voice credit factor
        voiceCreditFactor = (MAX_CONTRIBUTION_AMOUNT * tokenDecimals) / MAX_VOICE_CREDITS;
        voiceCreditFactor = voiceCreditFactor > 0 ? voiceCreditFactor : 1;

        // Set the updated timestamps
        registrationStartTime = _params.registrationStartTime;
        registrationEndTime = _params.registrationEndTime;
        allocationStartTime = _params.allocationStartTime;
        allocationEndTime = _params.allocationEndTime;

        useRegistryAnchor = _params.useRegistryAnchor;
        metadataRequired = _params.metadataRequired;
        _registry = allo.getRegistry();

        // Validate the timestamps
        _isPoolTimestampValid(
            registrationStartTime,
            registrationEndTime,
            allocationStartTime,
            allocationEndTime
        );

        // Emit an event indicating that the timestamps have been updated
        emit TimestampsUpdated(
            registrationStartTime,
            registrationEndTime,
            allocationStartTime,
            allocationEndTime,
            msg.sender
        );
    }

    /// ================================
    /// ====== External/Public =========
    /// ================================

    /// @notice Sets the status of recipients. Only allow the pool manager and only during the registration period
    /// This because the recipients are not allowed to change their status during the allocation period as this will
    /// affect the votes and the matching pool amount.
    /// @dev This function is used to set the status of recipients to either Accepted, Rejected or InReview
    /// @param recipients An array of recipient addresses
    /// @param _statuses An array of statuses corresponding to the recipients
    function reviewRecipients(
        address[] memory recipients,
        Status[] memory _statuses
    ) external onlyActiveRegistration onlyPoolManager(msg.sender) {
        uint256 length = recipients.length;

        if (length != _statuses.length) {
            revert INVALID();
        }

        for (uint256 i; i < length; ) {
            address recipientId = recipients[i];
            Recipient storage recipient = _recipients[recipientId];

            // If the recipient is not in review, skip the recipient
            // This is to prevent updating the status of a recipient that is not registered
            if (recipient.status == Status.None) {
                unchecked {
                    i++;
                }
                continue;
            }   

            // If the recipient is accepted, add them to the accepted recipients list
            // If the recipient is already accepted, do not add them again
            // This is to prevent adding the same recipient multiple times as a vote option
            if (_statuses[i] == Status.Accepted && recipient.status != Status.Accepted) {
                recipientVoteIndexToAddress[acceptedRecipientsCounter] = recipientId;

                emit RecipientVotingOptionAdded(recipientId, acceptedRecipientsCounter);

                unchecked {
                    acceptedRecipientsCounter++;
                }
            }
            // Update the status of the recipient
            recipient.status = _statuses[i];

            emit RecipientStatusUpdated(recipientId, _statuses[i], msg.sender);

            unchecked {
                i++;
            }
        }

        // Ensure the number of accepted recipients is less than the max accepted recipients
        // This is a limitation from MACI Circuits there are different circuits for different number of recipients
        // Hence the Max voting options which is [0, TREE_ARRITY ** VOTE_OPTION_TREE_DEPTH)
        if (acceptedRecipientsCounter > maxAcceptedRecipients) {
            revert MAX_RECIPIENTS_REACHED();
        }
    }

    /// @notice Withdraws tokens from the pool
    /// @param _token The token to withdraw
    function withdraw(address _token) external onlyPoolManager(msg.sender) {
        // If the token is not the pool token, transfer the token to the sender
        // This is to ensure that accidentally sent tokens can be withdrawn by the pool manager
        if (allo.getPool(poolId).token != _token) {
            _transferAmount(_token, msg.sender, _getBalance(_token, address(this)));
        } else {
            // Only if the pool is cancelled the funds can be withdrawn
            // Otherwise the funds will be taken from the winners of the pool
            if (!isCancelled) {
                revert INVALID();
            }
            // Transfer only the amount used in the matching pool and not the total balance
            // Which includes the contributions. This is to ensure if the round is cancelled
            // Contributors can withdraw their contributions.
            uint256 amount = _getBalance(_token, address(this)) - totalContributed;
            _transferAmount(_token, msg.sender, amount);        
        }        
    }

    /// @notice Allows the contract to receive native currency
    receive() external payable {}

    /// ====================================
    /// ============ Internal ==============
    /// ====================================

    /// @notice Checks if the timestamps are valid
    /// @dev This will revert if any of the timestamps are invalid. This is determined by the strategy
    /// and may vary from strategy to strategy. Checks if '_registrationStartTime' is greater than the '_registrationEndTime'
    /// or if '_registrationStartTime' is greater than the '_allocationStartTime' or if '_registrationEndTime'
    /// is greater than the '_allocationEndTime' or if '_allocationStartTime' is greater than the '_allocationEndTime'
    /// or if '_registrationEndTime' is greater than '_allocationStartTime'.
    /// If any of these conditions are true, this will revert.
    /// @param _registrationStartTime The start time for the registration
    /// @param _registrationEndTime The end time for the registration
    /// @param _allocationStartTime The start time for the allocation
    /// @param _allocationEndTime The end time for the allocation
    function _isPoolTimestampValid(
        uint64 _registrationStartTime,
        uint64 _registrationEndTime,
        uint64 _allocationStartTime,
        uint64 _allocationEndTime
    ) internal pure {
        if (
            _registrationStartTime > _registrationEndTime ||
            _allocationStartTime > _allocationEndTime ||
            // Added condition to ensure registrationEndTime cannot be greater than allocationStartTime
            // This is to prevent accepting a recipient after the allocation has started
            // Because in MACI votes are encrypted if a recipient is REJECTED after the allocation has started
            // the votes for that recipient will be wasted toghether with the matching funds of the contributors
            _registrationEndTime > _allocationStartTime
        ) {
            revert INVALID();
        }
    }

    /// @notice Returns the details of a recipient
    /// @param _recipientId The ID of the recipient
    /// @return The recipient details
    function getRecipient(address _recipientId) external view returns (Recipient memory) {
        return _recipients[_recipientId];
    }

    /// @notice Registers a recipient
    /// @param _data The data to be decoded
    /// @param _sender The sender of the transaction
    /// @return The ID of the recipient
    function _registerRecipient(
        bytes memory _data,
        address _sender
    ) internal override onlyActiveRegistration returns (address) {
        if (msg.value != 0) {
            revert INVALID();
        }

        bool isUsingRegistryAnchor;
        address recipientAddress;
        address registryAnchor;
        Metadata memory metadata;
        address recipientId;

        if (useRegistryAnchor) {
            (recipientId, recipientAddress, metadata) = abi.decode(
                _data,
                (address, address, Metadata)
            );
            if (!_isProfileMember(recipientId, _sender)) {
                revert UNAUTHORIZED();
            }
        } else {
            (registryAnchor, recipientAddress, metadata) = abi.decode(
                _data,
                (address, address, Metadata)
            );
            isUsingRegistryAnchor = registryAnchor != address(0);
            recipientId = isUsingRegistryAnchor ? registryAnchor : _sender;
            if (isUsingRegistryAnchor && !_isProfileMember(recipientId, _sender)) {
                revert UNAUTHORIZED();
            }
        }

        if (metadataRequired && (bytes(metadata.pointer).length == 0 || metadata.protocol == 0)) {
            revert INVALID_METADATA();
        }

        if (recipientAddress == address(0)) {
            revert RECIPIENT_ERROR(recipientId);
        }

        Recipient storage recipient = _recipients[recipientId];
        recipient.recipientAddress = recipientAddress;
        recipient.metadata = metadata;
        recipient.useRegistryAnchor = useRegistryAnchor ? true : isUsingRegistryAnchor;

        Status recipientStatus = recipient.status;

        if (recipientStatus == Status.None) {
            recipient.status = Status.InReview;
            emit Registered(recipientId, _data, _sender);
        } else {
            // If the recipient is in review, the recipient can update their registration
            // If the recipient is rejected, the recipient can appeal
            if (recipientStatus == Status.Rejected) {
                recipient.status = Status.Appealed;
            }
            emit UpdatedRegistration(recipientId, _data, _sender, recipient.status);
        }
        return recipientId;
    }

    /// @notice Cancels the funding round
    function cancel() external onlyCoordinator {
        if (isFinalized) {
            revert RoundAlreadyFinalized();
        }
        isFinalized = true;
        isCancelled = true;
    }

    /// =========================
    /// ==== View Functions =====
    /// =========================

    /// @notice Returns the total number of accepted recipients
    /// @return The total number of accepted recipients
    function getRecipientCount() external view returns (uint256) {
        return acceptedRecipientsCounter;
    }

    /// @notice Checks if the pool is active
    /// @return True if the pool is active, otherwise false
    function _isPoolActive() internal view override returns (bool) {
        return registrationStartTime <= block.timestamp && block.timestamp <= registrationEndTime;
    }

    /// @notice Checks if a recipient is accepted
    /// @param recipientId The ID of the recipient
    /// @return True if the recipient is accepted, otherwise false
    function _isAcceptedRecipient(address recipientId) public view returns (bool) {
        return _getRecipientStatus(recipientId) == Status.Accepted;
    }

    /// @notice Returns the status of a recipient
    /// @param _recipientId The ID of the recipient
    /// @return The status of the recipient
    function _getRecipientStatus(address _recipientId) internal view override returns (Status) {
        return _recipients[_recipientId].status;
    }

    /// @notice Ensures the registration period is active
    function _checkOnlyActiveRegistration() internal view {
        if (registrationStartTime > block.timestamp || block.timestamp > registrationEndTime) {
            revert REGISTRATION_NOT_ACTIVE();
        }
    }

    /// @notice Ensures the allocation period has ended
    function _checkOnlyAfterAllocation() internal view {
        if (block.timestamp <= allocationEndTime) {
            revert ALLOCATION_NOT_ENDED();
        }
    }

    /// @notice Ensures the allocation period has not ended
    function _checkOnlyBeforeAllocationEnds() internal view {
        if (block.timestamp > allocationEndTime) {
            revert ALLOCATION_NOT_ACTIVE();
        }
    }

    /// @notice Returns the payout summary for a recipient
    /// @param _recipientId The ID of the recipient
    /// @return _payoutSummary The payout summary
    function _getPayout(
        address _recipientId,
        bytes memory data
    ) internal view override returns (PayoutSummary memory _payoutSummary) {}

    /// @notice Ensures the pool amount can be increased
    function _beforeIncreasePoolAmount(uint256) internal view override {
        // Ensure the pool is not finalized
        // Otherwise the calc alpha will be outdated.
        if (isFinalized) {
            revert INVALID();
        }
    }

    /// @notice Checks if the sender is a profile member
    /// @param _anchor The profile anchor
    /// @param _sender The sender of the transaction
    /// @return True if the sender is a profile member, otherwise false
    function _isProfileMember(address _anchor, address _sender) internal view returns (bool) {
        IRegistry.Profile memory profile = _registry.getProfileByAnchor(_anchor);
        return _registry.isOwnerOrMemberOfProfile(profile.id, _sender);
    }

    /// @notice Validates the distribution for the payout
    /// @param _recipient The recipient address
    /// @return True if the distribution is valid, otherwise false
    function _validateDistribution(address _recipient) internal view returns (bool) {
        return !paidOut[_recipient];
    }

    /// ====================================
    /// ============ QF Helpers ============
    /// ====================================

    /// @notice From clr.fund
    /// @dev Calculate the alpha for the capital constrained quadratic formula
    /// in page 17 of https://arxiv.org/pdf/1809.06421.pdf
    /// @param _budget Total budget of the round to be distributed
    /// @param _totalVotesSquares Total of the squares of votes
    /// @param _totalSpent Total amount of spent voice credits
    /// @return _alpha value
    function calcAlpha(
        uint256 _budget,
        uint256 _totalVotesSquares,
        uint256 _totalSpent
    ) public view returns (uint256 _alpha) {
        // make sure budget = contributions + matching pool
        uint256 contributions = _totalSpent * voiceCreditFactor;

        if (_budget < contributions) {
            revert InvalidBudget();
        }

        // guard against division by zero.
        // This happens when no project receives more than one vote
        if (_totalVotesSquares <= _totalSpent) {
            revert NoProjectHasMoreThanOneVote();
        }

        return
            ((_budget - contributions) * ALPHA_PRECISION) /
            (voiceCreditFactor * (_totalVotesSquares - _totalSpent));
    }

    /// @notice Calculates the allocated token amount without verification
    /// @param _tallyResult The result of the vote tally for the recipient
    /// @param _spent The amount of voice credits spent on the recipient
    /// @return The allocated token amount
    function getAllocatedAmount(
        uint256 _tallyResult,
        uint256 _spent
    ) internal view returns (uint256) {
        uint256 quadratic = alpha * voiceCreditFactor * _tallyResult * _tallyResult;
        uint256 totalSpentCredits = voiceCreditFactor * _spent;
        uint256 linearPrecision = ALPHA_PRECISION * totalSpentCredits;
        uint256 linearAlpha = alpha * totalSpentCredits;
        return ((quadratic + linearPrecision) - linearAlpha) / ALPHA_PRECISION;
    }
}
