import {
  encodeAbiParameters,
  getAddress,
  Hex,
  hexToNumber,
  pad,
  parseAbi,
  parseAbiParameters,
  parseUnits,
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
import { P } from "vitest/dist/reporters-5f784f42";
import { get } from "lodash";
import { getPublicClient } from "@wagmi/core";

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

const abi = parseAbi([
  "function getPool(uint256) view returns ((bytes32 profileId, address strategy, address token, (uint256,string) metadata, bytes32 managerRole, bytes32 adminRole))",
  "function usedRoundNullifiers(address, uint256) view returns (bool)",
]);
const alloContractAddress =
  "0x1133ea7af70876e64665ecd07c0a0476d09465a1" as `0x${string}`;

const ZuPassRegistryAddress = getAddress(
  "0x455cC27badb067cb9b7cdE52F153DfebC83B1A99"
);
export const isRoundZuProofReused = async (
  pcd: string,
  chainId: number,
  roundId: string
) => {
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
  console.log("isAlreadyUsedZupass In Round?  ", isUsed);
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
