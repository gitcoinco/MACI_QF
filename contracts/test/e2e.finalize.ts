import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer } from "ethers";
import { existsSync, mkdirSync } from "fs";
import path from "path";
import dotenv from "dotenv";

import {
  JSONFile,
  getIpfsHash,
  getTalyFilePath,
  mergeMaciSubtrees,
  addTallyResultsBatch,
  finalize,
  genAndSubmitProofs,
  distribute,
} from "./utils/index";

import { MACIQF, Allo } from "../typechain-types";
import { Keypair, PrivKey } from "maci-domainobjs";

dotenv.config();

let circuitDirectory = process.env.CIRCUIT_DIRECTORY || "./zkeys/zkeys";
const proofOutputDirectory = process.env.PROOF_OUTPUT_DIR || "./proof_output";
const tallyBatchSize = Number(process.env.TALLY_BATCH_SIZE || 8);
const voteOptionTreeDepth = 3;

if (!existsSync(circuitDirectory)) {
  circuitDirectory = "../../zkeys/zkeys";
}

describe("e2e", function test() {
  this.timeout(9000000000000000);
  let MACIQFStrategy: MACIQF;
  let AlloContract: Allo;

  let Coordinator: Signer;
  let coordinatorKeypair: Keypair;
  let maciContractAddress: string;
  let tallyContractAddress: string;
  let mpContractAddress: string;
  let outputDir: string;
  let roundId: number;
  let startBlock = 0;

  before(async () => {
    [Coordinator] = await ethers.getSigners();

    const SerializedPrivateKey = process.env.COORDINATOR_SECRET_KEY as string;
    const deserializedPrivKey = PrivKey.deserialize(SerializedPrivateKey);
    coordinatorKeypair = new Keypair(deserializedPrivKey);

    MACIQFStrategy = (await ethers.getContractAt(
      "MACIQF",
      "0x6d4b63d93a25ee235af118b4a2489c57be044b94",
      Coordinator
    )) as MACIQF;

    AlloContract = (await ethers.getContractAt(
      "Allo",
      "0x1133eA7Af70876e64665ecD07C0A0476d09465a1",
      Coordinator
    )) as Allo;

    const pollContracts = await MACIQFStrategy._pollContracts();
    maciContractAddress = await MACIQFStrategy._maci();
    tallyContractAddress = pollContracts[2];
    mpContractAddress = pollContracts[1];

    const random = 1;
    outputDir = path.join(proofOutputDirectory, `${random}`);

    roundId = 287;
    startBlock = 6140298;

    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }
  });

  it("Should Finalize the round and distribute funds", async () => {
    await mergeMaciSubtrees({
      maciAddress: maciContractAddress as string,
      pollId: 0n,
      numQueueOps: "1",
      signer: Coordinator,
      quiet: false,
    });

    await genAndSubmitProofs({
      coordinatorKeypair: coordinatorKeypair,
      coordinator: Coordinator,
      maciAddress: maciContractAddress,
      tallyContractAddress: tallyContractAddress,
      mpContractAddress: mpContractAddress,
      outputDir: outputDir,
      circuitDirectory: circuitDirectory,
      maciTransactionHash: undefined,
      startBlock: startBlock,
    });

    const tallyFile = getTalyFilePath(outputDir);
    const tally = JSONFile.read(tallyFile) as any;
    const tallyHash = await getIpfsHash(tally);

    let publishTallyHashReceipt = await MACIQFStrategy.connect(
      Coordinator
    ).publishTallyHash(tallyHash);
    await publishTallyHashReceipt.wait();

    console.log("Tally hash", tallyHash);

    await addTallyResultsBatch(
      MACIQFStrategy.connect(Coordinator) as MACIQF,
      voteOptionTreeDepth,
      tally,
      tallyBatchSize
    );
    console.log("Tally results added in batches");

    let isFinalized = await finalize({
      MACIQFStrategy,
      Coordinator,
      voteOptionTreeDepth,
      outputDir,
    });
    expect(isFinalized).to.be.true;

    const distributeResponse = await distribute({
      outputDir,
      AlloContract,
      MACIQFStrategy,
      distributor: Coordinator,
      recipientTreeDepth: voteOptionTreeDepth,
      recipients: [
        "0xb543d56ee04f516602057429ec4f1c85c19b1319",
        "0xe2bdf9f84be10b5d1f535c7c3d4544d08d4965b6",
      ],
      roundId: roundId,
    });

    console.log("Distribute Response", distributeResponse);
  });
});
