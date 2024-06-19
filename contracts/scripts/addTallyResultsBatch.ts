import { ethers } from "hardhat";
import { addTallyResultsBatch } from "../test/utils/maci";
import dotenv from "dotenv";

dotenv.config();

const tallyBatchSize = Number(process.env.TALLY_BATCH_SIZE || 8);
const voteOptionTreeDepth = 3;

async function addTallyResultsBatchScript(tally: any, MACIQFStrategy: any, signer: any) {
  await addTallyResultsBatch(
    MACIQFStrategy.connect(signer),
    voteOptionTreeDepth,
    tally,
    tallyBatchSize
  );

  console.log("Added tally results batch");
}

export { addTallyResultsBatchScript };
