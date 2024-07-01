import { task } from "hardhat/config";
import dotenv from "dotenv";
import path from "path";
import { existsSync, mkdirSync } from "fs";
import {
  JSONFile,
  getIpfsHash,
  getTalyFilePath,
  mergeMaciSubtrees,
  addTallyResultsBatch,
  finalize,
  genAndSubmitProofs,
  distribute,
} from "../test/utils/index";
import { MACIQF, Allo } from "../typechain-types";
import { PrivKey, Keypair } from "maci-domainobjs";

dotenv.config();

let circuitDirectory = process.env.CIRCUIT_DIRECTORY || "./zkeys/zkeys";
const proofOutputDirectory = process.env.PROOF_OUTPUT_DIR || "./proof_output";
const tallyBatchSize = Number(process.env.TALLY_BATCH_SIZE || 8);
const distributeBatchSize = Number(process.env.DISTRIBUTE_BATCH_SIZE || 1);
const Debug = Boolean(process.env.DEBUG || false);
const voteOptionTreeDepth = 3;

task("finalizeRound", "Finalizes the round and distributes funds").setAction(
  async (_, hre) => {
    const { ethers, network } = hre;

    const chainId = network.config.chainId || "unknown";

    if (!existsSync(circuitDirectory)) {
      circuitDirectory = "../../zkeys/zkeys";
    }

    try {
      const [Coordinator] = await ethers.getSigners();

      const SerializedPrivateKey = process.env
        .COORDINATOR_PRIVATE_KEY as string;
      const deserializedPrivKey = PrivKey.deserialize(SerializedPrivateKey);
      const CoordinatorKeypair = new Keypair(deserializedPrivKey);

      const AlloContract = (await ethers.getContractAt(
        "Allo",
        "0x1133eA7Af70876e64665ecD07C0A0476d09465a1",
        Coordinator
      )) as Allo;

      const roundId = Number(process.env.ROUND_ID as string);
      const startBlock = Number(process.env.STARTING_BLOCK as string);

      const StrategyAddress = (await AlloContract.getPool(roundId)).strategy;

      const MACIQFStrategy = (await ethers.getContractAt(
        "MACIQF",
        StrategyAddress,
        Coordinator
      )) as MACIQF;

      const pollContracts = await MACIQFStrategy.pollContracts();
      const maciContractAddress = await MACIQFStrategy.maci();
      const tallyContractAddress = pollContracts[2];
      const mpContractAddress = pollContracts[1];

      const outputDir = path.join(
        proofOutputDirectory,
        `roundId_${roundId}_chainId_${chainId}`
      );
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

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
      const tallyHash = await getIpfsHash(tally);

      let publishTallyHashReceipt = await MACIQFStrategy.connect(
        Coordinator
      ).publishTallyHash(tallyHash);
      await publishTallyHashReceipt.wait();

      console.log("Tally hash", tallyHash);

      await addTallyResultsBatch(
        MACIQFStrategy.connect(Coordinator) as MACIQF,
        voteOptionTreeDepth,
        tally,
        tallyBatchSize
      );
      console.log("Tally results added in batches");

      let isFinalized = await finalize({
        MACIQFStrategy,
        Coordinator,
        voteOptionTreeDepth,
        outputDir,
      });

      if (!isFinalized) {
        throw new Error("Finalization failed");
      }

      await distribute({
        outputDir,
        AlloContract,
        MACIQFStrategy,
        distributor: Coordinator,
        recipientTreeDepth: voteOptionTreeDepth,
        roundId: roundId,
        batchSize: distributeBatchSize,
      });

      console.log("Finalized round and distributed funds successfully");
    } catch (error) {
      console.error("Error in finalizeRound:", error);
      process.exitCode = 1;
    }
  }
);

export default {};
