import { expect } from "chai";
import { ethers } from "hardhat";

import { Signer } from "ethers";
import { existsSync, mkdirSync } from "fs";

import { Keypair } from "maci-domainobjs";

import {
  bnSqrt,
  JSONFile,
  getIpfsHash,
  getTalyFilePath,
  allocate,
  publishBatch,
  register,
  genAndSubmitProofs,
  mergeMaciSubtrees,
  addTallyResultsBatch,
  finalize,
  distribute,
} from "./utils/index";

import type { EthereumProvider } from "hardhat/types";

import {
  MACIQF,
  ClonableMACI,
  ClonablePoll,
  ClonableTally,
  ClonableMessageProcessor,
  Allo,
} from "../typechain-types";

import { deployTestContracts, timeTravel } from "./utils_maciqf";

import path from "path";

import dotenv from "dotenv";

dotenv.config();

// MACI zkFiles
let circuitDirectory = process.env.CIRCUIT_DIRECTORY || "./zkeys/zkeys";
const proofOutputDirectory = process.env.PROOF_OUTPUT_DIR || "./proof_output";
const tallyBatchSize = Number(process.env.TALLY_BATCH_SIZE || 8);

if (!existsSync(circuitDirectory)) {
  circuitDirectory = "../../zkeys/zkeys";
}

const voteOptionTreeDepth = 3;

describe("e2e", function test() {
  this.timeout(9000000000000000);
  let mpContract: ClonableMessageProcessor;
  let MACIQFStrategy: MACIQF;

  let Coordinator: Signer;
  let allocator: Signer;
  let recipient1: Signer;
  let recipient2: Signer;

  // create a new user keypair
  const keypair = new Keypair();
  const keypair2 = new Keypair();
  let coordinatorKeypair: Keypair;
  let maciTransactionHash: string;
  let maciContract: ClonableMACI;
  let pollContract: ClonablePoll;
  let tallyContract: ClonableTally;
  let AlloContract: Allo;

  const UNIT = 10n ** 18n;

  const CONTRIBUTION_AMOUNT1 = 100n * UNIT;

  const CONTRIBUTION_AMOUNT2 = 100n * UNIT;

  const SINGLEVOTE = 10n ** 5n;

  const random = Math.floor(Math.random() * 10 ** 8);

  let recipientAddress1: string;
  let recipientAddress2: string;
  let outputDir: string;
  let maciAddress: string;

  before(async () => {
    const signer = new ethers.Wallet(process.env.PRIVATE_KEY!, ethers.provider);

    Coordinator = signer.connect(ethers.provider);

    const contracts = await deployTestContracts();

    AlloContract = contracts.Allo;
    MACIQFStrategy = contracts.MACIQF_STRATEGY;
    pollContract = contracts.pollContract;
    tallyContract = contracts.tallyContract;
    mpContract = contracts.messageProcessorContract;
    maciContract = contracts.maciContract;
    allocator = contracts.user1;
    recipient1 = contracts.user2;
    recipient2 = contracts.user3;
    maciTransactionHash = contracts.maciTransitionHash || "";
    coordinatorKeypair = contracts.CoordinatorKeypair;

    recipientAddress1 = await recipient1.getAddress();
    recipientAddress2 = await recipient2.getAddress();
    maciAddress = await maciContract.getAddress();

    outputDir = path.join(proofOutputDirectory, `${random}`);

    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }
  });

  it("Should allow the contribution to gain tokens and allocate", async () => {
    // Donate to the pool without proof
    await allocate({
      AlloContract: AlloContract,
      allocator: allocator,
      keypair: keypair,
      contributionAmount: CONTRIBUTION_AMOUNT1,
    });
    // Another donation to the pool without proof
    await allocate({
      AlloContract: AlloContract,
      allocator: recipient1,
      keypair: keypair2,
      contributionAmount: CONTRIBUTION_AMOUNT2,
    });
  });

  it("Should Register Recipients", async () => {
    // Register recipients
    await register({
      AlloContract: AlloContract,
      registree: recipient1,
    });

    await register({
      AlloContract: AlloContract,
      registree: recipient2,
    });
  });

  it("Should Review Recipients", async () => {
    const reviewRecipientsTx = await MACIQFStrategy.connect(
      Coordinator
    ).reviewRecipients([recipient1, recipient2], [2, 2]);

    await reviewRecipientsTx.wait();
  });

  it("Should allow the Contributors to vote", async () => {
    // create 1 vote message for the recipient1
    const votingOption1 = 0n;

    // create 1 vote message for the recipient1
    const votingOption2 = 1n;

    await publishBatch({
      messages: [
        {
          stateIndex: 1n,
          voteOptionIndex: votingOption1,
          nonce: 1n,
          newVoteWeight: bnSqrt(SINGLEVOTE * 78n),
        },
        {
          stateIndex: 1n,
          voteOptionIndex: votingOption2,
          nonce: 2n,
          newVoteWeight: bnSqrt(SINGLEVOTE * 22n),
        },
      ],
      pollId: 0n,
      Poll: pollContract,
      publicKey: keypair.pubKey,
      privateKey: keypair.privKey,
      signer: allocator,
    });

    await publishBatch({
      messages: [
        {
          stateIndex: 2n,
          voteOptionIndex: votingOption1,
          nonce: 1n,
          newVoteWeight: bnSqrt(SINGLEVOTE * 25n),
        },
        {
          stateIndex: 2n,
          voteOptionIndex: votingOption2,
          nonce: 2n,
          newVoteWeight: bnSqrt(SINGLEVOTE * 75n),
        },
      ],
      pollId: 0n,
      Poll: pollContract,
      publicKey: keypair2.pubKey,
      privateKey: keypair2.privKey,
      signer: recipient1,
    });

    await timeTravel(Coordinator.provider as unknown as EthereumProvider, 700);
  });

  it("Should Merge MACI Subtrees", async () => {
    await mergeMaciSubtrees({
      maciAddress,
      pollId: 0n,
      numQueueOps: "1",
      signer: Coordinator,
      quiet: true,
    });
  });

  it("Should Generate Proofs and Submit to MACI Contract", async () => {
    const tallyAddress = await tallyContract.getAddress();
    const messageProcessorAddress = await mpContract.getAddress();

    await genAndSubmitProofs({
      coordinatorKeypair: coordinatorKeypair,
      coordinator: Coordinator,
      maciAddress: maciAddress,
      tallyContractAddress: tallyAddress,
      mpContractAddress: messageProcessorAddress,
      outputDir: outputDir,
      circuitDirectory: circuitDirectory,
      maciTransactionHash: maciTransactionHash,
    });
  });

  it("Should Publish Tally Hash", async () => {
    const tallyFile = getTalyFilePath(outputDir);

    const tally = JSONFile.read(tallyFile) as any;
    const tallyHash = await getIpfsHash(tally);

    let publishTallyHashReceipt = await MACIQFStrategy.connect(
      Coordinator
    ).publishTallyHash(tallyHash);

    await publishTallyHashReceipt.wait();

    console.log("Tally hash", tallyHash);
  });

  it("Should Add Tally Results in Batches", async () => {
    const tallyFile = getTalyFilePath(outputDir);
    const tally = JSONFile.read(tallyFile) as any;

    await addTallyResultsBatch(
      MACIQFStrategy.connect(Coordinator) as MACIQF,
      voteOptionTreeDepth,
      tally,
      tallyBatchSize
    );
  });

  it("Recipient should have more than 0 votes received", async () => {
    let recipientAddress = await recipient1.getAddress();
    let recipient = await MACIQFStrategy.getRecipient(recipientAddress);
    console.log("Recipient", recipient);

    let recipientAddress2 = await recipient2.getAddress();
    recipient = await MACIQFStrategy.getRecipient(recipientAddress2);
    console.log("Recipient 2", recipient);
  });

  it("Should Finalize the Round", async () => {
    let isFinalized = await finalize({
      MACIQFStrategy,
      Coordinator,
      voteOptionTreeDepth,
      outputDir,
    });
    expect(isFinalized).to.be.true;
  });

  it("Should Distribute Founds", async () => {
    const distributeResponse = await distribute({
      outputDir,
      AlloContract,
      MACIQFStrategy,
      distributor: Coordinator,
      recipientTreeDepth: voteOptionTreeDepth,
      recipients: [recipient1, recipient2],
    });

    console.log("Distribute Response", distributeResponse);

    expect(
      distributeResponse.recipientsBalances[recipientAddress1].after
    ).to.be.greaterThan(
      distributeResponse.recipientsBalances[recipientAddress1].before
    );
    expect(
      distributeResponse.recipientsBalances[recipientAddress2].after
    ).to.be.greaterThan(
      distributeResponse.recipientsBalances[recipientAddress2].before
    );
  });
});
