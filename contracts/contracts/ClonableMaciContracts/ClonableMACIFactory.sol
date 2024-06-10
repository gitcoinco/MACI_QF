// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ClonesUpgradeable} from "../core/libraries/utils/ClonesUpgradeable.sol";

import {ClonableMACI} from "./ClonableMACI.sol";
import {ClonablePoll} from "./ClonablePoll.sol";
import {ClonableTally} from "./ClonableTally.sol";
import {ClonableMessageProcessor} from "./ClonableMessageProcessor.sol";

import {AccQueueQuinaryMaci} from "maci-contracts/contracts/trees/AccQueueQuinaryMaci.sol";
import {DomainObjs} from "maci-contracts/contracts/utilities/DomainObjs.sol";
import {TopupCredit} from "maci-contracts/contracts/TopupCredit.sol";
import {Params} from "maci-contracts/contracts/utilities/Params.sol";
import {AccQueue} from "maci-contracts/contracts/trees/AccQueue.sol";
import {IMACI} from "maci-contracts/contracts/interfaces/IMACI.sol";

contract ClonableMACIFactory is OwnableUpgradeable, DomainObjs {

    error InvalidMaxValues();

    uint8 internal constant TREE_ARITY = 5;

    struct MACI_SETTINGS {
        Params.TreeDepths treeDepths;
        uint8 stateTreeDepth;
        address verifier;
        address vkRegistry;
        uint256[] emptyBallotTreeRoots;
    }

    mapping(uint8 => MACI_SETTINGS) public maciSettings;

    // The clonable strategy to use for the pools
    address internal clonableMaciImplementation;

    address internal PollImplementation;

    address internal TallyImplementation;

    address internal MessageProcessorImplementation;

    uint256 deployNonce;

    /// @notice constructor function which ensure deployer is set as owner
    function initialize(
        address _clonableMaciImplementation,
        address _PollImplementation,
        address _TallyImplementation,
        address _MessageProcessorImplementation
    ) external initializer {
        __Context_init_unchained();
        __Ownable_init_unchained(msg.sender);

        clonableMaciImplementation = _clonableMaciImplementation;
        PollImplementation = _PollImplementation;
        TallyImplementation = _TallyImplementation;
        MessageProcessorImplementation = _MessageProcessorImplementation;
    }

    function setMaciSettings(uint8 _maciId, MACI_SETTINGS memory _maciSettings) external onlyOwner {
        maciSettings[_maciId] = _maciSettings;
    }

    function createMACI(
        address _signUpGatekeeper,
        address _initialVoiceCreditProxy,
        address _coordinator,
        uint8 _maciId
    ) external returns (address _cloneMaci) {
        _cloneMaci = ClonesUpgradeable.cloneDeterministic(
            clonableMaciImplementation,
            bytes32(deployNonce++)
        );

        MACI_SETTINGS memory _maciSettings = maciSettings[_maciId];
        ClonableMACI(_cloneMaci).initialize(
            address(this),
            _maciSettings.stateTreeDepth,
            _maciSettings.treeDepths,
            _maciSettings.verifier,
            _maciSettings.vkRegistry,
            _signUpGatekeeper,
            _initialVoiceCreditProxy,
            _coordinator
        );

        ClonableMACI(_cloneMaci).transferOwnership(msg.sender);
    }

    /// @notice Deploy a new Poll contract and AccQueue contract for messages.
    /// @param _duration The duration of the poll
    /// @param _maxValues The max values for the poll
    /// @param _treeDepths The depths of the merkle trees
    /// @param _coordinatorPubKey The coordinator's public key
    /// @param _maci The MACI contract interface reference
    /// @param _pollOwner The owner of the poll
    /// @return pollAddr deployed Poll contract
    function deployPoll(
        uint256 _duration,
        Params.MaxValues memory _maxValues,
        Params.TreeDepths memory _treeDepths,
        DomainObjs.PubKey memory _coordinatorPubKey,
        address _maci,
        address _pollOwner,
        uint8 _maciId
    ) public virtual returns (address pollAddr) {
        /// @notice Validate _maxValues
        /// maxVoteOptions must be less than 2 ** 50 due to circuit limitations;
        /// it will be packed as a 50-bit value along with other values as one
        /// of the inputs (aka packedVal)
        if (_maxValues.maxVoteOptions >= (2 ** 50)) {
            revert InvalidMaxValues();
        }

        AccQueue messageAq = AccQueue(address(0));

        /// @notice the smart contracts that a Poll would interact with
        Params.ExtContracts memory extContracts = Params.ExtContracts({
            maci: IMACI(_maci),
            messageAq: messageAq,
            topupCredit: TopupCredit(address(0))
        });

        address poll = ClonesUpgradeable.cloneDeterministic(
            PollImplementation,
            bytes32(deployNonce++)
        );

        ClonablePoll _poll = ClonablePoll(poll);

        _poll.initialize(_duration, _maxValues, _treeDepths, _coordinatorPubKey, extContracts, maciSettings[_maciId].emptyBallotTreeRoots);

        // init Poll
        _poll.init();

        _poll.transferOwnership(_pollOwner);

        pollAddr = address(poll);
    }

    function deployTally(
        address _verifier,
        address _vkRegistry,
        address _poll,
        address _messageProcessor,
        address _owner,
        Mode mode
    ) public returns (address tallyAddr) {
        // deploy Tally for this Poll
        address tally = ClonesUpgradeable.cloneDeterministic(
            TallyImplementation,
            bytes32(deployNonce++)
        );

        ClonableTally _tally = ClonableTally(tally);

        _tally.initialize(_verifier, _vkRegistry, _poll, _messageProcessor, mode);

        _tally.transferOwnership(_owner);

        tallyAddr = address(tally);
    }

    function deployMessageProcessor(
        address _verifier,
        address _vkRegistry,
        address _poll,
        address _owner,
        Mode mode
    ) public returns (address messageProcessorAddr) {
        // deploy MessageProcessor for this Poll
        address messageProcessor = ClonesUpgradeable.cloneDeterministic(
            MessageProcessorImplementation,
            bytes32(deployNonce++)
        );

        ClonableMessageProcessor _messageProcessor = ClonableMessageProcessor(messageProcessor);

        _messageProcessor.initialize(_verifier, _vkRegistry, _poll, mode);

        _messageProcessor.transferOwnership(_owner);

        messageProcessorAddr = address(messageProcessor);
    }

    function getMaxVoteOptions(uint8 _maciId) public view returns (uint256) {
        return TREE_ARITY ** maciSettings[_maciId].treeDepths.voteOptionTreeDepth;
    }
}
