import {
  IVerifyingKeyStruct,
  VkRegistry,
  deployPoseidonContracts,
  deployVkRegistry,
  Verifier,
  deployVerifier,
} from "maci-contracts";
import { ethers, upgrades } from "hardhat";
import { BigNumberish, Signer } from "ethers";
import {
  Allo,
  Registry,
  MACIQF,
  ClonableMACI,
  ClonablePoll,
  ClonableMessageProcessor,
  ClonableTally,
  Dai,
} from "../typechain-types";
import { EthereumProvider } from "hardhat/types";

import dotenv from "dotenv";

import { MaciParameters } from "./utils/maciParameters";

import { Keypair } from "maci-domainobjs";

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const PRIVATE_KEY_USER1 = process.env.PRIVATE_KEY_USER1;
const PRIVATE_KEY_USER2 = process.env.PRIVATE_KEY_USER2;
const PRIVATE_KEY_USER3 = process.env.PRIVATE_KEY_USER3;

export const duration = 20;

export interface ITestContracts {
  Allo: Allo;
  MACIQF_STRATEGY: MACIQF;
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
  const signer = new ethers.Wallet(PRIVATE_KEY!, ethers.provider);
  // console.log("Signer : ", signer.address);

  const RegistryFactory = await ethers.getContractFactory("Registry");
  // address _owner
  const Registry = await upgrades.deployProxy(RegistryFactory, [
    signer.address,
  ]);
  const registryAddress = await Registry.getAddress();

  const REGISTRY = await ethers.getContractAt("Registry", registryAddress);
  // console.log("Registry deployed at : ", registryAddress);

  const AlloFactory = await ethers.getContractFactory("Allo");

  const Allo = await upgrades.deployProxy(AlloFactory, [
    signer.address,
    registryAddress,
    signer.address,
    0,
    0,
  ]);

  const alloAddress = await Allo.getAddress();

  const ALLO = await ethers.getContractAt("Allo", alloAddress);

  const DaiFactory = await ethers.getContractFactory("dai");
  const Dai = await DaiFactory.deploy();

  const daiAddress = await Dai.getAddress();

  const VerifierFactory = await ethers.getContractFactory("Groth16Verifier").then( (factory) => factory.deploy());

  const verifierAddress = await VerifierFactory.getAddress();

  const ZuPassRegistryFactory = await ethers
    .getContractFactory("ZuPassRegistry")
    .then((factory) => factory.deploy(verifierAddress));

  const ZuPassRegistryAddress = await ZuPassRegistryFactory.getAddress();

  const ZuPassFactory = await ethers.getContractAt(
    "ZuPassRegistry",
    ZuPassRegistryAddress
  );
  
  type ZUPASS_SIGNERStruct = {
    G1: BigNumberish;
    G2: BigNumberish;
  };

  const setEvents = await ZuPassFactory.setEvents(
    ["192993346581360151154216832563903227660"] as BigNumberish[],
    [
      {
        G1: "2658696990997679927259430495938453033612384821046330804164935913637421782846",
        G2: "18852953264765021758165045442761617487242246681540213362114332008455443692095",
      },
    ] as ZUPASS_SIGNERStruct[]
  );

  await setEvents.wait();

  return {
    AlloAddress: alloAddress,
    RegistryAddress: registryAddress,
    DaiAddress: daiAddress,
    Allo: ALLO as Allo,
    Registry: REGISTRY as Registry,
    Dai: Dai as Dai,
    ZuPassRegistryAddress: ZuPassRegistryAddress,
  };
};

export const deployTestContracts = async (): Promise<ITestContracts> => {
  const deployParams = await MaciParameters.mock2();

  const signer = new ethers.Wallet(PRIVATE_KEY!, ethers.provider);

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

  const Allo = AlloContracts.AlloAddress;

  const pollFactoryContract = await ethers.getContractFactory("ClonablePoll",
    {
      libraries: {
        PoseidonT3: poseidonAddrs.poseidonT3,
        PoseidonT4: poseidonAddrs.poseidonT4,
        PoseidonT5: poseidonAddrs.poseidonT5,
        PoseidonT6: poseidonAddrs.poseidonT6,
      },
    }
  ).then((factory) => factory.deploy()
  
);

  const messageProcessorFactoryContract = await ethers.getContractFactory("ClonableMessageProcessor",
    {
      libraries: {
        PoseidonT3: poseidonAddrs.poseidonT3,
        PoseidonT4: poseidonAddrs.poseidonT4,
        PoseidonT5: poseidonAddrs.poseidonT5,
        PoseidonT6: poseidonAddrs.poseidonT6,
      },
    }
  ).then((factory) => factory.deploy()
  
);
  
  const tallyFactoryContract = await ethers.getContractFactory("ClonableTally",
    {
      libraries: {
        PoseidonT3: poseidonAddrs.poseidonT3,
        PoseidonT4: poseidonAddrs.poseidonT4,
        PoseidonT5: poseidonAddrs.poseidonT5,
        PoseidonT6: poseidonAddrs.poseidonT6,
      },
    }
  ).then((factory) => factory.deploy()
  
  );

  const [pollAddr, mpAddr, tallyAddr] = await Promise.all([
    pollFactoryContract.getAddress(),
    messageProcessorFactoryContract.getAddress(),
    tallyFactoryContract.getAddress(),
  ]);

  // --------------------------------------------------  Clonable MACI  --------------------------------------------------

  const ClonableMACI = await ethers.getContractFactory("ClonableMACI",
    {
      libraries: {
        PoseidonT3: poseidonAddrs.poseidonT3,
        PoseidonT4: poseidonAddrs.poseidonT4,
        PoseidonT5: poseidonAddrs.poseidonT5,
        PoseidonT6: poseidonAddrs.poseidonT6,
      },
    }
  ).then((factory) => factory.deploy()
  
);


  const ClonableMACIAddress = await ClonableMACI.getAddress();

  // --------------------------------------------------  Clonable MACI Factory  --------------------------------------------------

  const ClonableMACIFactory = await ethers.getContractFactory(
    "ClonableMACIFactory"
  ).then((factory) => upgrades.deployProxy(
    factory,
    [ClonableMACIAddress, pollAddr, tallyAddr, mpAddr]
  ));



  const ClonableMACIFactoryAddress = await ClonableMACIFactory.getAddress();

  const setMaciParameters = await ClonableMACIFactory.setMaciSettings(0, [
    deployParams.treeDepths,
    deployParams.stateTreeDepth,
    verifierContractAddress,
    vkRegistryContractAddress,
    [
      4904028317433377177773123885584230878115556059208431880161186712332781831975n,
      344732312350052944041104345325295111408747975338908491763817872057138864163n,
      19445814455012978799483892811950396383084183210860279923207176682490489907069n,
      10621810780690303482827422143389858049829670222244900617652404672125492013328n,
      17077690379337026179438044602068085690662043464643511544329656140997390498741n,
    ],
  ]);

  await setMaciParameters.wait();

  const QVMODE = 0n

  await vkRegistryContract.setVerifyingKeys(
    deployParams.stateTreeDepth,
    deployParams.treeDepths.intStateTreeDepth,
    deployParams.treeDepths.messageTreeDepth,
    deployParams.treeDepths.voteOptionTreeDepth,
    deployParams.getMessageBatchSize(),
    QVMODE,
    deployParams.processVk.asContractParam() as IVerifyingKeyStruct,
    deployParams.tallyVk.asContractParam() as IVerifyingKeyStruct
  );

  const MACIQFStrategyFactory = await ethers.getContractFactory("MACIQF");

  const MACIQFStrategy = await MACIQFStrategyFactory.deploy(Allo, "MACIQF");

  const MACIQFStrategyAddress = await MACIQFStrategy.getAddress();

  // --------------------------------------------------  Add ClonableMACI to Allo allowed strategies  ----------------------------

  const addStrategy = await AlloContracts.Allo.addToCloneableStrategies(
    MACIQFStrategyAddress
  );

  await addStrategy.wait();

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

  const profileId = createProfileReceipt?.logs[0].topics[1] || "";

  // --------------------------------------------------  Create Strategy  --------------------------------------------------

  const time = BigInt(
    (await ethers.provider.getBlock(await ethers.provider.getBlockNumber()))!
      .timestamp
  );


  let initializeParams = [
    // RegistryGatting
    false,
    // MetadataRequired
    true,
    // RegistrationStartTime
    BigInt(time + BigInt(1)),
    // RegistrationEndTime
    BigInt(time + BigInt(199)),
    // AllocationStartTime
    BigInt(time + BigInt(200)),
    // AllocationEndTime
    BigInt(time + BigInt(500)),
  ];

  let CoordinatorKeypair = new Keypair();

  let AbiCoder = new ethers.AbiCoder();

  const eventIDs = ["192993346581360151154216832563903227660"];

  let encodedEventIDs = AbiCoder.encode(
    ["uint256[]"],
    [eventIDs]
  );

  let MaciParams = [
    // coordinator:
    signer.address,
    // coordinatorPubKey:
    [
      CoordinatorKeypair.pubKey.asContractParam().x,
      CoordinatorKeypair.pubKey.asContractParam().y,
    ],
    ClonableMACIFactoryAddress,
    AlloContracts.ZuPassRegistryAddress,
    // maci_id
    0,
    // VALID_EVENT_IDS
    encodedEventIDs,
    // maxContributionAmountForZupass
    10n ** 18n * 100n,
    // maxContributionAmountForNonZupass
    10n ** 18n * 100n,
  ];

  let initStruct = [initializeParams, MaciParams];

  let types = [
    "((bool,bool,uint256,uint256,uint256,uint256),(address,(uint256,uint256),address,address,uint8,bytes,uint256,uint256))",
  ];


  let bytes = AbiCoder.encode(types, [initStruct]);

  const createPool = await AlloContracts.Allo.createPool(
    profileId,
    MACIQFStrategyAddress,
    bytes,
    "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    // AlloContracts.DaiAddress,
    BigInt(100 * 10 ** 18),
    // 0n,
    {
      protocol: 1,
      pointer: "test",
    },
    [signer.address],
    { value: BigInt(100 * 10 ** 18) }
  );

  const createPoolReceipt = await createPool.wait();

  const maciTransitionHash = createPoolReceipt?.hash;

  const block = await signer.provider!.getBlock(createPoolReceipt!.blockHash);
  const deployTime = block!.timestamp;

  const poolAddress = (await AlloContracts.Allo.getPool(1)).strategy;

  console.log("Pool Address : ", poolAddress);

  const MACIQF_STRATEGY = await ethers.getContractAt("MACIQF", poolAddress);

  const maci = await MACIQF_STRATEGY._maci();

  const pollContracts = await MACIQF_STRATEGY._pollContracts();

  const signer2 = new ethers.Wallet(
    PRIVATE_KEY_USER1!,
    ethers.provider
  ) as Signer;
  const signer3 = new ethers.Wallet(
    PRIVATE_KEY_USER2!,
    ethers.provider
  ) as Signer;
  const signer4 = new ethers.Wallet(
    PRIVATE_KEY_USER3!,
    ethers.provider
  ) as Signer;

  return {
    Allo: AlloContracts.Allo,
    MACIQF_STRATEGY,
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
