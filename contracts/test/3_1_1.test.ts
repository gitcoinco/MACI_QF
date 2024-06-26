import { expect } from "chai";
import { ethers } from "hardhat";

import { AbiCoder, BytesLike, Signer } from "ethers";
import { existsSync, mkdirSync } from "fs";

import { Keypair } from "maci-domainobjs";

import {
  allocate,
} from "./utils/index";

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
import { time } from "console";
import { EthereumProvider } from "hardhat/types";

dotenv.config();

// MACI zkFiles
let circuitDirectory = process.env.CIRCUIT_DIRECTORY || "./zkeys/zkeys";
const proofOutputDirectory = process.env.PROOF_OUTPUT_DIR || "./proof_output";

if (!existsSync(circuitDirectory)) {
  circuitDirectory = "../../zkeys/zkeys";
}

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

  const random = Math.floor(Math.random() * 10 ** 8);

  let recipientAddress1: string;
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
    maciAddress = await maciContract.getAddress();

    outputDir = path.join(proofOutputDirectory, `${random}`);

    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }
  });

  it("Should allow the contribution to gain tokens and allocate", async () => {
    const provider = allocator.provider! as unknown as EthereumProvider;
    // Go to the allocation phase
    await timeTravel(provider, 210);
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
  it("Should prevent attacker to get others voice credits", async () => {
    const AttackerKeyPair = new Keypair();
    const attacker = recipient2;

    let types = ["address"];
    const allocatorToGetFromHisContributionAmount = recipientAddress1;
    const data = AbiCoder.defaultAbiCoder().encode(types, [
      allocatorToGetFromHisContributionAmount,
    ]);
    const MACIContract = maciContract.connect(attacker);

    expect(
      MACIContract.signUp(
        {
          x: AttackerKeyPair.pubKey.asContractParam().x as bigint,
          y: AttackerKeyPair.pubKey.asContractParam().y as bigint,
        },
        data as BytesLike,
        data as BytesLike
      )
    ).to.revertedWith(`UserNotVerified`);
  });
});
