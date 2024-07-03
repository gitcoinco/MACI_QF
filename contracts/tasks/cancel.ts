import { task } from "hardhat/config";
import dotenv from "dotenv";
import ContractStates from "./helpers/contractStates";

dotenv.config();

task("cancel", "Cancels the round").setAction(async (_, hre) => {
  const { ethers, network } = hre;
  const [Coordinator] = await ethers.getSigners();
  const roundId = Number(process.env.ROUND_ID as string);
  const chainId = network.config.chainId!;
  const contractStates = new ContractStates(
    chainId,
    roundId,
    Coordinator,
    hre
  );

  try {
    const MACIQFStrategy = await contractStates.getMACIQFStrategy();
    
    const isFinalized = await MACIQFStrategy.isFinalized();

    if (isFinalized) {
      throw new Error("You cannot cancel a finalized round");
    }

    const isCancelled = await MACIQFStrategy.isCancelled();

    if (isCancelled) {
      throw new Error("Round has already been cancelled");
    }

    const cancelTx = await MACIQFStrategy.cancel();
    await cancelTx.wait();

    console.log("Round Cancelation was successful");
  } catch (error) {
    console.error("Error in finalizeRound:", error);
    process.exitCode = 1;
  }
});
