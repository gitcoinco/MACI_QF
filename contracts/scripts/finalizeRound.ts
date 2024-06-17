import { ethers } from "hardhat";
import { existsSync, mkdirSync } from "fs";
import path from "path";

import { Keypair, PrivKey, PubKey } from "maci-domainobjs";
import { genTreeCommitment as genTallyResultCommitment } from "maci-crypto";
import { addTallyResultsBatch, mergeMaciSubtrees } from "../test/utils/maci";
import { getCircuitFiles } from "../test/utils/circuits";
import { JSONFile } from "../test/utils/JSONFile";
import { getIpfsHash } from "../test/utils/ipfs";
import { genProofs, proveOnChain, GenProofsArgs } from "maci-cli";
import { MACIQF } from "../typechain-types";
import { getTalyFilePath } from "../test/utils/misc";

import dotenv from "dotenv";
import { genAndSubmitProofs } from "../test/utils";
dotenv.config();
const circuitDirectory = process.env.CIRCUIT_DIRECTORY || "./zkeys/zkeys";
const proofOutputDirectory = process.env.PROOF_OUTPUT_DIR || "./proof_output";
const tallyBatchSize = Number(process.env.TALLY_BATCH_SIZE || 8);
const voteOptionTreeDepth = 3;

async function finalizeRound() {
  const [Coordinator] = await ethers.getSigners();

  const SerializedPrivateKey = process.env.COORDINATOR_PRIVATE_KEY as string;

  console.log("SerializedPrivateKey", SerializedPrivateKey);

  const deserializedPrivKey = PrivKey.deserialize(SerializedPrivateKey);

  const CoordinatorKeypair = new Keypair(deserializedPrivKey);

  const MACIQFStrategyAddress = "0x55a522c0a5418e22c2405333e56ef4de60c25f29";

  const MACIQFStrategy = (await ethers.getContractAt(
    "MACIQF",
    MACIQFStrategyAddress,
    Coordinator
  )) as MACIQF;

  const pollContracts = await MACIQFStrategy._pollContracts();
  const coordinatorkey = await MACIQFStrategy.coordinator();
  console.log("coordinatorkey", coordinatorkey);
  const maciContractAddress = await MACIQFStrategy._maci();
  const tallyContractAddress = pollContracts[2];
  const mpContractAddress = pollContracts[1];

  const pollContract = await ethers.getContractAt(
    "ClonablePoll",
    pollContracts[0],
    Coordinator
  );

  const coord = await pollContract.coordinatorPubKey();
  console.log("coord", coord);

  const keyAsContractParams = CoordinatorKeypair.pubKey.asContractParam();

  console.log("keyAsContractParams", keyAsContractParams);

  const pubkeyAsContractParam = PubKey.isValidSerializedPubKey(
    "macipk.90441dcc0d4fe8fe9736801623169e6e43dadbe3f2e5b09cc5cbc7826f0ddf1c"
  );

  console.log("pubkeyAsContractParam", pubkeyAsContractParam);

  const random = Math.floor(Math.random() * 10 ** 8);

  const outputDir = path.join(proofOutputDirectory, `${random}`);

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Merge MACI Subtrees
  async function mergeSubtrees() {
    await mergeMaciSubtrees({
      maciAddress: maciContractAddress,
      pollId: 0n,
      numQueueOps: "1",
      signer: Coordinator,
      quiet: true,
    });
  }

  console.log("Merged Subtrees");

  // Generate Proofs and Submit to MACI Contract
  async function generateProofsAndSubmit() {
    console.log("Generating Proofs");

    await genAndSubmitProofs({
      coordinatorKeypair: CoordinatorKeypair,
      coordinator: Coordinator,
      maciAddress: maciContractAddress,
      tallyContractAddress: tallyContractAddress,
      mpContractAddress: mpContractAddress,
      outputDir: outputDir,
      circuitDirectory: circuitDirectory,
      maciTransactionHash: undefined,
    });

    console.log("Proofs Submitted");
  }

  // Publish Tally Hash
  async function publishTallyHash() {
    const tallyFile = getTalyFilePath(outputDir);
    const tally = JSONFile.read(tallyFile) as any;
    const tallyHash = await getIpfsHash(tally);

    const publishTallyHashReceipt = await MACIQFStrategy.connect(
      Coordinator
    ).publishTallyHash(tallyHash);
    await publishTallyHashReceipt.wait();

    console.log("Tally Hash Published");
  }

  // Add Tally Results in Batches
  async function addTallyResults() {
    const tallyFile = getTalyFilePath(outputDir);
    const tally = JSONFile.read(tallyFile) as any;
    const recipientTreeDepth = voteOptionTreeDepth;

    console.log("Adding Tally Results");

    await addTallyResultsBatch(
      MACIQFStrategy.connect(Coordinator) as MACIQF,
      recipientTreeDepth,
      tally,
      tallyBatchSize
    );

    console.log("Tally Results Added");
  }

  // Finalize the Round
  async function finalize() {
    console.log("Finalizing Round");
    const tallyFile = getTalyFilePath(outputDir);
    const tally = JSONFile.read(tallyFile) as any;
    const recipientTreeDepth = voteOptionTreeDepth;

    const newResultCommitment = genTallyResultCommitment(
      tally.results.tally.map((x: string) => BigInt(x)),
      BigInt(tally.results.salt),
      recipientTreeDepth
    );

    const perVOSpentVoiceCreditsCommitment = genTallyResultCommitment(
      tally.perVOSpentVoiceCredits.tally.map((x: string) => BigInt(x)),
      BigInt(tally.perVOSpentVoiceCredits.salt),
      recipientTreeDepth
    );

    const finalize = await MACIQFStrategy.connect(Coordinator).finalize(
      tally.totalSpentVoiceCredits.spent,
      tally.totalSpentVoiceCredits.salt,
      newResultCommitment.toString(),
      perVOSpentVoiceCreditsCommitment.toString()
    );

    await finalize.wait();

    console.log("Round Finalized");
  }

  await mergeSubtrees();
  await generateProofsAndSubmit();
  await publishTallyHash();
  await addTallyResults();
  await finalize();
}

finalizeRound().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

