import { task } from "hardhat/config";
import dotenv from "dotenv";
import ContractStates from "./helpers/contractStates";
dotenv.config();

task(
  "emergentWithdraw",
  "Withdraws the round funds in case something went wrong with withdrawals after the round is finalized"
).setAction(async (_, hre) => {
  const { ethers, network } = hre;
  const [Coordinator] = await ethers.getSigners();
  const roundId = Number(process.env.ROUND_ID as string);
  const chainId = network.config.chainId!;
  const contractStates = new ContractStates(chainId, roundId, Coordinator, hre);

  try {
    const MACIQFStrategy = await contractStates.getMACIQFStrategy();
    
    const isFinalized = await MACIQFStrategy.isFinalized();

    if (!isFinalized) {
      throw new Error("You cannot emergentWithdraw a non finalized round");
    }

    const isCancelled = await MACIQFStrategy.isCancelled();

    if (isCancelled) {
      throw new Error("You cannot emergentWithdraw a canceled round");
    }

    const finalizedAt = await MACIQFStrategy.finalizedAt();

    const block = await Coordinator.provider!.getBlock("latest");

    const blockTimestamp = block ? block.timestamp : 0;

    if (
      BigInt(blockTimestamp) - finalizedAt <
      (await MACIQFStrategy.EMERGENCY_WITHDRAWAL_DELAY())
    ) {
      throw new Error(
        "You cannot emergentWithdraw before the emergency withdrawal delay"
      );
    }

    const token = await contractStates.getMACIQFToken();

    const emergencyWithdrawTx = await MACIQFStrategy.emergencyWithdraw(token);
    await emergencyWithdrawTx.wait();

    console.log("emergencyWithdraw was successful");
  } catch (error) {
    console.error("Error in emergencyWithdraw:", error);
    process.exitCode = 1;
  }
});
