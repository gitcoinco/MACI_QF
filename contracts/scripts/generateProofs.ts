import { ethers } from "hardhat";
import path from "path";
import { Keypair, PrivKey } from "maci-domainobjs";
import { genProofs, GenProofsArgs } from "maci-cli";
import { getCircuitFiles } from "../test/utils/circuits";
import { JSONFile } from "../test/utils/JSONFile";
import { getTalyFilePath } from "../test/utils/misc";
import { genMaciStateFromContract } from "../test/utils";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const circuitDirectory = process.env.CIRCUIT_DIRECTORY || "./zkeys/zkeys";

async function generateProofs(
  outputDir:string,
  maciContractAddress: string,
  tallyContractAddress: string,
  coordinatorKeypair: Keypair,
  coordinator: any
) : Promise<void> {

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



  const MaciState = (
    await genMaciStateFromContract(
        coordinator.provider!,
        maciContractAddress,
        coordinatorKeypair,
        0n,
        6135029,
        50
      )
  ).toJSON();

  const stateFilePath = path.join(outputDir, "state.json");
  JSONFile.write(stateFilePath, MaciState);

  console.log("finished genMaciStateFromContract");

  console.log("Starting genProofs");

  await genProofs({
    outputDir,
    tallyFile,
    tallyZkey: tallyZkFile,
    processZkey: processZkFile,
    pollId: 0n,
    rapidsnark: undefined,
    processWitgen: processWitness,
    tallyWitgen: tallyWitness,
    coordinatorPrivKey: coordinatorKeypair.privKey.serialize(),
    maciAddress: maciContractAddress,
    transactionHash: undefined,
    processWasm,
    tallyWasm,
    useWasm: true,
    stateFile: stateFilePath,
    startBlock: 6135029,
    blocksPerBatch: 50,
    endBlock: undefined,
    signer: coordinator,
    tallyAddress: tallyContractAddress,
    useQuadraticVoting: true,
    quiet: false,
  } as GenProofsArgs);
  console.log("finished genProofs");
}

export { generateProofs };
