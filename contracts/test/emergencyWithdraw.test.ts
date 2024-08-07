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
const Debug = process.env.DEBUG === "true";

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
    maciAddress = await maciContract.getAddress();

    outputDir = path.join(proofOutputDirectory, `${random}`);

    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }
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
    const recipient1LatestUpdate = (await MACIQFStrategy.recipients(recipient1)).lastUpdateAt;
    const recipient2LatestUpdate = (await MACIQFStrategy.recipients(recipient2)).lastUpdateAt;
    const reviewRecipientsTx = await MACIQFStrategy.connect(
      Coordinator
    ).reviewRecipients([recipient1, recipient2] , [recipient1LatestUpdate,recipient2LatestUpdate] , [2, 2]);

    await reviewRecipientsTx.wait();
  });

  it("Should allow the contribution to gain tokens and allocate", async () => {

    // Time travel to the allocation period
    await timeTravel(Coordinator.provider as unknown as EthereumProvider, 210);


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
      quiet: !Debug,
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
      quiet: !Debug,
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
    expect(recipient.totalVotesReceived).to.be.greaterThan(0);

    let recipientAddress2 = await recipient2.getAddress();
    recipient = await MACIQFStrategy.getRecipient(recipientAddress2);
    expect(recipient.totalVotesReceived).to.be.greaterThan(0);
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

  it("Should revert to use emergency withdraw when duration before valid emergency withdraw period", async () => {
    expect(
      MACIQFStrategy.emergencyWithdraw(MACIQFStrategy.NATIVE())
    ).to.revertedWith(`INVALID`);
      
  });

  it("Should Time travel to emergency time and withdraw full amount", async () => {
    const hour = 3600;
    const day = 24 * hour;
    const month = 30 * day;
    await timeTravel(Coordinator.provider as unknown as EthereumProvider, month + 1);
    // Create a timeout of 4sec to allow the time travel to take effect
    await new Promise((resolve) => setTimeout(resolve, 4000));

    const emergencyWithdrawTx = await MACIQFStrategy.connect(Coordinator).emergencyWithdraw(MACIQFStrategy.NATIVE());
    await emergencyWithdrawTx.wait();
    // Check if the pool amount is 0
    const provider = Coordinator.provider!;

    const poolAmountAfterEmergencyWithdrawal = await provider.getBalance(
      await MACIQFStrategy.getAddress()
    );
    expect(poolAmountAfterEmergencyWithdrawal).to.be.equal(0);
  });
});
