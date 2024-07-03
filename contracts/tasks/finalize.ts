import { task } from "hardhat/config";
import dotenv from "dotenv";
import { finalize } from "../test/utils/index";
import { getOutputDir } from "./helpers/utils";
import ContractStates from "./helpers/contractStates";
dotenv.config();

task("finalize", "Finalizes the round to start the distribution phase").setAction(async (_, hre) => {
  const { ethers, network } = hre;
  const [Coordinator] = await ethers.getSigners();
  const roundId = Number(process.env.ROUND_ID as string);
  const chainId = network.config.chainId!;
  const contractStates = new ContractStates(chainId, roundId, Coordinator, hre);
  const outputDir = getOutputDir(roundId, chainId);

  try {
    const MACIQFStrategy = await contractStates.getMACIQFStrategy();
    const voteOptionTreeDepth = Number(
      await contractStates.getVoteOptionTreeDepth()
    );

    let isFinalized = await finalize({
      MACIQFStrategy,
      Coordinator,
      voteOptionTreeDepth,
      outputDir,
    });

    if (!isFinalized) {
      throw new Error("Finalization failed");
    }

    console.log("Round finalized successfully");
    
  } catch (error) {
    console.error("Error in finalizeRound:", error);
    process.exitCode = 1;
  }
});
