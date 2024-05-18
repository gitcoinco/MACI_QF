import {
  ContractTransactionReceipt,
  Signer,
  ethers,
  AbiCoder,
  BigNumberish,
} from "ethers";
import {
  genTreeCommitment as genTallyResultCommitment,
  genRandomSalt,
  IncrementalQuinTree,
  hashLeftRight,
  hash5,
  hash3,
  hash2,
} from "maci-crypto";

import { Keypair, Message, PCommand, PrivKey, PubKey } from "maci-domainobjs";

import * as os from "os";
import {
  mergeMessages,
  mergeSignups,
  genProofs,
  proveOnChain,
  GenProofsArgs,
  genLocalState,
  verify,
} from "maci-cli";

import { getTalyFilePath, isPathExist } from "./misc";
import { getCircuitFiles } from "./circuits";
import { QFMACI } from "../../typechain-types";

import { ClonablePoll } from "../../typechain-types";

export const isOsArm = os.arch().includes("arm");

const LEAVES_PER_NODE = 5;

/**
 * Interface that represents user publish message
 */
export interface IPublishMessage {
  /**
   * The index of the state leaf
   */
  stateIndex: bigint;

  /**
   * The index of the vote option
   */
  voteOptionIndex: bigint;

  /**
   * The nonce of the message
   */
  nonce: bigint;

  /**
   * The new vote weight
   */
  newVoteWeight: bigint;
}

/**
 * Interface for the arguments to the batch publish command
 */
export interface IPublishBatchArgs {
  /**
   * User messages
   */
  messages: IPublishMessage[];

  /**
   * The id of the poll
   */
  pollId: bigint;

  /**
   * The address of the MACI contract
   */
  Poll: ClonablePoll;

  /**
   * The public key of the user
   */
  publicKey: string;

  /**
   * The private key of the user
   */
  privateKey: string;

  /**
   * A signer object
   */
  signer: Signer;

  /**
   * Whether to log the output
   */
  quiet?: boolean;
}

/**
 * Interface for the arguments to the batch publish command
 */
export interface IAllocateArgs {
  /**
   * The public key of the user
   */
  publicKey: string;

  amount: BigInt;

  proof: ProofArgs;



}

  // uint[2] memory _pA,
  // uint[2][2] memory _pB,
  // uint[2] memory _pC,
  // uint[38] memory _pubSignals
export interface ProofArgs {
  pA: bigint[];
  pB: bigint[][];
  pC: bigint[];
  pubSignals: bigint[];
}



/**
 * Interface for the arguments to the batch publish command
 */
export interface IAllocateBatchArgs {
  /**
   * User messages
   */
  messages: IPublishMessage[];

  /**
   * The id of the poll
   */
  pollId: bigint;

  /**
   * The address of the MACI contract
   */
  Poll: ClonablePoll;

  /**
   * The public key of the user
   */
  publicKey: string;

  /**
   * The private key of the user
   */
  privateKey: string;

  /**
   * A signer object
   */
  signer: Signer;

  /**
   * Whether to log the output
   */
  quiet?: boolean;

  /**
   * The amount to allocate
   */
  amount: bigint;
}
/**
 * Merge MACI message and signups subtrees
 * Must merge the subtrees before calling genProofs
 * @param maciAddress MACI contract address
 * @param pollId Poll id
 * @param numQueueOps Number of operations to perform for the merge
 * @param quiet Whether to log output
 */
export async function mergeMaciSubtrees({
  maciAddress,
  pollId,
  numQueueOps,
  signer,
  quiet,
}: {
  maciAddress: string;
  pollId: bigint;
  signer: Signer;
  numQueueOps?: string;
  quiet?: boolean;
}) {
  if (!maciAddress) throw new Error("Missing MACI address");

  await mergeMessages({
    pollId,
    maciContractAddress: maciAddress,
    numQueueOps,
    signer,
    quiet,
  });

  await mergeSignups({
    pollId,
    maciContractAddress: maciAddress,
    numQueueOps,
    signer,
    quiet,
  });
}

/**
 * Get the square root of a bigint
 * @param val the value to apply square root on
 */
export function bnSqrt(val) {
  // Take square root from a bigint
  // https://stackoverflow.com/a/52468569/1868395
  if (val < 0n) {
    throw new Error("Complex numbers not support");
  }
  if (val < 2n) {
    return val;
  }
  let loop = 100;
  let x;
  let x1 = val / 2n;
  do {
    x = x1;
    x1 = (x + val / x) / 2n;
    loop--;
  } while (x !== x1 && loop);
  if (loop === 0 && x !== x1) {
    throw new Error("Sqrt took too long to calculate");
  }
  return x;
}

export const publishBatch = async ({
  messages,
  pollId,
  Poll,
  publicKey,
  privateKey,
  signer,
}: IPublishBatchArgs) => {
  if (!PubKey.isValidSerializedPubKey(publicKey)) {
    throw new Error("invalid MACI public key");
  }

  if (!PrivKey.isValidSerializedPrivKey(privateKey)) {
    throw new Error("invalid MACI private key");
  }

  if (pollId < 0n) {
    throw new Error(`invalid poll id ${pollId}`);
  }

  const userMaciPubKey = PubKey.deserialize(publicKey);
  const userMaciPrivKey = PrivKey.deserialize(privateKey);
  const pollContract = Poll.connect(signer);

  const [maxValues, coordinatorPubKeyResult] = await Promise.all([
    pollContract.maxValues(),
    pollContract.coordinatorPubKey(),
  ]);
  const maxVoteOptions = Number(maxValues.maxVoteOptions);

  // validate the vote options index against the max leaf index on-chain
  messages.forEach(({ stateIndex, voteOptionIndex, salt, nonce }) => {
    if (voteOptionIndex < 0 || maxVoteOptions < voteOptionIndex) {
      throw new Error("invalid vote option index");
    }

    // check < 1 cause index zero is a blank state leaf
    if (stateIndex < 1) {
      throw new Error("invalid state index");
    }

    if (nonce < 0) {
      throw new Error("invalid nonce");
    }
  });

  const coordinatorPubKey = new PubKey([
    BigInt(coordinatorPubKeyResult.x.toString()),
    BigInt(coordinatorPubKeyResult.y.toString()),
  ]);

  const encryptionKeypair = new Keypair();
  const sharedKey = Keypair.genEcdhSharedKey(
    encryptionKeypair.privKey,
    coordinatorPubKey
  );

  const payload: any[] = messages.map(
    ({ salt, stateIndex, voteOptionIndex, newVoteWeight, nonce }) => {
      const userSalt = salt ? BigInt(salt) : genRandomSalt();

      // create the command object
      const command = new PCommand(
        stateIndex,
        userMaciPubKey,
        voteOptionIndex,
        newVoteWeight,
        nonce,
        BigInt(pollId),
        userSalt
      );

      // sign the command with the user private key
      const signature = command.sign(userMaciPrivKey);

      const message = command.encrypt(signature, sharedKey);

      return [
        message.asContractParam(),
        encryptionKeypair.pubKey.asContractParam(),
      ];
    }
  );

  const preparedMessages = payload.map(([message]) => message);
  const preparedKeys = payload.map(([, key]) => key);

  const receipt = await pollContract
    .publishMessageBatch(preparedMessages.reverse(), preparedKeys.reverse())
    .then((tx) => tx.wait());

  return {
    res: receipt,
    hash: receipt?.hash,
    encryptedMessages: preparedMessages,
    privateKey: encryptionKeypair.privKey.serialize(),
  };
};

export const prepareAllocationData = async ({
  publicKey,
  amount,
  proof
}: IAllocateArgs) => {
  if (!PubKey.isValidSerializedPubKey(publicKey)) {
    throw new Error("invalid MACI public key");
  }



  const userMaciPubKey = PubKey.deserialize(publicKey);

  // uint[2] memory _pA,
  // uint[2][2] memory _pB,
  // uint[2] memory _pC,
  // uint[38] memory _pubSignals
  let types = [
    // Contributor PubKey
    "(uint256,uint256)",
    // Contribution amount
    "uint256",
    // ZK Proof for Zuzalu circuit
    "uint[2]",
    "uint[2][2]",
    "uint[2]",
    "uint[38]",
  ];

  let data;
  try {
    data = AbiCoder.defaultAbiCoder().encode(types, [
      [userMaciPubKey.asContractParam().x, userMaciPubKey.asContractParam().y],
      amount,
      proof.pA,
      proof.pB,
      proof.pC,
      proof.pubSignals
    ]);
    console.log("hey");

  } catch (e) {
    console.log(e);
    console.log("hey");

  }

  return data;
};

export const prepareAllocationData2 = async ({
  messages,
  pollId,
  Poll,
  publicKey,
  privateKey,
  signer,
  amount,
}: IAllocateBatchArgs) => {
  if (!PubKey.isValidSerializedPubKey(publicKey)) {
    throw new Error("invalid MACI public key");
  }

  if (!PrivKey.isValidSerializedPrivKey(privateKey)) {
    throw new Error("invalid MACI private key");
  }

  if (pollId < 0n) {
    throw new Error(`invalid poll id ${pollId}`);
  }

  const userMaciPubKey = PubKey.deserialize(publicKey);
  const userMaciPrivKey = PrivKey.deserialize(privateKey);
  const pollContract = Poll.connect(signer);

  const [maxValues, coordinatorPubKeyResult] = await Promise.all([
    pollContract.maxValues(),
    pollContract.coordinatorPubKey(),
  ]);
  const maxVoteOptions = Number(maxValues.maxVoteOptions);

  // validate the vote options index against the max leaf index on-chain
  messages.forEach(({ stateIndex, voteOptionIndex, salt, nonce }) => {
    if (voteOptionIndex < 0 || maxVoteOptions < voteOptionIndex) {
      throw new Error("invalid vote option index");
    }

    // check < 1 cause index zero is a blank state leaf
    if (stateIndex < 1) {
      throw new Error("invalid state index");
    }

    if (nonce < 0) {
      throw new Error("invalid nonce");
    }
  });

  const coordinatorPubKey = new PubKey([
    BigInt(coordinatorPubKeyResult.x.toString()),
    BigInt(coordinatorPubKeyResult.y.toString()),
  ]);

  const encryptionKeypair = new Keypair();
  const sharedKey = Keypair.genEcdhSharedKey(
    encryptionKeypair.privKey,
    coordinatorPubKey
  );

  const payload: any[] = messages.map(
    ({ salt, stateIndex, voteOptionIndex, newVoteWeight, nonce }) => {
      const userSalt = salt ? BigInt(salt) : genRandomSalt();

      // create the command object
      const command = new PCommand(
        stateIndex,
        userMaciPubKey,
        voteOptionIndex,
        newVoteWeight,
        nonce,
        BigInt(pollId),
        userSalt
      );

      // sign the command with the user private key
      const signature = command.sign(userMaciPrivKey);

      const message = command.encrypt(signature, sharedKey);

      // Iterate through each value of message.asContractParam().data and convert it to a BigInt

      const data = message.asContractParam().data.map((x) => BigInt(x));

      return [
        [BigInt(message.asContractParam().msgType), data],
        [
          encryptionKeypair.pubKey.asContractParam().x,
          encryptionKeypair.pubKey.asContractParam().y,
        ],
      ];
    }
  );

  const preparedMessages = payload.map(([message]) => message);
  const preparedKeys = payload.map(([, key]) => key);

  // Copy and reverse the arrays for encoding
  const reversedMessages = [...preparedMessages].reverse();
  const reversedKeys = [...preparedKeys].reverse();
  let types = [
    // Contributor PubKey
    "(uint256,uint256)",
    // Contribution amount
    "uint256",
    // Encrypted messages
    "(uint256,uint256[])[]",
    // Shared Encrypted PubKey with Coordinator
    "(uint256,uint256)[]",
  ];

  let data;
  try {
    data = AbiCoder.defaultAbiCoder().encode(types, [
      [userMaciPubKey.asContractParam().x, userMaciPubKey.asContractParam().y],
      amount,
      reversedMessages,
      reversedKeys,
    ]);
  } catch (e) {
    console.log(e);
  }
  console.log(data);

  return data;
};

export const applicationStatusToNumber = (status: ApplicationStatus) => {
  switch (status) {
    case "PENDING":
    case "IN_REVIEW":
      return 1n;
    case "APPROVED":
      return 2n;
    case "REJECTED":
      return 3n;
    default:
      throw new Error(`Unknown status ${status}`);
  }
}

function buildRowOfApplicationStatuses({
  rowIndex,
  applications,
  statusToNumber,
  bitsPerStatus,
}: {
  rowIndex: number;
  applications: { index: number; status: ApplicationStatus }[];
  statusToNumber: (status: ApplicationStatus) => bigint;
  bitsPerStatus: number;
}) {
  const applicationsPerRow = 256 / bitsPerStatus;
  const startApplicationIndex = rowIndex * applicationsPerRow;
  let row = 0n;

  for (let columnIndex = 0; columnIndex < applicationsPerRow; columnIndex++) {
    const applicationIndex = startApplicationIndex + columnIndex;
    const application = applications.find(
      (app) => app.index === applicationIndex
    );

    if (application === undefined) {
      continue;
    }

    const status = statusToNumber(application.status);

    const shiftedStatus = status << BigInt(columnIndex * bitsPerStatus);
    row |= shiftedStatus;
  }

  return row;
}
export type ApplicationStatus =
  | "PENDING"
  | "APPROVED"
  | "IN_REVIEW"
  | "REJECTED"
  | "APPEAL"
  | "FRAUD"
  | "RECEIVED"
  | "CANCELLED"
  | "IN_REVIEW";


export function buildUpdatedRowsOfApplicationStatuses(args: {
  applicationsToUpdate: {
    index: number;
    status: ApplicationStatus;
  }[];
  currentApplications: {
    index: number;
    status: ApplicationStatus;
  }[];
  statusToNumber: (status: ApplicationStatus) => bigint;
  bitsPerStatus: number;
}): { index: bigint; statusRow: bigint }[] {
  if (args.bitsPerStatus % 2 !== 0) {
    throw new Error("bitsPerStatus must be a multiple of 2");
  }

  const applicationsPerRow = 256 / args.bitsPerStatus;

  const rowsToUpdate = Array.from(
    new Set(
      args.applicationsToUpdate.map(({ index }) => {
        return Math.floor(index / applicationsPerRow);
      })
    )
  );

  const updatedApplications = args.currentApplications.map((app) => {
    const updatedApplication = args.applicationsToUpdate.find(
      (appToUpdate) => appToUpdate.index === app.index
    );

    if (updatedApplication) {
      return { ...app, status: updatedApplication.status };
    }

    return app;
  });

  return rowsToUpdate.map((rowIndex) => {
    return {
      index: BigInt(rowIndex),
      statusRow: buildRowOfApplicationStatuses({
        rowIndex,
        applications: updatedApplications,
        statusToNumber: args.statusToNumber,
        bitsPerStatus: args.bitsPerStatus,
      }),
    };
  });
}

export function getRecipientClaimData(
  recipientIndex,
  recipientTreeDepth,
  tally
) {
  const LEAVES_PER_NODE = 5;

  const maxRecipients = tally.perVOSpentVoiceCredits.tally.length;
  if (recipientIndex >= maxRecipients) {
    throw new Error(`Invalid recipient index ${recipientIndex}.`);
  }
  // Create proof for total amount of spent voice credits
  const spent = tally.perVOSpentVoiceCredits.tally[recipientIndex];
  const spentSalt = tally.perVOSpentVoiceCredits.salt;
  const spentTree = new IncrementalQuinTree(
    recipientTreeDepth,
    BigInt(0),
    LEAVES_PER_NODE,
    hash5
  );
  for (const leaf of tally.perVOSpentVoiceCredits.tally) {
    spentTree.insert(BigInt(leaf));
  }
  const spentProof = spentTree.genProof(recipientIndex);
  const resultsCommitment = genTallyResultCommitment(
    tally.results.tally.map((x) => BigInt(x)),
    BigInt(tally.results.salt),
    recipientTreeDepth
  );
  const spentVoiceCreditsCommitment = hash2([
    BigInt(tally.totalSpentVoiceCredits.spent),
    BigInt(tally.totalSpentVoiceCredits.salt),
  ]);
  return [
    recipientIndex,
    spent,
    spentProof.pathElements.map((x) => x.map((y) => y.toString())),
    spentSalt,
    resultsCommitment,
    spentVoiceCreditsCommitment,
  ];
}

export function getTallyResultProof(
  recipientIndex: number,
  recipientTreeDepth: number,
  tally: any
) {
  // Create proof for tally result
  const result = tally.results.tally[recipientIndex];
  if (result == null) {
    // result is null or undefined
    throw Error(`Missing tally result for index ${recipientIndex}`);
  }

  const resultTree = new IncrementalQuinTree(
    recipientTreeDepth,
    BigInt(0),
    LEAVES_PER_NODE,
    hash5
  );
  for (const leaf of tally.results.tally) {
    resultTree.insert(BigInt(leaf));
  }
  const resultProof = resultTree.genProof(recipientIndex);
  return {
    recipientIndex,
    result,
    proof: resultProof.pathElements,
  };
}

export function getTallyResultProofBatch(
  recipientStartIndex: number,
  recipientTreeDepth: number,
  tally: any,
  batchSize: number
) {
  const tallyCount = tally.results.tally.length;
  if (recipientStartIndex >= tallyCount) {
    throw new Error("Recipient index out of bound");
  }

  const proofs = [] as any;
  const lastIndex =
    recipientStartIndex + batchSize > tallyCount
      ? tallyCount
      : recipientStartIndex + batchSize;

  for (let i = recipientStartIndex; i < lastIndex; i++) {
    proofs.push(getTallyResultProof(i, recipientTreeDepth, tally));
  }

  return proofs;
}

export async function addTallyResultsBatch(
  QFMACI: QFMACI,
  recipientTreeDepth: number,
  tallyData: any,
  batchSize: number,
  startIndex = 1,
  callback?: (processed: number, receipt: ContractTransactionReceipt) => void
): Promise<number> {
  let totalGasUsed = 0;
  const { tally } = tallyData.results;

  const spentVoiceCreditsHash = hashLeftRight(
    BigInt(tallyData.totalSpentVoiceCredits.spent),
    BigInt(tallyData.totalSpentVoiceCredits.salt)
  );

  const perVOSpentVoiceCreditsHash = genTallyResultCommitment(
    tallyData.perVOSpentVoiceCredits.tally.map((x: string) => BigInt(x)),
    BigInt(tallyData.perVOSpentVoiceCredits.salt),
    recipientTreeDepth
  );

  const newResultCommitment = genTallyResultCommitment(
    tally.map((x: string) => BigInt(x)),
    BigInt(tallyData.results.salt),
    recipientTreeDepth
  );

  const newTallyCommitment = hash3([
    newResultCommitment,
    spentVoiceCreditsHash,
    perVOSpentVoiceCreditsHash,
  ]);

  if ("0x" + newTallyCommitment.toString(16) !== tallyData.newTallyCommitment) {
    console.error(
      "Error: the newTallyCommitment is invalid.",
      "0x" + newTallyCommitment.toString(16),
      tallyData.newTallyCommitment
    );
  }

  let totalRecipients = await QFMACI.getRecipientCount();

  for (let i = startIndex; i < totalRecipients ; i = i + batchSize) {
    const proofs = getTallyResultProofBatch(
      i,
      recipientTreeDepth,
      tallyData,
      batchSize
    );
    proofs.map((i) => console.log(i.result));
    const tx = await QFMACI.addTallyResultsBatch(
      proofs.map((i) => i.recipientIndex),
      proofs.map((i) => i.result),
      proofs.map((i) => i.proof),
      BigInt(tallyData.results.salt),
      spentVoiceCreditsHash,
      BigInt(perVOSpentVoiceCreditsHash)
    );
    const receipt = await tx.wait();
    if (receipt?.status !== 1) {
      throw new Error("Failed to add tally results on chain");
    }

    if (callback) {
      // the 2nd element in the data array has the array of
      // recipients to be processed for the batch
      const totalProcessed = i + proofs.length;
      callback(totalProcessed, receipt);
    }
    totalGasUsed = totalGasUsed + Number(receipt.gasUsed);
  }
  return totalGasUsed;
}

/* Input to getGenProofArgs() */
type getGenProofArgsInput = {
  maciAddress: string;
  pollId: bigint;
  // coordinator's MACI serialized secret key
  coordinatorMacisk: string;
  // the transaction hash of the creation of the MACI contract
  maciTxHash?: string;
  // the key get zkeys file mapping, see utils/circuits.ts
  circuitType: string;
  circuitDirectory: string;
  rapidsnark?: string;
  // where the proof will be produced
  outputDir: string;
  // number of blocks of logs to fetch per batch
  blocksPerBatch: number;
  // fetch logs from MACI from these start and end blocks
  startBlock?: number;
  endBlock?: number;
  // MACI state file
  maciStateFile?: string;
  // transaction signer
  signer: Signer;
  // flag to turn on verbose logging in MACI cli
  quiet?: boolean;
};

/*
 * Get the arguments to pass to the genProof function
 */
export function getGenProofArgs(args: getGenProofArgsInput): GenProofsArgs {
  const {
    maciAddress,
    pollId,
    coordinatorMacisk,
    maciTxHash,
    circuitType,
    circuitDirectory,
    rapidsnark,
    outputDir,
    blocksPerBatch,
    startBlock,
    endBlock,
    maciStateFile,
    signer,
    quiet,
  } = args;

  const tallyFile = getTalyFilePath(outputDir);

  const {
    processZkFile,
    tallyZkFile,
    processWitness,
    processWasm,
    processDatFile,
    tallyWitness,
    tallyWasm,
    tallyDatFile,
  } = getCircuitFiles(circuitType, circuitDirectory);

  if (isOsArm) {
    return {
      outputDir,
      tallyFile,
      tallyZkey: tallyZkFile,
      processZkey: processZkFile,
      pollId,
      coordinatorPrivKey: coordinatorMacisk,
      maciAddress,
      transactionHash: maciTxHash,
      processWasm,
      tallyWasm,
      useWasm: true,
      blocksPerBatch,
      startBlock,
      endBlock,
      stateFile: maciStateFile,
      signer,
      quiet,
    };
  } else {
    if (!rapidsnark) {
      throw new Error("Please specify the path to the rapidsnark binary");
    }

    if (!isPathExist(rapidsnark)) {
      throw new Error(`Path ${rapidsnark} does not exist`);
    }

    return {
      outputDir,
      tallyFile,
      tallyZkey: tallyZkFile,
      processZkey: processZkFile,
      pollId,
      processWitgen: processWitness,
      processDatFile,
      tallyWitgen: tallyWitness,
      tallyDatFile,
      coordinatorPrivKey: coordinatorMacisk,
      maciAddress,
      transactionHash: maciTxHash,
      rapidsnark,
      useWasm: false,
      blocksPerBatch,
      startBlock,
      endBlock,
      stateFile: maciStateFile,
      signer,
      quiet,
    };
  }
}

/**
 * Create a random MACI private key
 *
 * @returns MACI serialized private key
 */
export function newMaciPrivateKey(): string {
  const keypair = new Keypair();
  const secretKey = keypair.privKey.serialize();
  return secretKey;
}

/**
 * Get event log argument value
 * @param transactionReceipt transaction
 * @param contract Contract handle
 * @param eventName event name
 * @param argumentName argument name
 * @returns event argument value
 */
export async function getEventArg(transaction, contract, eventName, argumentName) {
  const transactionReceipt = await transaction.wait();
  const contractAddress = await contract.getAddress();
  // eslint-disable-next-line
  for (const log of transactionReceipt?.logs || []) {
      if (log.address !== contractAddress) {
          continue;
      }
      const event = contract.interface.parseLog({
          data: log.data,
          topics: [...log.topics],
      });
      // eslint-disable-next-line
      if (event && event.name === eventName) {
          return event.args[argumentName];
      }
  }
  throw new Error(`Event ${eventName} from contract ${contractAddress} not found in transaction ${transaction.hash}`);
}

export { genProofs, proveOnChain, verify, genLocalState };
