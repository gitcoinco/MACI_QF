// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {InitialVoiceCreditProxy} from "maci-contracts/contracts/initialVoiceCreditProxy/InitialVoiceCreditProxy.sol";
import {SignUpGatekeeper} from "maci-contracts/contracts/gatekeepers/SignUpGatekeeper.sol";
import {AccQueue} from "maci-contracts/contracts/trees/AccQueue.sol";
import {AccQueueQuinaryBlankSl} from "maci-contracts/contracts/trees/AccQueueQuinaryBlankSl.sol";
import {IMACI} from "maci-contracts/contracts/interfaces/IMACI.sol";
import {Params} from "maci-contracts/contracts/utilities/Params.sol";
import {Utilities} from "maci-contracts/contracts/utilities/Utilities.sol";
import {ClonableMACIFactory} from "./ClonableMACIFactory.sol";
import { CurveBabyJubJub } from "maci-contracts/contracts/crypto/BabyJubJub.sol";

/// @title MACI - Minimum Anti-Collusion Infrastructure Version 1
/// @notice A contract which allows users to sign up, and deploy new polls
contract ClonableMACI is IMACI, Params, Utilities, Initializable, OwnableUpgradeable {
    /// @notice The state tree depth is fixed. As such it should be as large as feasible
    /// so that there can be as many users as possible.  i.e. 5 ** 10 = 9765625
    /// this should also match the parameter of the circom circuits.
    uint8 public stateTreeDepth;

    /// @notice IMPORTANT: remember to change the ballot tree depth
    /// in contracts/ts/genEmptyBallotRootsContract.ts file
    /// if we change the state tree depth!
    uint8 internal constant STATE_TREE_SUBDEPTH = 2;
    uint8 internal constant TREE_ARITY = 5;

    /// @notice The hash of a blank state leaf
    uint256 internal constant BLANK_STATE_LEAF_HASH =
        uint256(6769006970205099520508948723718471724660867171122235270773600567925038008762);

    /// @notice Each poll has an incrementing ID
    uint256 public nextPollId;

    /// @notice A mapping of poll IDs to Poll contracts.
    mapping(uint256 => address) public polls;

    /// @notice Whether the subtrees have been merged (can merge root before new signup)
    bool public subtreesMerged;

    /// @notice The number of signups
    uint256 public numSignUps;

    TreeDepths public treeDepths;

    address public verifier;

    address public vkRegistry;

    /// @notice Factory contract that deploy a Poll contract
    ClonableMACIFactory public maciFactory;

    /// @notice The state AccQueue. Represents a mapping between each user's public key
    /// and their voice credit balance.
    AccQueue public stateAq;

    /// @notice Address of the SignUpGatekeeper, a contract which determines whether a
    /// user may sign up to vote
    SignUpGatekeeper public signUpGatekeeper;

    /// @notice The contract which provides the values of the initial voice credit
    /// balance per user
    InitialVoiceCreditProxy public initialVoiceCreditProxy;

    address coordinator;

    /// @notice A struct holding the addresses of poll, mp and tally
    struct PollContracts {
        address poll;
        address messageProcessor;
        address tally;
        address subsidy;
    }

    // Events
    event SignUp(
        uint256 _stateIndex,
        uint256 indexed _userPubKeyX,
        uint256 indexed _userPubKeyY,
        uint256 _voiceCreditBalance,
        uint256 _timestamp
    );
    event DeployPoll(
        uint256 _pollId,
        uint256 indexed _coordinatorPubKeyX,
        uint256 indexed _coordinatorPubKeyY,
        PollContracts pollAddr
    );

    /// @notice Only allow a Poll contract to call the modified function.
    modifier onlyPoll(uint256 _pollId) {
        if (msg.sender != address(polls[_pollId])) revert CallerMustBePoll(msg.sender);
        _;
    }

    /// @notice custom errors
    error CallerMustBePoll(address _caller);
    error PoseidonHashLibrariesNotLinked();
    error TooManySignups();
    error InvalidPubKey();
    error PreviousPollNotCompleted(uint256 pollId);
    error PollDoesNotExist(uint256 pollId);
    error SignupTemporaryBlocked();

    /// @notice Create a new instance of the MACI contract.
    /// @param _maciFactory The Clonable MaciFactory contract
    /// @param _stateTreeDepth The depth of the state tree
    /// @param _treeDepths The depth of the Merkle trees
    /// @param _verifier The Verifier Contract
    /// @param _vkRegistry The VkRegistry Contract
    /// @param _signUpGatekeeper The SignUpGatekeeper contract
    /// @param _initialVoiceCreditProxy The InitialVoiceCreditProxy contract
    function initialize(
        address _maciFactory,
        uint8 _stateTreeDepth,
        TreeDepths memory _treeDepths,
        address _verifier,
        address _vkRegistry,
        address _signUpGatekeeper,
        address _initialVoiceCreditProxy,
        address _coordinator
    ) public initializer {
        __Context_init_unchained();
        __Ownable_init_unchained(msg.sender);
        // because we add a blank leaf we need to count one signup
        // so we don't allow max + 1
        unchecked {
            numSignUps++;
        }

        maciFactory = ClonableMACIFactory(_maciFactory);
        stateTreeDepth = _stateTreeDepth;
        treeDepths = _treeDepths;
        verifier = _verifier;
        vkRegistry = _vkRegistry;

        // Set the AccQueue State
        stateAq = new AccQueueQuinaryBlankSl(STATE_TREE_SUBDEPTH);
        stateAq.enqueue(BLANK_STATE_LEAF_HASH);

        coordinator = _coordinator;
        signUpGatekeeper = SignUpGatekeeper(_signUpGatekeeper);
        initialVoiceCreditProxy = InitialVoiceCreditProxy(_initialVoiceCreditProxy);

        // Verify linked poseidon libraries
        if (hash2([uint256(1), uint256(1)]) == 0) revert PoseidonHashLibrariesNotLinked();
    }

    /// @notice Allows any eligible user sign up. The sign-up gatekeeper should prevent
    /// double sign-ups or ineligible users from doing so.  This function will
    /// only succeed if the sign-up deadline has not passed. It also enqueues a
    /// fresh state leaf into the state AccQueue.
    /// @param _pubKey The user's desired public key.
    /// @param _signUpGatekeeperData Data to pass to the sign-up gatekeeper's
    ///     register() function. For instance, the POAPGatekeeper or
    ///     SignUpTokenGatekeeper requires this value to be the ABI-encoded
    ///     token ID.
    /// @param _initialVoiceCreditProxyData Data to pass to the
    ///     InitialVoiceCreditProxy, which allows it to determine how many voice
    ///     credits this user should have.
    function signUp(
        PubKey memory _pubKey,
        bytes memory _signUpGatekeeperData,
        bytes memory _initialVoiceCreditProxyData
    ) public virtual {
        // prevent new signups until we merge the roots (possible DoS)
        if (subtreesMerged) revert SignupTemporaryBlocked();

        // ensure we do not have more signups than what the circuits support
        if (numSignUps >= uint256(TREE_ARITY) ** uint256(stateTreeDepth)) revert TooManySignups();

        if (!CurveBabyJubJub.isOnCurve(_pubKey.x, _pubKey.y)) {
            revert InvalidPubKey();
        }

        // Increment the number of signups
        // cannot overflow with realistic STATE_TREE_DEPTH
        // values as numSignUps < 5 ** STATE_TREE_DEPTH -1
        unchecked {
            numSignUps++;
        }

        // Register the user via the sign-up gatekeeper. This function should
        // throw if the user has already registered or if ineligible to do so.
        signUpGatekeeper.register(address(this), _signUpGatekeeperData);

        // Get the user's voice credit balance.
        uint256 voiceCreditBalance = initialVoiceCreditProxy.getVoiceCredits(
            address(this),
            _initialVoiceCreditProxyData
        );

        uint256 timestamp = block.timestamp;
        // Create a state leaf and enqueue it.
        uint256 stateLeaf = hashStateLeaf(StateLeaf(_pubKey, voiceCreditBalance, timestamp));

        uint256 stateIndex = stateAq.enqueue(stateLeaf);

        emit SignUp(stateIndex, _pubKey.x, _pubKey.y, voiceCreditBalance, timestamp);
    }

    /// @notice Deploy a new Poll contract.
    /// @param _duration How long should the Poll last for
    /// @param _coordinatorPubKey The coordinator's public key
    /// @return pollAddr a new Poll contract address
    function deployPoll(
        uint256 _duration,
        PubKey memory _coordinatorPubKey,
        Mode _mode
    ) public virtual onlyOwner returns (PollContracts memory pollAddr) {
        // cache the poll to a local variable so we can increment it
        uint256 pollId = nextPollId;

        // Increment the poll ID for the next poll
        // 2 ** 256 polls available
        unchecked {
            nextPollId++;
        }

        if (pollId > 0) {
            if (!stateAq.treeMerged()) revert PreviousPollNotCompleted(pollId);
        }

        // check that the coordinator public key is valid
        if (!CurveBabyJubJub.isOnCurve(_coordinatorPubKey.x, _coordinatorPubKey.y)) {
            revert InvalidPubKey();
        }

        MaxValues memory maxValues = MaxValues({
            maxMessages: uint256(TREE_ARITY) ** treeDepths.messageTreeDepth,
            maxVoteOptions: uint256(TREE_ARITY) ** treeDepths.voteOptionTreeDepth
        });

        address _owner = coordinator;

        address p = maciFactory.deployPoll(
            _duration,
            maxValues,
            treeDepths,
            _coordinatorPubKey,
            address(this),
            _owner
        );

        address mp = maciFactory.deployMessageProcessor(verifier, vkRegistry, p, _owner, _mode);

        address tally = maciFactory.deployTally(verifier, vkRegistry, p, mp, _owner, _mode);

        address subsidy;

        polls[pollId] = p;

        // store the addresses in a struct so they can be returned
        pollAddr = PollContracts({poll: p, messageProcessor: mp, tally: tally, subsidy: subsidy});

        emit DeployPoll(pollId, _coordinatorPubKey.x, _coordinatorPubKey.y, pollAddr);
    }

    /// @inheritdoc IMACI
    function mergeStateAqSubRoots(
        uint256 _numSrQueueOps,
        uint256 _pollId
    ) public onlyPoll(_pollId) {
        stateAq.mergeSubRoots(_numSrQueueOps);

        // if we have merged all subtrees then put a block
        if (stateAq.subTreesMerged()) {
            subtreesMerged = true;
        }
    }

    /// @inheritdoc IMACI
    function mergeStateAq(uint256 _pollId) public onlyPoll(_pollId) returns (uint256 root) {
        // remove block
        subtreesMerged = false;

        root = stateAq.merge(stateTreeDepth);
    }

    /// @inheritdoc IMACI
    function getStateAqRoot() public view returns (uint256 root) {
        root = stateAq.getMainRoot(stateTreeDepth);
    }

    /// @notice Get the Poll details
    /// @param _pollId The identifier of the Poll to retrieve
    /// @return poll The Poll contract object
    function getPoll(uint256 _pollId) public view returns (address poll) {
        if (_pollId >= nextPollId) revert PollDoesNotExist(_pollId);
        poll = polls[_pollId];
    }
}
