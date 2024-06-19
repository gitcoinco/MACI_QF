import { ethers } from "hardhat";
import { mergeMaciSubtrees } from "../test/utils/maci";
import dotenv from "dotenv";

dotenv.config();

async function mergeSubtrees(maciContractAddress: string, signer: any) {
  await mergeMaciSubtrees({
    maciAddress: maciContractAddress,
    pollId: 0n,
    numQueueOps: "1",
    signer: signer,
    quiet: true,
  });
  console.log("MERGED MACI SUBTREES");
}

export { mergeSubtrees };
