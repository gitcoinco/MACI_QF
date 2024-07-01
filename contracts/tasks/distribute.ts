import { task } from "hardhat/config";
import dotenv from "dotenv";
import path from "path";
import { distribute } from "../test/utils/index";
import { MACIQF, Allo } from "../typechain-types";

dotenv.config();

const distributeBatchSize = Number(process.env.DISTRIBUTE_BATCH_SIZE || 1);
const voteOptionTreeDepth = 3;

task("distributeFunds", "Distributes the funds").setAction(async (_, hre) => {
  const { ethers, network } = hre;

  try {
    const [Coordinator] = await ethers.getSigners();

    const roundId = Number(process.env.ROUND_ID as string);
    const chainId = network.config.chainId || "unknown";
    const proofOutputDirectory =
      process.env.PROOF_OUTPUT_DIR || "./proof_output";
    const outputDir = path.join(
      proofOutputDirectory,
      `roundId_${roundId}_chainId_${chainId}`
    );

    const AlloContract = (await ethers.getContractAt(
      "Allo",
      "0x1133eA7Af70876e64665ecD07C0A0476d09465a1",
      Coordinator
    )) as Allo;

    const StrategyAddress = (await AlloContract.getPool(roundId)).strategy;

    const MACIQFStrategy = (await ethers.getContractAt(
      "MACIQF",
      StrategyAddress,
      Coordinator
    )) as MACIQF;

    await distribute({
      outputDir,
      AlloContract,
      MACIQFStrategy,
      distributor: Coordinator,
      recipientTreeDepth: voteOptionTreeDepth,
      roundId: roundId,
      batchSize: distributeBatchSize,
    });

    console.log("Funds distributed successfully");
  } catch (error) {
    console.error("Error in distributeFunds:", error);
    process.exitCode = 1;
  }
});

export default {};
