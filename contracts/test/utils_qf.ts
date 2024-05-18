import {
  IVerifyingKeyStruct,
  VkRegistry,
  deployPoseidonContracts,
  deployVkRegistry,
  linkPoseidonLibraries,
  deployContractWithLinkedLibraries,
  deployMockVerifier,
  MockVerifier,
  Verifier,
  deployVerifier,
} from "maci-contracts";
import { MaxValues, TreeDepths } from "maci-core";
import { G1Point, G2Point } from "maci-crypto";
import { VerifyingKey } from "maci-domainobjs";
import { ethers, upgrades } from "hardhat";
import { Signer } from "ethers";
import {
  ERC20,
  Allo,
  Registry,
  QFMACI,
  ClonableMACI,
  ClonablePoll,
  ClonableMessageProcessor,
  ClonableTally,
  Dai,
} from "../typechain-types";
import { EthereumProvider } from "hardhat/types";
import { create } from "domain";
import dotenv from "dotenv";

import { MaciParameters } from "./utils/maciParameters";

import { Keypair } from "maci-domainobjs";

import { libraries } from "../typechain-types/contracts/core";
import { deploy } from "maci-cli";
dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const PRIVATE_KEY_USER1 = process.env.PRIVATE_KEY_USER1;
const PRIVATE_KEY_USER2 = process.env.PRIVATE_KEY_USER2;
const PRIVATE_KEY_USER3 = process.env.PRIVATE_KEY_USER3;

export const duration = 20;

export interface ITestContracts {
  Allo: Allo;
  QFMACI_STRATEGY: QFMACI;
  vkRegistryContract: VkRegistry;
  verifierContract: Verifier;
  maciContract: ClonableMACI;
  pollContract: ClonablePoll;
  messageProcessorContract: ClonableMessageProcessor;
  tallyContract: ClonableTally;
  user1: Signer;
  user2: Signer;
  user3: Signer;

  poolDeployTime?: number;
  maciTransitionHash: string;
  CoordinatorKeypair: Keypair;

  Dai: Dai;
}

export const deployAlloContracts = async () => {
  const signer = new ethers.Wallet(PRIVATE_KEY, ethers.provider);
  // console.log("Signer : ", signer.address);

  const RegistryFactory = await ethers.getContractFactory("Registry");
  // address _owner
  const Registry = await upgrades.deployProxy(RegistryFactory, [
    signer.address,
  ]);
  const registryAddress = await Registry.getAddress();
  // console.log("Registry deployed at : ", registryAddress);

  const AlloFactory = await ethers.getContractFactory("Allo");
  // address _owner,
  // address _registry,
  // address payable _treasury,
  // uint256 _percentFee,
  // uint256 _baseFee
  const Allo = await upgrades.deployProxy(AlloFactory, [
    signer.address,
    registryAddress,
    signer.address,
    0,
    0,
  ]);
  const alloAddress = await Allo.getAddress();

  const DaiFactory = await ethers.getContractFactory("dai");
  const Dai = await DaiFactory.deploy();

  const daiAddress = await Dai.getAddress();

  const VerifierFactory = await ethers.getContractFactory("Groth16Verifier");
  const Verifier = await upgrades.deployProxy(VerifierFactory, []);
  const verifierAddress = await Verifier.getAddress();
  return {
    AlloAddress: alloAddress,
    RegistryAddress: registryAddress,
    DaiAddress: daiAddress,
    Allo: Allo as Allo,
    Registry: Registry as Registry,
    Dai: Dai as Dai,
    verifierAddress: verifierAddress,
  };
};

export const deployTestContracts = async (): Promise<ITestContracts> => {
  const deployParams = await MaciParameters.mock2();

  // console.log(deployParams);

  const signer = new ethers.Wallet(PRIVATE_KEY, ethers.provider);

  // console.log("Signer : ", signer.address);

  const AlloContracts = await deployAlloContracts();

  const verifierContract = await deployVerifier(undefined, true);
  const vkRegistryContract = await deployVkRegistry(undefined, true);

  const verifierContractAddress = await verifierContract.getAddress();
  const vkRegistryContractAddress = await vkRegistryContract.getAddress();

  const {
    PoseidonT3Contract,
    PoseidonT4Contract,
    PoseidonT5Contract,
    PoseidonT6Contract,
  } = await deployPoseidonContracts(undefined, undefined, true);

  const poseidonAddrs = await Promise.all([
    PoseidonT3Contract.getAddress(),
    PoseidonT4Contract.getAddress(),
    PoseidonT5Contract.getAddress(),
    PoseidonT6Contract.getAddress(),
  ]).then(([poseidonT3, poseidonT4, poseidonT5, poseidonT6]) => ({
    poseidonT3,
    poseidonT4,
    poseidonT5,
    poseidonT6,
  }));

  // console.log(poseidonAddrs);

  const contractsToLink = [
    "ClonablePoll",
    "ClonableMessageProcessor",
    "ClonableTally",
    "ClonableMACI",
  ];

  // Link Poseidon contracts to MACI
  const linkedContractFactories = await Promise.all(
    contractsToLink.map(async (contractName: string) =>
      linkPoseidonLibraries(
        contractName,
        poseidonAddrs.poseidonT3,
        poseidonAddrs.poseidonT4,
        poseidonAddrs.poseidonT5,
        poseidonAddrs.poseidonT6,
        undefined,
        true
      )
    )
  );

  const AlloRegistry = AlloContracts.RegistryAddress;
  const Allo = AlloContracts.AlloAddress;
  const DAI = await ethers.getContractFactory("dai");
  const DAI_INSTANCE = DAI.attach(AlloContracts.DaiAddress);

  const [
    ClonablePollFactory,
    ClonableMessageProcessorFactory,
    ClonableTallyFactory,
    ClonableMACIFactory,
  ] = await Promise.all(linkedContractFactories);

  const pollFactoryContract =
    await deployContractWithLinkedLibraries<ClonablePoll>(
      ClonablePollFactory,
      "",
      true
    );

  const messageProcessorFactoryContract =
    await deployContractWithLinkedLibraries<ClonableMessageProcessor>(
      ClonableMessageProcessorFactory,
      "",
      true
    );

  const tallyFactoryContract =
    await deployContractWithLinkedLibraries<ClonableTally>(
      ClonableTallyFactory,
      "",
      true
    );

  const [pollAddr, mpAddr, tallyAddr] = await Promise.all([
    pollFactoryContract.getAddress(),
    messageProcessorFactoryContract.getAddress(),
    tallyFactoryContract.getAddress(),
  ]);

  // --------------------------------------------------  Clonable MACI  --------------------------------------------------

  const ClonableMACI = await deployContractWithLinkedLibraries<ClonableMACI>(
    ClonableMACIFactory,
    "ClonableMACI",
    true
  );

  const ClonableMACIAddress = await ClonableMACI.getAddress();

  // --------------------------------------------------  Clonable MACI Factory  --------------------------------------------------

  const _ClonableMACIFactory = await ethers.getContractFactory(
    "ClonableMACIFactory"
  );

  const __ClonableMACIFactory = await upgrades.deployProxy(
    _ClonableMACIFactory,
    [ClonableMACIAddress, pollAddr, tallyAddr, mpAddr]
  );

  const ClonableMACIFactoryAddress = await __ClonableMACIFactory.getAddress();

  const setMaciParameters = await __ClonableMACIFactory.setMaciSettings(0, [
    deployParams.treeDepths,
    deployParams.stateTreeDepth,
    verifierContractAddress,
    vkRegistryContractAddress,
  ]);

  const setMaciParametersReceipt = await setMaciParameters.wait();

  await vkRegistryContract.setVerifyingKeys(
    deployParams.stateTreeDepth,
    deployParams.treeDepths.intStateTreeDepth,
    deployParams.treeDepths.messageTreeDepth,
    deployParams.treeDepths.voteOptionTreeDepth,
    deployParams.getMessageBatchSize(),
    deployParams.processVk.asContractParam() as IVerifyingKeyStruct,
    deployParams.tallyVk.asContractParam() as IVerifyingKeyStruct
  );

  const QFMACIStrategyFactory = await ethers.getContractFactory("QFMACI");

  const QFMACIStrategy = await QFMACIStrategyFactory.deploy(Allo, "QFMACI");

  const QFMACIStrategyAddress = await QFMACIStrategy.getAddress();

  // console.log("QFMACIStrategy deployed at : ", QFMACIStrategyAddress);

  // --------------------------------------------------  Add ClonableMACI to Allo allowed strategies  ----------------------------

  const addStrategy = await AlloContracts.Allo.addToCloneableStrategies(
    QFMACIStrategyAddress
  );

  const addStrategyReceipt = await addStrategy.wait();

  // console.log("Strategy added to Allo allowed strategies");

  // uint256 _nonce,
  // string memory _name,
  // Metadata memory _metadata,
  // address _owner,
  // address[] memory _members
  const createProfile = await AlloContracts.Registry.createProfile(
    0,
    "Test",
    {
      protocol: 1,
      pointer: "test",
    },
    signer.address,
    [signer.address]
  );

  const createProfileReceipt = await createProfile.wait();

  // Get from the receipt of the create profile transaction the logs from the createProfile event and console log it
  // THe event => emit ProfileCreated(profileId, profile.nonce, profile.name, profile.metadata, profile.owner, profile.anchor);

  const profileId = createProfileReceipt?.logs[0].topics[1] || "";

  // console.log("Profile Id : ", profileId);

  // --------------------------------------------------  Create Strategy  --------------------------------------------------

  const time = BigInt(
    (await ethers.provider.getBlock(await ethers.provider.getBlockNumber()))!
      .timestamp
  );

  // console.log("Time : ", time);

  let initializeParams = [
    // RegistryGatting
    false,
    // MetadataRequired
    true,
    // RegistrationStartTime
    BigInt(time + BigInt(1)),
    // RegistrationEndTime
    BigInt(time + BigInt(200)),
    // AllocationStartTime
    BigInt(time + BigInt(200)),
    // AllocationEndTime
    BigInt(time + BigInt(500)),
  ];

  let CoordinatorKeypair = new Keypair();

  let MaciParams = [
    // coordinator:
    signer.address,
    // coordinatorPubKey:
    [
      CoordinatorKeypair.pubKey.asContractParam().x,
      CoordinatorKeypair.pubKey.asContractParam().y,
    ],
    ClonableMACIFactoryAddress,
    AlloContracts.verifierAddress,
    // maci_id
    0,
    // VALID_EVENT_IDS
    [192993346581360151154216832563903227660n],
    // requiredValidEventIds
    1n,
    // maxContributionAmountForZupass
    10n ** 18n *  100n,
    // maxContributionAmountForNonZupass
    10n ** 18n *  100n,

  ];

  let initStruct = [initializeParams, MaciParams];

  let types = [
    "((bool,bool,uint256,uint256,uint256,uint256),(address,(uint256,uint256),address,address,uint8,uint256[],uint256,uint256,uint256))",
  ];

  let AbiCoder = new ethers.AbiCoder();

  let bytes = AbiCoder.encode(types, [initStruct]);

  console.log("Bytes : ", bytes);


  // bytes32 _profileId,
  // address _strategy,
  // bytes memory _initStrategyData,
  // address _token,
  // uint256 _amount,
  // Metadata memory _metadata,
  // address[] memory _managers
  const createPool = await AlloContracts.Allo.createPool(
    profileId,
    QFMACIStrategyAddress,
    bytes,
    // "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    AlloContracts.DaiAddress,
    // BigInt(100 * 10 ** 18),
    0n,
    {
      protocol: 1,
      pointer: "test",
    },
    [signer.address],
    // { value: BigInt(100 * 10 ** 18) }
  );

  // console.log(
  //   "owner balance : ",
  //   await ethers.provider.getBalance(signer.address),
  // );

  // Get the receipt of the create pool transaction the _strategy and console log it
  // emit PoolCreated(poolId, _profileId, _strategy, _token, _amount, _metadata);
  const createPoolReceipt = await createPool.wait();

  const maciTransitionHash = createPoolReceipt?.hash;

  const block = await signer.provider!.getBlock(createPoolReceipt!.blockHash);
  const deployTime = block!.timestamp;

  const poolAddress = (await AlloContracts.Allo.getPool(1)).strategy;

  // console.log("Pool Address : ", poolAddress);

  const QFMACI_instance = QFMACIStrategyFactory.attach(poolAddress);

  const QFMACI_STRATEGY = await ethers.getContractAt("QFMACI", poolAddress);

  const maci = await QFMACI_instance._maci();

  // console.log("MACI deployed at : ", maci);

  const pollContracts = await QFMACI_instance._pollContracts();

  // console.log("_pollContracts: ", pollContracts);

  let maciContract2 = (await ethers.getContractAt(
    "ClonableMACI",
    maci
  )) as ClonableMACI;

  // console.log("MACI deployed at : ", await maciContract2.stateTreeDepth());

  const signer2 = new ethers.Wallet(
    PRIVATE_KEY_USER1,
    ethers.provider
  ) as Signer;
  const signer3 = new ethers.Wallet(
    PRIVATE_KEY_USER2,
    ethers.provider
  ) as Signer;
  const signer4 = new ethers.Wallet(
    PRIVATE_KEY_USER3,
    ethers.provider
  ) as Signer;

  return {
    Allo: AlloContracts.Allo,
    QFMACI_STRATEGY,
    vkRegistryContract,
    verifierContract,
    maciContract: (await ethers.getContractAt(
      "ClonableMACI",
      maci
    )) as ClonableMACI,
    pollContract: (await ethers.getContractAt(
      "ClonablePoll",
      pollContracts[0]
    )) as ClonablePoll,
    messageProcessorContract: (await ethers.getContractAt(
      "ClonableMessageProcessor",
      pollContracts[1]
    )) as ClonableMessageProcessor,
    tallyContract: (await ethers.getContractAt(
      "ClonableTally",
      pollContracts[2]
    )) as ClonableTally,
    user1: signer2,
    user2: signer3,
    user3: signer4,

    poolDeployTime: deployTime,
    maciTransitionHash: maciTransitionHash || "",
    CoordinatorKeypair: CoordinatorKeypair,
    Dai: AlloContracts.Dai,
  };
};

/**
 * Travel in time in a local blockchain node
 * @param provider the provider to use
 * @param seconds the number of seconds to travel for
 */
export async function timeTravel(
  provider: EthereumProvider,
  seconds: number,
): Promise<void> {
  await provider.send("evm_increaseTime", [Number(seconds)]);
  await provider.send("evm_mine", []);
}
