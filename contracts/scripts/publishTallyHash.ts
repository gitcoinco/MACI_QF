import { ethers } from "hardhat";
import { JSONFile } from "../test/utils/JSONFile";
import { getIpfsHash } from "../test/utils/ipfs";
import dotenv from "dotenv";

dotenv.config();

async function publishTallyHash(tallyFile: string, MACIQFStrategy: any, signer: any) {
  const tally = JSONFile.read(tallyFile);
  const tallyHash = await getIpfsHash(tally);

  const publishTallyHashReceipt = await MACIQFStrategy.connect(signer).publishTallyHash(tallyHash);
  await publishTallyHashReceipt.wait();

  console.log("Published tally hash");
}

export { publishTallyHash };
