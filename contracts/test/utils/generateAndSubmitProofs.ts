import { Signer } from "ethers";
import { Keypair } from "maci-domainobjs";
import { genProofs, proveOnChain } from "./maci";
import { getCircuitFiles } from "./circuits";
import { JSONFile } from "./JSONFile";
import path from "path";
import { getTalyFilePath } from "./misc";
import { genMaciStateFromContract } from "./genMaciState";
import { GenProofsArgs } from "maci-cli";

export const genAndSubmitProofs = async ({
  coordinatorKeypair,
  outputDir,
  circuitDirectory,
  maciTransactionHash,
  coordinator,
  maciAddress,
  tallyContractAddress,
  mpContractAddress,
  startBlock,
  quiet,
}: {
  coordinatorKeypair: Keypair;
  outputDir: string;
  circuitDirectory: string;
  maciTransactionHash: string | undefined;
  coordinator: Signer;
  maciAddress: string;
  tallyContractAddress: string;
  mpContractAddress: string;
  startBlock?: number;
  quiet?: boolean;
}) => {
  const tallyFile = getTalyFilePath(outputDir);

  const network = await coordinator.provider?.getNetwork();

  const MaciState = (
    await genMaciStateFromContract(
      coordinator.provider!,
      maciAddress,
      coordinatorKeypair,
      0n,
      startBlock,
      50,
      undefined,
      undefined
    )
  ).toJSON();

  // Create file and write the state
  const stateFilePath = path.join(outputDir, "state.json");
  JSONFile.write(stateFilePath, MaciState);

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
    stateFile: stateFilePath,
    startBlock: startBlock,
    blocksPerBatch: 50,
    endBlock: undefined,
    signer: coordinator,
    tallyAddress: tallyContractAddress,
    useQuadraticVoting: true,
    quiet: quiet,
  } as GenProofsArgs);

  // Submit proofs to MACI contract
  await proveOnChain({
    pollId: 0n,
    proofDir: outputDir,
    maciAddress,
    messageProcessorAddress: mpContractAddress,
    tallyAddress: tallyContractAddress,
    signer: coordinator,
    quiet: quiet,
  });
};
