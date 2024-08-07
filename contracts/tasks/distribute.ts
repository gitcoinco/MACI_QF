import { task } from "hardhat/config";
import dotenv from "dotenv";
import { distribute } from "../test/utils/index";
import { getOutputDir } from "./helpers/utils";
import ContractStates from "./helpers/contractStates";
dotenv.config();

const distributeBatchSize = Number(process.env.DISTRIBUTE_BATCH_SIZE || 1);

task(
  "distributeFunds",
  "Distributes the funds to everyone that received a donation"
)
  .addParam("roundid", "The round ID for the MACI strategy")
  .setAction(async ({ roundid }, hre) => {
    const { ethers, network } = hre;
    const [Coordinator] = await ethers.getSigners();
    const roundId = Number(roundid);
    const chainId = network.config.chainId!;
    const contractStates = new ContractStates(
      chainId,
      roundId,
      Coordinator,
      hre
    );

    const outputDir = getOutputDir(roundId, chainId);

    try {
      const AlloContract = await contractStates.getAlloContract();
      const MACIQFStrategy = await contractStates.getMACIQFStrategy();
      const voteOptionTreeDepth = Number(
        await contractStates.getVoteOptionTreeDepth()
      );

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
