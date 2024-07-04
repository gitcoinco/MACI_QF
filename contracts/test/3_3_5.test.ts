import { expect } from "chai";
import { ethers } from "hardhat";

import { Signer } from "ethers";
import { existsSync, mkdirSync } from "fs";

import { register } from "./utils/index";

import { MACIQF, Allo } from "../typechain-types";

import { deployTestContracts } from "./utils_maciqf";

import path from "path";

import dotenv from "dotenv";

dotenv.config();

// MACI zkFiles
let circuitDirectory = process.env.CIRCUIT_DIRECTORY || "./zkeys/zkeys";
const proofOutputDirectory = process.env.PROOF_OUTPUT_DIR || "./proof_output";

if (!existsSync(circuitDirectory)) {
  circuitDirectory = "../../zkeys/zkeys";
}

describe("e2e", function test() {
  this.timeout(9000000000000000);
  let MACIQFStrategy: MACIQF;
  let Coordinator: Signer;
  let recipient1: Signer;
  let recipient2: Signer;
  let AlloContract: Allo;
  const random = Math.floor(Math.random() * 10 ** 8);
  let outputDir: string;

  before(async () => {
    const contracts = await deployTestContracts();

    const signer = new ethers.Wallet(process.env.PRIVATE_KEY!, ethers.provider);
    Coordinator = signer.connect(ethers.provider);
    AlloContract = contracts.Allo;
    MACIQFStrategy = contracts.MACIQF_STRATEGY;
    recipient1 = contracts.user2;
    recipient2 = contracts.user3;

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

  it("Should Review Recipients and not update the status of a recipient that tried to frontrun a review", async () => {
    const recipient1LatestUpdate = (await MACIQFStrategy.recipients(recipient1))
      .lastUpdateAt;
    const recipient2LatestUpdate = (await MACIQFStrategy.recipients(recipient2))
      .lastUpdateAt;

    await register({
      AlloContract: AlloContract,
      registree: recipient2,
    });
    const reviewRecipientsTx = await MACIQFStrategy.connect(
      Coordinator
    ).reviewRecipients(
      [recipient1, recipient2],
      [recipient1LatestUpdate, recipient2LatestUpdate],
      [2, 2]
    );

    await reviewRecipientsTx.wait();

    const recipient2status = (await MACIQFStrategy.recipients(recipient2))
      .status;
    // Checking that recipient status that tried to frontrun the review is not updated and remains INREVIEW status
    expect(recipient2status).to.be.equal(5);
  });
});
