import { ethers } from "hardhat";
import { existsSync, mkdirSync } from "fs";
import path from "path";

import { Keypair, PrivKey } from "maci-domainobjs";
import { genTreeCommitment as genTallyResultCommitment } from "maci-crypto";
import {
  addTallyResultsBatch,
  mergeMaciSubtrees,
} from "../test/utils/maci";
import { getCircuitFiles } from "../test/utils/circuits";
import { JSONFile } from "../test/utils/JSONFile";
import { getIpfsHash } from "../test/utils/ipfs";
import { genProofs, proveOnChain, GenProofsArgs } from "maci-cli";
import { MACIQF } from "../typechain-types";
import { getTalyFilePath } from "../test/utils/misc";

import dotenv from "dotenv";
dotenv.config();
const circuitDirectory = process.env.CIRCUIT_DIRECTORY || "./zkeys/zkeys";
const proofOutputDirectory = process.env.PROOF_OUTPUT_DIR || "./proof_output";
const tallyBatchSize = Number(process.env.TALLY_BATCH_SIZE || 8);
const voteOptionTreeDepth = 3;

async function finalizeRound() {
  const [Coordinator] = await ethers.getSigners();

  const SerializedPrivateKey = process.env.COORDINATOR_PRIVATE_KEY || "0x";

  const deserializedPrivKey = PrivKey.deserialize(SerializedPrivateKey);

  const CoordinatorKeypair = new Keypair(deserializedPrivKey);

  const MACIQFStrategyAddress = "0x";

  const MACIQFStrategy = (await ethers.getContractAt(
    "MACIQF",
    MACIQFStrategyAddress,
    Coordinator
  )) as MACIQF;

  const pollContracts = await MACIQFStrategy._pollContracts();
  const maciContractAddress = await MACIQFStrategy._maci();
  const tallyContractAddress = pollContracts[2];
  const mpContractAddress = pollContracts[1];

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

  // Generate Proofs and Submit to MACI Contract
  async function generateProofsAndSubmit() {
    const tallyFile = getTalyFilePath(outputDir);

    const {
      processZkFile,
      tallyZkFile,
      processWitness,
      processWasm,
      tallyWitness,
      tallyWasm,
      processDatFile,
      tallyDatFile,
    } = getCircuitFiles("micro", circuitDirectory);

    await genProofs({
      outputDir,
      tallyFile,
      tallyZkey: tallyZkFile,
      processZkey: processZkFile,
      pollId: 0n,
      rapidsnark: undefined,
      processWitgen: processWitness,
      processDatFile: processDatFile,
      tallyWitgen: tallyWitness,
      tallyDatFile: tallyDatFile,
      coordinatorPrivKey: CoordinatorKeypair.privKey.serialize(),
      maciAddress: maciContractAddress,
      transactionHash: undefined,
      processWasm,
      tallyWasm,
      useWasm: true,
      stateFile: undefined,
      startBlock: undefined,
      blocksPerBatch: 30,
      endBlock: undefined,
      signer: Coordinator,
      tallyAddress: tallyContractAddress,
      useQuadraticVoting: true,
      quiet: false,
    } as GenProofsArgs);

    await proveOnChain({
      pollId: 0n,
      proofDir: outputDir,
      maciAddress: maciContractAddress,
      messageProcessorAddress: mpContractAddress,
      tallyAddress: tallyContractAddress,
      signer: Coordinator,
      quiet: true,
    });
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
  }

  // Add Tally Results in Batches
  async function addTallyResults() {
    const tallyFile = getTalyFilePath(outputDir);
    const tally = JSONFile.read(tallyFile) as any;
    const recipientTreeDepth = voteOptionTreeDepth;

    await addTallyResultsBatch(
      MACIQFStrategy.connect(Coordinator) as MACIQF,
      recipientTreeDepth,
      tally,
      tallyBatchSize
    );
  }

  // Finalize the Round
  async function finalize() {
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

