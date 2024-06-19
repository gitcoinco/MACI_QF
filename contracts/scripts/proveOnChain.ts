import { ethers } from "hardhat";
import { proveOnChain } from "maci-cli";
import dotenv from "dotenv";

dotenv.config();

async function proveOnChainScript(
  proofDir: string,
  maciContractAddress: string,
  mpContractAddress: string,
  tallyContractAddress: string,
  signer: any
) {
  await proveOnChain({
    pollId: 0n,
    proofDir,
    maciAddress: maciContractAddress,
    messageProcessorAddress: mpContractAddress,
    tallyAddress: tallyContractAddress,
    signer: signer,
    quiet: true,
  });

  console.log("Finished proveOnChain");
}

export { proveOnChainScript };
