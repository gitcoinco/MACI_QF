import { ethers } from "hardhat";
import { genTreeCommitment as genTallyResultCommitment } from "maci-crypto";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { mergeSubtrees } from "./mergeMaciSubtrees";
import { generateProofs } from "./generateProofs";
import { proveOnChainScript } from "./proveOnChain";
import { publishTallyHash } from "./publishTallyHash";
import { addTallyResultsBatchScript } from "./addTallyResultsBatch";
import { JSONFile } from "../test/utils/JSONFile";
import { PrivKey, Keypair } from "maci-domainobjs";
import { MACIQF } from "../typechain-types";

dotenv.config();

const proofOutputDirectory = process.env.PROOF_OUTPUT_DIR || "./scripts/proof_output";
const voteOptionTreeDepth = 3;

async function finalizeRound() {
  try {
    const [Coordinator] = await ethers.getSigners();

    const SerializedPrivateKey = process.env.COORDINATOR_PRIVATE_KEY as string;
    const deserializedPrivKey = PrivKey.deserialize(SerializedPrivateKey);
    const CoordinatorKeypair = new Keypair(deserializedPrivKey);

    const MACIQFStrategyAddress = "0x9b81331ba63045929e5979c48bf6ae66f5e19448";
    const MACIQFStrategy = (await ethers.getContractAt(
      "MACIQF",
      MACIQFStrategyAddress,
      Coordinator
    )) as MACIQF;

    const pollContracts = await MACIQFStrategy.pollContracts();
    const maciContractAddress = await MACIQFStrategy.maci();
    const tallyContractAddress = pollContracts[2];
    const mpContractAddress = pollContracts[1];

    const random = Math.floor(Math.random() * 10 ** 8);
    const outputDir = path.join(proofOutputDirectory, `${random}`);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // await mergeSubtrees(maciContractAddress, Coordinator);

    await generateProofs(outputDir, maciContractAddress, tallyContractAddress, CoordinatorKeypair, Coordinator);

    // await proveOnChainScript(outputDir, maciContractAddress, mpContractAddress, tallyContractAddress, Coordinator);

    // const tallyFile = path.join(outputDir, "tally.json");
    // await publishTallyHash(tallyFile, MACIQFStrategy, Coordinator);

    // const tally = JSONFile.read(tallyFile);
    // await addTallyResultsBatchScript(tally, MACIQFStrategy, Coordinator);

    // const newResultCommitment = genTallyResultCommitment(
    //   tally.results.tally.map((x: string) => BigInt(x)),
    //   BigInt(tally.results.salt),
    //   voteOptionTreeDepth
    // );

    // const perVOSpentVoiceCreditsCommitment = genTallyResultCommitment(
    //   tally.perVOSpentVoiceCredits.tally.map((x: string) => BigInt(x)),
    //   BigInt(tally.perVOSpentVoiceCredits.salt),
    //   voteOptionTreeDepth
    // );

    // const finalize = await MACIQFStrategy.connect(Coordinator).finalize(
    //   tally.totalSpentVoiceCredits.spent,
    //   tally.totalSpentVoiceCredits.salt,
    //   newResultCommitment.toString(),
    //   perVOSpentVoiceCreditsCommitment.toString()
    // );

    // await finalize.wait();
    console.log("Finalized round");
  } catch (error) {
    console.error("Error in finalizeRound:", error);
    process.exitCode = 1;
  }
}

// Ensuring process does not exit prematurely
finalizeRound().then(() => {
  console.log("finalizeRound completed successfully");
}).catch(error => {
  console.error("Error in finalizeRound execution:", error);
  process.exitCode = 1;
});
