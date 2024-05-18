import {
  IVerifyingKeyStruct,
  VkRegistry,
  deployPoseidonContracts,
  deployVkRegistry,
  linkPoseidonLibraries,
  deployContractWithLinkedLibraries,
  Verifier,
  deployVerifier,
} from "maci-contracts";

import { ethers, upgrades } from "hardhat";
import { Signer } from "ethers";
import {
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
import dotenv from "dotenv";

import { MaciParameters } from "./utils/maciParameters";

import { Keypair } from "maci-domainobjs";

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;

export const duration = 20;

export const deployAlloContracts = async () => {
  const signer = new ethers.Wallet(PRIVATE_KEY, ethers.provider);

  const VerifierFactory = await ethers.getContractFactory("Groth16Verifier");
  // const Verifier = await VerifierFactory.deploy([]);
  // const verifierAddress = await Verifier.getAddress();
  // console.log("Verifier deployed at : ", verifierAddress);
  return {
    AlloAddress: "0x1133eA7Af70876e64665ecD07C0A0476d09465a1",
    RegistryAddress: "0x4AAcca72145e1dF2aeC137E1f3C5E3D75DB8b5f3",
    verifierAddress: "0xCa68BD74fF421eEA4c4FDd181D8bB35AA388F3D4",
  };
};

export const deployTestContracts = async () => {
  const deployParams = await MaciParameters.mock2();

  const AlloContracts = await deployAlloContracts();

  // const verifierContract = await deployVerifier(undefined, true);
  // const vkRegistryContract = await deployVkRegistry(undefined, true);

  const vkRegistry = await ethers.getContractFactory("VkRegistry");
  const verifier = await ethers.getContractFactory("Verifier");

  const verifierContract = await ethers.getContractAt(
    "Verifier",
    "0x630DEf8cCbE4d8067D03CAC718Ca2657AF7E04A9"
  );

  const vkRegistryContract = await ethers.getContractAt(
    "VkRegistry",
    "0x85707AC27D4A18D5461f0B713f9338858c4aBbF5"
  );

  const verifierContractAddress = await verifierContract.getAddress();
  const vkRegistryContractAddress = await vkRegistryContract.getAddress();

  console.log("Verifier deployed at : ", verifierContractAddress);
  console.log("VkRegistry deployed at : ", vkRegistryContractAddress);

  // const {
  //   PoseidonT3Contract,
  //   PoseidonT4Contract,
  //   PoseidonT5Contract,
  //   PoseidonT6Contract,
  // } = await deployPoseidonContracts(undefined, undefined, true);

  const poseidonAddrs = {
    poseidonT3: "0x2ee7633e24578d330917a2199Ea3389Df52D93E0",
    poseidonT4: "0x95Af14586516C8f3E4A5a03A5F26D38749Cba79F",
    poseidonT5: "0x66Cf60120661e65d6C9Fc96d7234FF4cD2Dd27e9",
    poseidonT6: "0x2539d6d83a8923312be73C87Ff8a4a44B2B81359",
  };

  // await Promise.all([
  //   PoseidonT3Contract.getAddress(),
  //   PoseidonT4Contract.getAddress(),
  //   PoseidonT5Contract.getAddress(),
  //   PoseidonT6Contract.getAddress(),
  // ]).then(([poseidonT3, poseidonT4, poseidonT5, poseidonT6]) => ({
  //   poseidonT3,
  //   poseidonT4,
  //   poseidonT5,
  //   poseidonT6,
  // }));

  console.log(poseidonAddrs);

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

  // const [
  //   ClonablePollFactory,
  //   ClonableMessageProcessorFactory,
  //   ClonableTallyFactory,
  //   ClonableMACIFactory,
  // ] = await Promise.all(linkedContractFactories);

  // const pollFactoryContract =
  //   await deployContractWithLinkedLibraries<ClonablePoll>(
  //     ClonablePollFactory,
  //     "",
  //     true
  //   );

  // const messageProcessorFactoryContract =
  //   await deployContractWithLinkedLibraries<ClonableMessageProcessor>(
  //     ClonableMessageProcessorFactory,
  //     "",
  //     true
  //   );

  // const tallyFactoryContract =
  //   await deployContractWithLinkedLibraries<ClonableTally>(
  //     ClonableTallyFactory,
  //     "",
  //     true
  //   );

  // const [pollAddr, mpAddr, tallyAddr] = await Promise.all([
  //   pollFactoryContract.getAddress(),
  //   messageProcessorFactoryContract.getAddress(),
  //   tallyFactoryContract.getAddress(),
  // ]);

  // // --------------------------------------------------  Clonable MACI  --------------------------------------------------

  // const ClonableMACI = await deployContractWithLinkedLibraries<ClonableMACI>(
  //   ClonableMACIFactory,
  //   "ClonableMACI",
  //   true
  // );

  // const ClonableMACIAddress = await ClonableMACI.getAddress();

  // // --------------------------------------------------  Clonable MACI Factory  --------------------------------------------------

  // const _ClonableMACIFactory = await ethers.getContractFactory(
  //   "ClonableMACIFactory"
  // );

  // const __ClonableMACIFactory = await upgrades.deployProxy(
  //   _ClonableMACIFactory,
  //   [ClonableMACIAddress, pollAddr, tallyAddr, mpAddr]
  // );

  // const setMaciParameters = await __ClonableMACIFactory.setMaciSettings(0, [
  //   deployParams.treeDepths,
  //   deployParams.stateTreeDepth,
  //   verifierContractAddress,
  //   vkRegistryContractAddress,
  // ]);

  // await setMaciParameters.wait();
console.log(deployParams.processVk.asContractParam() as IVerifyingKeyStruct);
console.log(deployParams.tallyVk.asContractParam() as IVerifyingKeyStruct);

  await vkRegistryContract.setVerifyingKeys(
    deployParams.stateTreeDepth,
    deployParams.treeDepths.intStateTreeDepth,
    deployParams.treeDepths.messageTreeDepth,
    deployParams.treeDepths.voteOptionTreeDepth,
    deployParams.getMessageBatchSize(),
    deployParams.processVk.asContractParam() as IVerifyingKeyStruct,
    deployParams.tallyVk.asContractParam() as IVerifyingKeyStruct,
  );

  // const QFMACIStrategyFactory = await ethers.getContractFactory("QFMACI");

  // const QFMACIStrategy = await QFMACIStrategyFactory.deploy(Allo, "QFMACI");

  const QFMACIStrategyAddress = "0x59f93D2bF077d1Ca9d6d8667346Ae4665614F7D0";

  console.log("QFMACIStrategy deployed at : ", QFMACIStrategyAddress);

  console.log(
    "ClonableMACIFactory deployed at : ",
    "0x8EcF5b580Eb4C4A1F1AA1D67162365DBFe277161"
  );

  console.log("Groth16Verifier deployed at : ", AlloContracts.verifierAddress);
};

deployTestContracts();
