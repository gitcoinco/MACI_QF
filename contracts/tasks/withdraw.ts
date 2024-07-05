import { task } from "hardhat/config";
import dotenv from "dotenv";
import ContractStates from "./helpers/contractStates";
dotenv.config();

task(
  "withdraw",
  "Withdraws the round matching pool when the round is canceled"
).setAction(async (_, hre) => {
  const { ethers, network } = hre;
  const [Coordinator] = await ethers.getSigners();
  const roundId = Number(process.env.ROUND_ID as string);
  const chainId = network.config.chainId!;
  const contractStates = new ContractStates(chainId, roundId, Coordinator, hre);

  try {
    const MACIQFStrategy = await contractStates.getMACIQFStrategy();

    const isCancelled = await MACIQFStrategy.isCancelled();

    if (!isCancelled) {
      throw new Error("You cannot withdraw a non canceled round");
    }

    const token = await contractStates.getMACIQFToken();

    const WithdrawTx = await MACIQFStrategy.withdraw(token);
    await WithdrawTx.wait();

    console.log("Matching pool Withdraw was successful");
  } catch (error) {
    console.error("Error in Withdraw:", error);
    process.exitCode = 1;
  }
});
