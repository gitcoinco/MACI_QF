import { task } from "hardhat/config";
import dotenv from "dotenv";
import {
  JSONFile,
  getTalyFilePath,
  mergeMaciSubtrees,
  genAndSubmitProofs,
  addTallyResultsBatch,
  Ipfs,
} from "../test/utils/index";
import { PrivKey, Keypair } from "maci-domainobjs";
import { getCircuitsDir, getOutputDir } from "./helpers/utils";
import ContractStates from "./helpers/contractStates";
dotenv.config();

const SerializedPrivateKey = process.env.COORDINATOR_MACI_SECRET_KEY as string;
const deserializedPrivKey = PrivKey.deserialize(SerializedPrivateKey);
const CoordinatorKeypair = new Keypair(deserializedPrivKey);

const tallyBatchSize = Number(process.env.TALLY_BATCH_SIZE || 8);
const circuitDirectory = getCircuitsDir();

const apiKey = process.env.IPFS_API_KEY as string;
const secretApiKey = process.env.IPFS_SECRET_API_KEY as string;

const Debug = Boolean(process.env.DEBUG || false);

task(
  "prepareTally",
  "Merges MACI subtrees and generates/submits proofs until tally results are batched"
).setAction(async (_, hre) => {
  const { ethers, network } = hre;
  const [Coordinator] = await ethers.getSigners();
  const roundId = Number(process.env.ROUND_ID as string);
  const chainId = network.config.chainId!;
  const contractStates = new ContractStates(chainId, roundId, Coordinator, hre);
  const startBlock = Number(process.env.STARTING_BLOCK as string);

  try {
    const MACIQFStrategy = await contractStates.getMACIQFStrategy();

    const pollContracts = await MACIQFStrategy.pollContracts();
    const maciContractAddress = await MACIQFStrategy.maci();
    const tallyContractAddress = pollContracts.tally;
    const mpContractAddress = pollContracts.messageProcessor;
    const voteOptionTreeDepth = Number(
      await contractStates.getVoteOptionTreeDepth()
    );

    const outputDir = getOutputDir(roundId, chainId);

    await mergeMaciSubtrees({
      maciAddress: maciContractAddress,
      pollId: 0n,
      numQueueOps: "1",
      signer: Coordinator,
      quiet: !Debug,
    });

    await genAndSubmitProofs({
      coordinatorKeypair: CoordinatorKeypair,
      coordinator: Coordinator,
      maciAddress: maciContractAddress,
      tallyContractAddress: tallyContractAddress,
      mpContractAddress: mpContractAddress,
      outputDir: outputDir,
      circuitDirectory: circuitDirectory,
      maciTransactionHash: undefined,
      startBlock: startBlock,
      quiet: !Debug,
    });

    const tallyFile = getTalyFilePath(outputDir);
    const tally = JSONFile.read(tallyFile);
    const tallyHash = await Ipfs.pinFile(tallyFile, apiKey, secretApiKey);

    console.log("Tally hash url", `https://ipfs.io/ipfs/${tallyHash}`);

    let publishTallyHashReceipt = await MACIQFStrategy.connect(
      Coordinator
    ).publishTallyHash(tallyHash);

    await publishTallyHashReceipt.wait();

    console.log("Tally hash published");

    await addTallyResultsBatch(
      MACIQFStrategy.connect(Coordinator),
      voteOptionTreeDepth,
      tally,
      tallyBatchSize
    );
    
    console.log("Tally results added in batches of : ", tallyBatchSize);
  } catch (error) {
    console.error("Error in prepareTally:", error);
    process.exitCode = 1;
  }
});
