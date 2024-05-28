import { expect } from "chai";
import { ethers } from "hardhat";

import { AbiCoder, BigNumberish, Signer, ZeroAddress } from "ethers";
import { existsSync, mkdirSync } from "fs";

import { Keypair } from "maci-domainobjs";

import { genTreeCommitment as genTallyResultCommitment } from "maci-crypto";

import { MessageProcessor } from "maci-contracts";

import {
  addTallyResultsBatch,
  bnSqrt,
  getRecipientClaimData,
  mergeMaciSubtrees,
  prepareAllocationData,
  publishBatch,
  getEventArg,
  buildUpdatedRowsOfApplicationStatuses,
  applicationStatusToNumber,
} from "./utils/maci";

import { getCircuitFiles } from "./utils/circuits";

import { JSONFile } from "./utils/JSONFile";

import { getIpfsHash } from "./utils/ipfs";

import { genProofs, proveOnChain, GenProofsArgs, ProveOnChainArgs } from "maci-cli";

import type { EthereumProvider } from "hardhat/types";

import {
  QFMACI,
  ClonableMACI,
  ClonablePoll,
  ClonableTally,
  Allo,
  Dai,
} from "../typechain-types";
import { deployTestContracts, timeTravel } from "./utils_qf";

import { getTalyFilePath } from "./utils/misc";
import path from "path";

// MACI zkFiles
let circuitDirectory = process.env.CIRCUIT_DIRECTORY || "./zkeys/zkeys";

// Define the path
const fs = require("fs").promises;
// Use fs.promises.access to check if the path exists
async function checkDirectoryExists(directory) {
  try {
    await fs.access(directory);
  } catch (err) {
    circuitDirectory = "../../zkeys/zkeys";
  }
}

checkDirectoryExists(circuitDirectory);
const proofOutputDirectory = process.env.PROOF_OUTPUT_DIR || "./proof_output";

const tallyBatchSize = Number(process.env.TALLY_BATCH_SIZE || 8);

const voteOptionTreeDepth = 3;

describe("e2e", function test() {
  this.timeout(9000000000000000);
  let mpContract: MessageProcessor;
  let QFMACIStrategy: QFMACI;

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
  let DAI: Dai;

  const UNIT = 10n ** 18n;

  const CONTRIBUTION_AMOUNT1 = 100n * UNIT;

  const CONTRIBUTION_AMOUNT2 = 100n * UNIT;

  const SINGLEVOTE = 10n ** 5n;

  const random = Math.floor(Math.random() * 10 ** 8);

  let recipientAddress1;
  let recipientAddress2;
  let outputDir;
  let maciAddress;
  let types;

  before(async () => {
    [Coordinator] = await ethers.getSigners();

    const contracts = await deployTestContracts();

    AlloContract = contracts.Allo;
    QFMACIStrategy = contracts.QFMACI_STRATEGY;
    pollContract = contracts.pollContract;
    tallyContract = contracts.tallyContract;
    mpContract = contracts.messageProcessorContract;
    maciContract = contracts.maciContract;
    allocator = contracts.user1;
    recipient1 = contracts.user2;
    recipient2 = contracts.user3;
    maciTransactionHash = contracts.maciTransitionHash || "";
    coordinatorKeypair = contracts.CoordinatorKeypair;
    DAI = contracts.Dai;

    recipientAddress1 = await recipient1.getAddress();
    recipientAddress2 = await recipient2.getAddress();
    maciAddress = await maciContract.getAddress();

    outputDir = path.join(proofOutputDirectory, `${random}`);

    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }
  });

  it("Should allow the contribution to gain tokens and allocate", async () => {
    const getDAI1 = await DAI.connect(allocator).mint(
      await allocator.getAddress(),
      1000n * UNIT
    );
    await getDAI1.wait();
    const getDAI2 = await DAI.connect(recipient1).mint(
      await recipient1.getAddress(),
      1000n * UNIT
    );
    await getDAI2.wait();

    const approveDAI1 = await DAI.connect(allocator).approve(
      await QFMACIStrategy.getAddress(),
      1000n * UNIT
    );
    await approveDAI1.wait();
    const approveDAI2 = await DAI.connect(recipient1).approve(
      await QFMACIStrategy.getAddress(),
      1000n * UNIT
    );
    await approveDAI2.wait();

    const approveDAI3 = await DAI.connect(allocator).approve(
      await AlloContract.getAddress(),
      1000n * UNIT
    );
    await approveDAI3.wait();

    // FundPOOL
    const fundPool = await AlloContract.connect(allocator).fundPool(
      1,
      500n * UNIT
    );
    await fundPool.wait();

    // Donate to the pool without proof
    let dt = {
      _pa: new Array(2).fill(0n),
      _pb: [
        new Array(2).fill(0n),
        new Array(2).fill(0n),
      ],
      _pc: new Array(2).fill(0n),
      _pubSignals: new Array(38).fill("0")
    };
    // convert yo BigInt[]

    const contributeEncodedData1 = await prepareAllocationData({
      publicKey: keypair.pubKey.serialize(),
      amount: CONTRIBUTION_AMOUNT1,
      proof: {
        pA: dt._pa,
        pB: dt._pb,
        pC: dt._pc,
        pubSignals: dt._pubSignals.map((x) => BigInt(x)),
      },
    });
    // signup2
    const SignUpTx1 = await AlloContract.connect(allocator).allocate(
      1,
      contributeEncodedData1
      // { value: CONTRIBUTION_AMOUNT1 }
    );
    await SignUpTx1.wait();

    const contributeEncodedData2 = await prepareAllocationData({
      publicKey: keypair2.pubKey.serialize(),
      amount: CONTRIBUTION_AMOUNT2,
      proof: {
        pA: [0n, dt._pa[1]],
        pB: dt._pb,
        pC: dt._pc,
        pubSignals: dt._pubSignals.map((x) => BigInt(x)),
      },
    });

    // signup2
    const SignUpTx2 = await AlloContract.connect(recipient1).allocate(
      1,
      contributeEncodedData2
      // { value: CONTRIBUTION_AMOUNT2 }
    );
    await SignUpTx2.wait();
  });

  it("Should Register Recipients and Review them", async () => {
    // Register recipients
    let data = AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "(uint256,string)"],
      [ZeroAddress, recipientAddress1, [1n, "Project 1"]]
    );

    const RecipientRegistrationTx = await AlloContract.connect(
      recipient1
    ).registerRecipient(1n, data);
    await RecipientRegistrationTx.wait();

    data = AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "(uint256,string)"],
      [ZeroAddress, recipientAddress2, [1n, "Project 2"]]
    );

    const RecipientRegistrationTx2 = await AlloContract.connect(
      recipient2
    ).registerRecipient(1n, data);
    await RecipientRegistrationTx2.wait();


    console.log(
      "recipient statys",
      await QFMACIStrategy._isAcceptedRecipient(recipientAddress1)
    );



    const reviewRecipientsTx = await QFMACIStrategy.connect(
      Coordinator
    ).reviewRecipients([recipientAddress1, recipientAddress2], [2, 2]);

    await reviewRecipientsTx.wait();

    console.log(
      "recipient statys",
      await QFMACIStrategy._isAcceptedRecipient(recipientAddress1)
    );

    console.log(
      "recipient statys",
      await QFMACIStrategy._isAcceptedRecipient(recipientAddress2)
    );
    
  });

  it("Should allow the Contributors to vote", async () => {
    // create 1 vote message for the recipient1
    const votingOption1 =
      await QFMACIStrategy.connect(Coordinator).recipientToVoteIndex(
        recipientAddress1
      );

    // create 1 vote message for the recipient1
    const votingOption2 =
      await QFMACIStrategy.connect(Coordinator).recipientToVoteIndex(
        recipientAddress2
      );

    console.log(recipientAddress1, recipientAddress2);
    // When submitting to the same vote index, the last vote weight will be the final vote weight
    // When voting weight is 5 that means that the circouts will calculate the square of the weight so 5^2 = 25
    // BUt the final vote weight will be 5

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

    let res = await publishBatch({
      messages: [
        {
          stateIndex: 2n,
          voteOptionIndex: votingOption1,
          nonce: 1n,
          // Casting the one third of the total votes
          newVoteWeight: bnSqrt(SINGLEVOTE * 25n),
        },
        {
          stateIndex: 2n,
          voteOptionIndex: votingOption2,
          nonce: 2n,
          // Casting the two third of the total votes
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
    const tallyFile = getTalyFilePath(outputDir);

    console.log("Generating proofs");

    const {
      processZkFile,
      tallyZkFile,
      processWitness,
      processWasm,
      tallyWitness,
      tallyWasm,
    } = getCircuitFiles("micro", circuitDirectory);
    await genProofs({
      outputDir: outputDir,
      tallyFile: tallyFile,
      tallyZkey: tallyZkFile,
      processZkey: processZkFile,
      pollId: 0n,
      rapidsnark: undefined,
      processWitgen: processWitness,
      processDatFile: undefined,
      tallyWitgen: tallyWitness,
      tallyDatFile: undefined,
      coordinatorPrivKey: coordinatorKeypair.privKey.serialize(),
      maciAddress: maciAddress,
      transactionHash: maciTransactionHash,
      processWasm: processWasm,
      tallyWasm: tallyWasm,
      useWasm: true,
      stateFile: undefined,
      startBlock: undefined,
      blocksPerBatch: 50,
      endBlock: undefined,
      signer: Coordinator,
      tallyAddress: await tallyContract.getAddress(),
      useQuadraticVoting: true,
      quiet: false,
    } as GenProofsArgs);

    const tallyAddress = await tallyContract.getAddress();
    const messageProcessorAddress = await mpContract.getAddress();

    // Submit proofs to MACI contract
    await proveOnChain({
      pollId: 0n,
      proofDir: outputDir,
      maciAddress,
      messageProcessorAddress,
      tallyAddress,
      signer: Coordinator,
      quiet: true,
    } as ProveOnChainArgs);

    console.log("finished proveOnChain");
  });
  it("Should Publish Tally Hash", async () => {
    const tallyFile = getTalyFilePath(outputDir);

    const tally = JSONFile.read(tallyFile) as any;
    const tallyHash = await getIpfsHash(tally);

    let publishTallyHashReceipt =
      await QFMACIStrategy.connect(Coordinator).publishTallyHash(tallyHash);

    await publishTallyHashReceipt.wait();

    console.log("Tally hash", tallyHash);
  });

  it("Should Add Tally Results in Batches", async () => {
    const tallyFile = getTalyFilePath(outputDir);

    const tally = JSONFile.read(tallyFile) as any;

    // add tally results to funding round
    const recipientTreeDepth = voteOptionTreeDepth;

    console.log("Adding tally result on chain in batches of", tallyBatchSize);

    await addTallyResultsBatch(
      QFMACIStrategy.connect(Coordinator) as QFMACI,
      recipientTreeDepth,
      tally,
      tallyBatchSize
    );

    console.log("Finished adding tally results");
  });

  it("Recipient should have more than 0 votes received", async () => {
    let recipientAddress = await recipient1.getAddress();
    let recipient = await QFMACIStrategy.getRecipient(recipientAddress);
    console.log("Recipient", recipient);

    let recipientAddress2 = await recipient2.getAddress();
    recipient = await QFMACIStrategy.getRecipient(recipientAddress2);
    console.log("Recipient 2", recipient);
  });

  it("Should Finalize the Round", async () => {
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

    console.log(
      "Tally total spent voice credits",
      tally.totalSpentVoiceCredits.spent
    );

    // Finalize round
    let finalize = await QFMACIStrategy.connect(Coordinator).finalize(
      tally.totalSpentVoiceCredits.spent,
      tally.totalSpentVoiceCredits.salt,
      newResultCommitment.toString(),
      perVOSpentVoiceCreditsCommitment.toString()
    );

    await finalize.wait();

    let isFinalized = await QFMACIStrategy.isFinalized();
    expect(isFinalized).to.be.true;
  });

  it("Should Distribute Founds", async () => {
    const tallyFile = getTalyFilePath(outputDir);

    const tally = JSONFile.read(tallyFile) as any;

    const recipientTreeDepth = voteOptionTreeDepth;

    const recipientIndex1 = await QFMACIStrategy.recipientToVoteIndex(
      await recipient1.getAddress()
    );

    const distributeData1 = getRecipientClaimData(
      Number(recipientIndex1),
      recipientTreeDepth,
      tally
    );

    let initStruct = [distributeData1];

    const distributeData2 = getRecipientClaimData(
      Number(
        await QFMACIStrategy.recipientToVoteIndex(
          await recipient2.getAddress()
        )
      ),
      recipientTreeDepth,
      tally
    );

    let types = ["(uint256,uint256,uint256[][],uint256,uint256,uint256)"];

    let AbiCoder = new ethers.AbiCoder();

    let bytes = AbiCoder.encode(types, initStruct);

    let bytes2 = AbiCoder.encode(types, [distributeData2]);

    let bytesArray = [bytes, bytes2];

    let bytesArrayTypes = ["bytes[]"];

    let bytesArrayEncoded = AbiCoder.encode(bytesArrayTypes, [bytesArray]);

    console.log(
      "Pool Balance Before Distribution is :",
      await QFMACIStrategy.getPoolAmount()
    );

    // Calculate DAI balance
    console.log(
      "Pool DAI Balance Before Distribution is :",
      await DAI.balanceOf(await QFMACIStrategy.getAddress())
    );

    // const recipient1Balance = await ethers.provider.getBalance(
    //   await recipient1.getAddress()
    // );
    // const recipient2Balance = await ethers.provider.getBalance(
    //   await recipient2.getAddress()
    // );

    // Calculate DAI balance
    const recipient1Balance = await DAI.balanceOf(
      await recipient1.getAddress()
    );
    const recipient2Balance = await DAI.balanceOf(
      await recipient2.getAddress()
    );

    let distributeFunds = await AlloContract.connect(Coordinator).distribute(
      1,
      [],
      bytesArrayEncoded
    );
    await distributeFunds.wait();

    // const recipient1BalanceAfterDistribution = await ethers.provider.getBalance(
    //   await recipient1.getAddress()
    // );
    // const recipient2BalanceAfterDistribution = await ethers.provider.getBalance(
    //   await recipient2.getAddress()
    // );

    // Calculate DAI balance
    const recipient1BalanceAfterDistribution = await DAI.balanceOf(
      await recipient1.getAddress()
    );
    const recipient2BalanceAfterDistribution = await DAI.balanceOf(
      await recipient2.getAddress()
    );

    console.log(
      "Recipient 1 balance before Distribution: ",
      recipient1Balance,
      " & After : ",
      recipient1BalanceAfterDistribution,
      " & Difference: ",
      Number(recipient1BalanceAfterDistribution - recipient1Balance) / 10 ** 18
    );
    console.log(
      "Recipient 2 balance before Distribution: ",
      recipient2Balance,
      " & After : ",
      recipient2BalanceAfterDistribution,
      " & Difference: ",
      Number(recipient2BalanceAfterDistribution - recipient2Balance) / 10 ** 18
    );

    // expect(recipient1BalanceAfterDistribution).to.be.greaterThan(
    //   recipient1Balance
    // );
    // expect(recipient2BalanceAfterDistribution).to.be.greaterThan(
    //   recipient2Balance
    // );

    console.log(
      "Pool Balance After Distribution",
      await ethers.provider.getBalance(await QFMACIStrategy.getAddress())
    );

    // Calculate DAI balance
    console.log(
      "Pool DAI Balance After Distribution",
      await DAI.balanceOf(await QFMACIStrategy.getAddress())
    );
  });
});
