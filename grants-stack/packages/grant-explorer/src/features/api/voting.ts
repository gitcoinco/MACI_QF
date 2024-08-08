import {
  encodeAbiParameters,
  getAddress,
  Hex,
  hexToNumber,
  pad,
  parseAbiParameters,
  parseUnits,
  PublicClient,
  slice,
  toHex,
  TypedDataDomain,
  zeroAddress,
} from "viem";
import {
  CartProject,
  ProofArgs,
  IAllocateArgs,
  bigintArray38,
  PoolInfo,
} from "./types";
import { WalletClient } from "wagmi";
import { VotingToken } from "common";
import { NATIVE } from "common/dist/allo/common";
import { getPublicClient } from "@wagmi/core";
import { getMACIABI } from "common/src/allo/voting";
import axios from "axios";
type SignPermitProps = {
  walletClient: WalletClient;
  contractAddress: Hex;
  erc20Name: string;
  ownerAddress: Hex;
  spenderAddress: Hex;
  deadline: bigint;
  chainId: number;
  permitVersion?: string;
};

type Eip2612Props = SignPermitProps & {
  value: bigint;
  nonce: bigint;
};

type DaiPermit = SignPermitProps & {
  nonce: bigint;
};

/* Signs a permit for EIP-2612-compatible ERC-20 tokens */
export const signPermit2612 = async ({
  walletClient,
  contractAddress,
  erc20Name,
  ownerAddress,
  spenderAddress,
  value,
  deadline,
  nonce,
  chainId,
  permitVersion,
}: Eip2612Props) => {
  const types = {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };

  let domainData: TypedDataDomain = {
    name: erc20Name,
    version: permitVersion ?? "1",
    chainId: chainId,
    verifyingContract: contractAddress,
  };
  if (chainId === 137 && erc20Name === "USD Coin (PoS)") {
    domainData = {
      name: erc20Name,
      version: permitVersion ?? "1",
      verifyingContract: contractAddress,
      salt: pad(toHex(137), { size: 32 }),
    };
  }

  const message = {
    owner: ownerAddress,
    spender: spenderAddress,
    value,
    nonce,
    deadline,
  };

  const signature = await walletClient.signTypedData({
    account: ownerAddress,
    message,
    domain: domainData,
    primaryType: "Permit",
    types,
  });
  const [r, s, v] = [
    slice(signature, 0, 32),
    slice(signature, 32, 64),
    slice(signature, 64, 65),
  ];
  return { r, s, v: hexToNumber(v) };
};

export const signPermitDai = async ({
  walletClient,
  contractAddress,
  erc20Name,
  ownerAddress,
  spenderAddress,
  deadline,
  nonce,
  chainId,
  permitVersion,
}: DaiPermit) => {
  const types = {
    Permit: [
      { name: "holder", type: "address" },
      { name: "spender", type: "address" },
      { name: "nonce", type: "uint256" },
      { name: "expiry", type: "uint256" },
      { name: "allowed", type: "bool" },
    ],
  };

  const domainData = {
    name: erc20Name,
    version: permitVersion ?? "1",
    chainId: chainId,
    verifyingContract: contractAddress,
  };

  const message = {
    holder: ownerAddress,
    spender: spenderAddress,
    nonce,
    expiry: deadline,
    allowed: true,
  };

  const signature = await walletClient.signTypedData({
    account: ownerAddress,
    domain: domainData,
    primaryType: "Permit",
    types,
    message,
  });
  const [r, s, v] = [
    slice(signature, 0, 32),
    slice(signature, 32, 64),
    slice(signature, 64, 65),
  ];
  return { r, s, v: hexToNumber(v) };
};

export function encodeQFVotes(
  donationToken: VotingToken,
  donations: Pick<
    CartProject,
    "amount" | "recipient" | "projectRegistryId" | "applicationIndex"
  >[]
): Hex[] {
  return donations.map((donation) => {
    const vote = [
      getAddress(donationToken.address),
      parseUnits(donation.amount, donationToken.decimal),
      getAddress(donation.recipient),
      donation.projectRegistryId as Hex,
      BigInt(donation.applicationIndex),
    ] as const;

    return encodeAbiParameters(
      parseAbiParameters(["address,uint256,address,bytes32,uint256"]),
      vote
    );
  });
}

export function encodedQFAllocation(
  donationToken: VotingToken,
  donations: Pick<
    CartProject,
    | "amount"
    | "recipient"
    | "projectRegistryId"
    | "applicationIndex"
    | "anchorAddress"
  >[]
): Hex[] {
  const tokenAddress =
    donationToken.address === zeroAddress ? NATIVE : donationToken.address;

  const encodedData = donations.map((donation) => {
    if (!donation.anchorAddress) {
      throw new Error("Anchor address is required for QF allocation");
    }
    return encodeAbiParameters(
      parseAbiParameters(
        "address,uint8,(((address,uint256),uint256,uint256),bytes)"
      ),
      [
        getAddress(donation.anchorAddress),
        0, // permit type of none on the strategy
        [
          [
            [
              getAddress(tokenAddress),
              parseUnits(donation.amount, donationToken.decimal),
            ],
            0n, // nonce, since permit type is none
            0n, // deadline, since permit type is none
          ],
          "0x0000000000000000000000000000000000000000000000000000000000000000", // signature, since permit type is none
        ],
      ]
    );
  });

  return encodedData;
}

export function bnSqrt(val: bigint) {
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

export async function getTallyResults(
  roundId: string,
  chainId: number,
  dataLayer: DataLayer,
  projects: Project[]
) {
  const alloContractAddress = getAlloAddress(chainId);

  const publicClient = getPublicClient({
    chainId,
  });
  const [Pool] = await Promise.all([
    publicClient.readContract({
      abi: abi,
      address: alloContractAddress as Hex,
      functionName: "getPool",
      args: [BigInt(roundId)],
    }),
  ]);

  const strategyAddress = (Pool as PoolInfo).strategy as `0x${string}`;

  const tallyHash = await publicClient.readContract({
    abi: getMACIABI(),
    address: strategyAddress,
    functionName: "tallyHash",
  });
  const voiceCreditFactor = await publicClient.readContract({
    abi: getMACIABI(),
    address: strategyAddress,
    functionName: "voiceCreditFactor",
  });
  const ALPHA_PRECISION = await publicClient.readContract({
    abi: getMACIABI(),
    address: strategyAddress,
    functionName: "ALPHA_PRECISION",
  });
  const poolAmount = await publicClient.readContract({
    abi: getMACIABI(),
    address: strategyAddress,
    functionName: "getPoolAmount",
  });
  const totalVotesSquares = await publicClient.readContract({
    abi: getMACIABI(),
    address: strategyAddress,
    functionName: "totalVotesSquares",
  });

  const results = [] as {
    index: number;
    recipientId: string;
    title: string;
    amount: number;
    logo?: string;
  }[];
  // fetch the ipfs hash and parse the json data
  const ipfsHash = tallyHash as string;
  if (ipfsHash === "" || projects.length === 0) {
    return results;
  }
  const ipfsUrl = `https://ipfs.io/ipfs/${ipfsHash}`;
  const response = await axios.get(ipfsUrl);
  const tallyData = response.data;

  const voteOptions = await dataLayer.getVoteOptionIndexesByChainIdAndRoundId(
    chainId,
    roundId
  );

  const alpha = calcAlpha(
    roundId === "54"
      ? poolAmount > 83 * 1e18
        ? poolAmount
        : poolAmount + BigInt(83.5 * 1e18)
      : roundId === "55"
        ? poolAmount > 55 * 1e18
          ? poolAmount
          : poolAmount + BigInt(55.5 * 1e18)
        : roundId === "56"
          ? poolAmount > 111 * 1e18
            ? poolAmount
            : poolAmount + BigInt(111 * 1e18)
          : poolAmount,
    totalVotesSquares,
    BigInt(tallyData.totalSpentVoiceCredits.spent),
    voiceCreditFactor,
    ALPHA_PRECISION
  );

  for (const voteOption of voteOptions.votingIndexOptions) {
    let proj;

    for (const project of projects) {
      if (
        project.anchorAddress?.toLowerCase() ===
        voteOption.recipientId.toLowerCase()
      ) {
        proj = project;
      }
    }
    if (!proj) {
      continue;
    }
    results.push({
      index: voteOption.optionIndex,
      recipientId: voteOption.recipientId,
      title: proj.projectMetadata.title,
      amount:
        Number(
          getAllocatedAmount(
            BigInt(tallyData.results.tally[voteOption.optionIndex]),
            BigInt(
              tallyData.perVOSpentVoiceCredits?.tally[voteOption.optionIndex] ??
                0
            ),
            alpha,
            BigInt(voiceCreditFactor),
            BigInt(ALPHA_PRECISION)
          )
        ) / 1e18,
      logo:
        proj.projectMetadata.logoImg ??
        proj.projectMetadata.bannerImg ??
        undefined,
    });
  }
  return results;
}

function getAllocatedAmount(
  tallyResult: bigint,
  spent: bigint,
  alpha: bigint,
  voiceCreditFactor: bigint,
  ALPHA_PRECISION: bigint
): bigint {
  const quadratic = alpha * voiceCreditFactor * tallyResult * tallyResult;
  const totalSpentCredits = voiceCreditFactor * spent;
  const linearPrecision = ALPHA_PRECISION * totalSpentCredits;
  const linearAlpha = alpha * totalSpentCredits;
  return (quadratic + linearPrecision - linearAlpha) / ALPHA_PRECISION;
}

export function calcAlpha(
  _budget: bigint,
  _totalVotesSquares: bigint,
  _totalSpent: bigint,
  voiceCreditFactor: bigint,
  ALPHA_PRECISION: bigint
): bigint {
  // Ensure contributions = total spent * voice credit factor
  const contributions = _totalSpent * voiceCreditFactor;

  if (_budget < contributions) {
    throw new Error("Budget is less than contributions");
  }

  // guard against division by zero.
  // This happens when no project receives more than one vote
  if (_totalVotesSquares <= _totalSpent) {
    throw new Error("No project has more than one vote");
  }

  // Calculate alpha
  return (
    ((_budget - contributions) * ALPHA_PRECISION) /
    (voiceCreditFactor * (_totalVotesSquares - _totalSpent))
  );
}

export const prepareAllocationData = ({
  publicKey,
  amount,
  proof,
}: IAllocateArgs) => {
  // uint[2] memory _pA,
  // uint[2][2] memory _pB,
  // uint[2] memory _pC,
  // uint[38] memory _pubSignals
  const types = "(uint256,uint256),uint256,bool,bytes";

  let dt: ProofArgs | null = null;
  if (proof) {
    dt = generateWitness(JSON.parse(proof));
  }

  const proofTypes = "uint[2],uint[2][2],uint[2],uint[38]";
  const proofData = dt
    ? encodeAbiParameters(parseAbiParameters(proofTypes), [
        dt._pA.map((str) => BigInt(str)) as [bigint, bigint],
        dt._pB.map((pair) => pair.map((num) => BigInt(num))) as [
          [bigint, bigint],
          [bigint, bigint],
        ],
        dt._pC.map((str) => BigInt(str)) as [bigint, bigint],
        // add 38 bigint in the as [bigint, bigint, ...] format
        dt._pubSignals as bigintArray38,
      ])
    : "0x";

  const isAllowlistedProof = dt ? true : false;

  const pubKey = [
    publicKey.asContractParam().x,
    publicKey.asContractParam().y,
  ] as [bigint, bigint];
  const data = encodeAbiParameters(parseAbiParameters(types), [
    pubKey,
    amount as bigint,
    isAllowlistedProof,
    proofData,
  ]);

  return data;
};

const abi = getMACIABI();

export const isRoundZuProofReused = async (
  pcd: string,
  chainId: number,
  roundId: string
) => {
  const alloContractAddress = getAlloAddress(chainId);

  const ZuPassRegistryAddress = getZuPassRegistryAddress(chainId);

  const publicClient = getPublicClient({
    chainId,
  });
  const [Pool] = await Promise.all([
    publicClient.readContract({
      abi: abi,
      address: alloContractAddress as Hex,
      functionName: "getPool",
      args: [BigInt(roundId)],
    }),
  ]);

  const pool = Pool as PoolInfo;
  const proof = generateWitness(JSON.parse(pcd));
  const emailHash = proof._pubSignals[9];
  const isUsed = await publicClient.readContract({
    address: ZuPassRegistryAddress,
    abi,
    functionName: "usedRoundNullifiers",
    args: [pool.strategy as `0x${string}`, emailHash],
  });

  return isUsed;
};

import { utils } from "ethers";
import {
  Keypair as MaciKeypair,
  PrivKey,
  PubKey,
  PCommand,
  Message,
} from "maci-domainobjs";
import { generateWitness } from "./pcd";
import {
  getAlloAddress,
  getZuPassRegistryAddress,
} from "common/dist/allo/backends/allo-v2";
import { DataLayer, Project } from "data-layer";

/**
 * Convert to MACI Message object
 * @param type message type, 1 for key change or vote, 2 for topup
 * @param data message data
 * @returns Message
 */
function getMaciMessage(type: bigint, data: bigint[] | null): Message {
  const msgType = BigInt(type);
  const rawData = data || [];
  const msgData = rawData;
  const maciMessage = new Message(BigInt(msgType), msgData);
  return maciMessage;
}

/**
 * Get the latest set of vote messages submitted by contributor
 * @param contributorKey Contributor key used to encrypt messages
 * @param coordinatorPubKey Coordinator public key
 * @param maciMessages MACI messages
 * @returns MACI messages
 */
export async function getContributorMessages({
  contributorKey,
  coordinatorPubKey,
  maciMessages,
}: {
  contributorKey: Keypair;
  coordinatorPubKey: PubKey;
  maciMessages: {
    messages: {
      msgType: bigint;
      data: bigint[];
    }[];
  };
}): Promise<PCommand[]> {
  if (!(maciMessages.messages && maciMessages.messages.length)) {
    return [];
  }

  const sharedKey = Keypair.genEcdhSharedKey(
    contributorKey.privKey,
    coordinatorPubKey
  );

  return maciMessages.messages.map((message) => {
    const macimsg = getMaciMessage(message.msgType, message.data);
    const { command } = PCommand.decrypt(macimsg, sharedKey, true);

    return command;
  });
}

/**
 * Derives the MACI private key from the users signature hash
 * @param hash - user's signature hash
 * @return The MACI private key
 */
function genPrivKey(hash: string): PrivKey {
  if (!utils.isBytesLike(hash)) {
    throw new Error(`genPrivKey() error. Hash must be a hex string: ${hash}`);
  }

  let rawPrivKey = BigInt(hash);
  let pubKey: PubKey | null = null;

  for (let counter = 1; pubKey === null; counter++) {
    try {
      const privKey = new PrivKey(rawPrivKey);
      // this will throw 'Invalid public key' if key is not on the Baby Jubjub elliptic curve
      const keypair = new Keypair(privKey);
      pubKey = keypair.pubKey;
    } catch {
      const data = encodeAbiParameters(parseAbiParameters("uint256, uint256"), [
        rawPrivKey,
        BigInt(counter),
      ]);
      rawPrivKey = BigInt(utils.keccak256(data));
    }
  }

  return new PrivKey(rawPrivKey);
}

export class Keypair extends MaciKeypair {
  /**
   * generate a key pair from a seed
   * @param seed The sha256 hash of signature
   * @returns key pair
   */
  static createFromSeed(seed: string): Keypair {
    if (!seed) {
      throw new Error("Keypair seed cannot be empty");
    }
    const sanitizedSeed = seed.startsWith("0x") ? seed : "0x" + seed;
    const privKey = genPrivKey(sanitizedSeed);
    return new Keypair(privKey);
  }
}

export { PubKey, PrivKey };
