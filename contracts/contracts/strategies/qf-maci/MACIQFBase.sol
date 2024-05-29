// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.20;

// External Libraries
import { Constants, Metadata, IRegistry, IAllo } from "./interfaces/Constants.sol";
import { Multicall } from "@openzeppelin/contracts/utils/Multicall.sol";
import { BaseStrategy } from "../BaseStrategy.sol";

/// @title MACIQFBase
/// @notice This contract serves as the base for quadratic funding strategies that involve MACI.
/// It extends the BaseStrategy and Multicall contracts and utilizes Constants.
abstract contract MACIQFBase is BaseStrategy, Multicall, Constants {

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

    /// @notice Mapping from vote index to recipient address
    mapping(uint256 => address) public recipientVoteIndexToAddress;

    /// @notice Mapping from recipient address to vote index
    mapping(address => uint256) public recipientToVoteIndex;

    /// @notice Mapping to track if the recipient has been paid out
    mapping(address => bool) public paidOut;

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

    /// @notice Mapping from recipient ID to recipient details
    mapping(address => Recipient) public _recipients;

    /// @notice Mapping from contributor address to total credits
    mapping(address => uint256) public contributorCredits;

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
        useRegistryAnchor = _params.useRegistryAnchor;
        metadataRequired = _params.metadataRequired;
        _registry = allo.getRegistry();

        voiceCreditFactor = (MAX_CONTRIBUTION_AMOUNT * uint256(10) ** 18) / MAX_VOICE_CREDITS;
        voiceCreditFactor = voiceCreditFactor > 0 ? voiceCreditFactor : 1;

        // Set the updated timestamps
        registrationStartTime = _params.registrationStartTime;
        registrationEndTime = _params.registrationEndTime;
        allocationStartTime = _params.allocationStartTime;
        allocationEndTime = _params.allocationEndTime;

        // Validate the timestamps
        _isPoolTimestampValid(registrationStartTime, registrationEndTime, allocationStartTime, allocationEndTime);

        // Emit an event indicating that the timestamps have been updated
        emit TimestampsUpdated(
            registrationStartTime, registrationEndTime, allocationStartTime, allocationEndTime, msg.sender
        );
    }

    /// ================================
    /// ====== External/Public =========
    /// ================================

    /// @notice Sets the status of recipients
    /// @param recipients An array of recipient addresses
    /// @param _statuses An array of statuses corresponding to the recipients
    function reviewRecipients(address[] memory recipients, Status[] memory _statuses)
        external
        onlyBeforeAllocationEnds
        onlyPoolManager(msg.sender)
    {
        if (recipients.length != _statuses.length) {
            revert INVALID();
        }

        for (uint256 i; i < _statuses.length;) {
            address recipientId = recipients[i];
            Recipient storage recipient = _recipients[recipientId];
            recipient.status = _statuses[i];

            if (_statuses[i] == Status.Accepted) {
                recipientVoteIndexToAddress[acceptedRecipientsCounter] = recipientId;
                recipientToVoteIndex[recipientId] = acceptedRecipientsCounter;
                acceptedRecipientsCounter++;
            }

            emit RecipientStatusUpdated(recipientId, _statuses[i], msg.sender);
            unchecked {
                i++;
            }
        }
    }

    /// @notice Withdraws tokens from the pool
    /// @param _token The token to withdraw
    function withdraw(address _token) external onlyPoolManager(msg.sender) {
        if (!isCancelled) {
            revert INVALID();
        }

        uint256 amount = _getBalance(_token, address(this)) - totalContributed;
        _transferAmount(_token, msg.sender, amount);
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
            _registrationStartTime > _allocationStartTime || 
            _registrationEndTime > _allocationEndTime || 
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
    function _registerRecipient(bytes memory _data, address _sender)
        internal
        override
        onlyActiveRegistration
        returns (address)
    {
        if( msg.value != 0 ) {
            revert INVALID();
        }
        
        bool isUsingRegistryAnchor;
        address recipientAddress;
        address registryAnchor;
        Metadata memory metadata;
        address recipientId;

        if (useRegistryAnchor) {
            (recipientId, recipientAddress, metadata) = abi.decode(_data, (address, address, Metadata));
            if (!_isProfileMember(recipientId, _sender)) {
                revert UNAUTHORIZED();
            }
        } else {
            (registryAnchor, recipientAddress, metadata) = abi.decode(_data, (address, address, Metadata));
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
            if (recipientStatus == Status.Accepted) {
                recipient.status = Status.Pending;
            } else if (recipientStatus == Status.Rejected) {
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

    /// @notice Checks if an allocator is valid
    /// @param _allocator The allocator address
    /// @return True if the allocator is valid, otherwise false
    function _isValidAllocator(address _allocator) internal view override returns (bool) {
        return contributorCredits[_allocator] > 0;
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
    function _getPayout(address _recipientId, bytes memory data) internal view override returns (PayoutSummary memory _payoutSummary) {}

    /// @notice Returns the voice credits for a given address
    /// @param _data Encoded address of a user
    /// @return The amount of voice credits
    function getVoiceCredits(address /* _caller */, bytes memory _data) external view returns (uint256) {
        address _allocator = abi.decode(_data, (address));
        if (!_isValidAllocator(_allocator)) {
            return 0;
        }
        return contributorCredits[_allocator];
    }

    /// @notice Ensures the pool amount can be increased
    function _beforeIncreasePoolAmount(uint256) internal view override {
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
    /// ============ QV Helper =============
    /// ====================================

    /// @notice Calculates the alpha for the quadratic funding formula
    /// @param _budget The total budget of the round to be distributed
    /// @param _totalVotesSquares The total squares of votes
    /// @param _totalSpent The total amount of spent voice credits
    /// @return The alpha value
    function calcAlpha(
        uint256 _budget,
        uint256 _totalVotesSquares,
        uint256 _totalSpent
    ) internal view returns (uint256) {
        uint256 contributions = _totalSpent * voiceCreditFactor;

        if (_budget < contributions) {
            revert InvalidBudget();
        }

        if (_totalVotesSquares <= _totalSpent) {
            revert NoProjectHasMoreThanOneVote();
        }

        return ((_budget - contributions) * ALPHA_PRECISION) /
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