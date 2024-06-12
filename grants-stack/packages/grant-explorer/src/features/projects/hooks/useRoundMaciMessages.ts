import useSWR from "swr";
import { Application, DataLayer, MACIContribution, Message } from "data-layer";
import { getPublicClient, WalletClient } from "@wagmi/core";
import { encodeAbiParameters, parseAbi, parseAbiParameters } from "viem";
import { ethers } from "ethers";
import { PCommand, PubKey } from "maci-domainobjs";
import { generatePubKeyWithSeed } from "../../../checkoutStore";
import { getMACIKey, getMACIKeys } from "../../api/keys";
import { getContributorMessages } from "../../api/voting";
import { formatAmount } from "../../api/formatAmount";
import { GroupedMaciContributions, MACIContributions } from "../../api/types";

type Params = {
  chainId?: number;
  roundId?: string;
  address: string;
}[];

export function useRoundMaciMessages(params: Params, dataLayer: DataLayer) {
  const shouldFetch = Object.values(params).every(Boolean);
  return useSWR(
    shouldFetch ? ["allApprovedApplications", params] : null,
    async () => {
      const response = [];

      for (const param of params) {
        if (param.chainId === undefined || param.roundId === undefined) {
          return null;
        }

        response.push(
          await getContributed(
            param.chainId,
            param.roundId,
            param.address,
            dataLayer
          )
        );
      }
      return response;
    }
  );
}

export function useRoundsMaciMessages(params: Params, dataLayer: DataLayer) {
  const shouldFetch = Object.values(params).every(Boolean);
  return useSWR(
    shouldFetch ? ["allApprovedApplications", params] : null,
    async () => {
      const response: {
        [chainId: number]: { [roundId: string]: MACIContributions };
      } = {};
      for (const param of params) {
        if (param.chainId === undefined || param.roundId === undefined) {
          return null;
        }

        if (!response[param.chainId]) {
          response[param.chainId] = {};
        }

        response[param.chainId][param.roundId] = await getContributed(
          param.chainId,
          param.roundId,
          param.address,
          dataLayer
        );
      }
      return response;
    }
  );
}

export function useMACIContributions(address: string, dataLayer: DataLayer) {
  return useSWR(["allContributions", address], async () => {
    const response: GroupedMaciContributions = {};
    const contributions = await getContributions(address, dataLayer);

    console.log("contributions", contributions);

    for (const contribution of contributions) {
      const chainId = Number(contribution.encrypted.chainId);
      const roundId = contribution.encrypted.roundId;

      if (!response[chainId]) {
        response[chainId] = {};
      }

      if (!response[chainId][roundId]) {
        response[chainId][roundId] = contribution;
      } else {
        response[chainId][roundId] = {
          ...response[chainId][roundId],
          ...contribution,
        };
      }
    }
    const uniqueDetails = Array.from(
      new Map(
        contributions.map((item) => [
          `${item.encrypted.chainId}-${item.encrypted.roundId}`,
          {
            chainId: Number(item.encrypted.chainId),
            roundId: item.encrypted.roundId,
            address: address,
          },
        ])
      ).values()
    );

    console.log("uniqueDetails", uniqueDetails);

    return { groupedMaciContributions: response, groupedRounds: uniqueDetails };
  });
}

export const useDecryptMessages = (
  maciMessages: GroupedMaciContributions | undefined,
  walletAddress: string
) => {
  const fetcher = async () => {
    if (!maciMessages) {
      return {};
    }

    const decryptedMessagesByRound: {
      [chainID: number]: { [roundID: string]: PCommand[] };
    } = {};

    const needSignature: {
      [chainID: number]: { [roundID: string]: boolean };
    } = {};

    for (const chainID in maciMessages) {
      decryptedMessagesByRound[chainID] = {};
      needSignature[chainID] = {};
      for (const roundID in maciMessages[chainID]) {
        const signature = getMACIKey({
          chainID: Number(chainID),
          roundID: roundID,
          walletAddress: walletAddress,
        });
        if (!signature) {
          needSignature[chainID][roundID] = true;
          // decryptedMessagesByRound[chainID][roundID] = [];
          continue; // Skip to the next round
        }
        const pk = generatePubKeyWithSeed(signature);
        const MACIMessages = maciMessages[chainID][roundID];
        const messages = MACIMessages.encrypted.messages as Message[];

        const decryptedMessages = await getContributorMessages({
          contributorKey: pk,
          coordinatorPubKey: MACIMessages.maciInfo.coordinatorPubKey as PubKey,
          maciMessages: {
            messages: messages.map((m) => ({
              msgType: BigInt(m.message.msgType),
              data: m.message.data.map((d) => BigInt(d)),
            })),
          },
        });
        needSignature[chainID][roundID] = false;
        decryptedMessagesByRound[chainID][roundID] = decryptedMessages;
      }
    }

    return {
      decryptedMessagesByRound: decryptedMessagesByRound,
      needSignature: needSignature,
    };
  };

  const { data, error } = useSWR(
    maciMessages ? ["decryptMessages", maciMessages, walletAddress] : null,
    fetcher
  );

  return {
    data,
    error,
  };
};

export const useVoiceCreditsByRoundIdAndChainId = (
  chainId: number,
  roundId: string,
  address: string,
  dataLayer: DataLayer
) => {
  return useSWR(["voiceCredits", chainId, roundId, address], async () => {
    const response = await dataLayer.getContributionsByChainIdAndRoundID({
      chainId,
      roundId,
      contributorAddress: address.toLowerCase(),
    });

    return response;
  });
};


async function getMaciAddress(chainID: number, roundID: string) {
  const publicClient = getPublicClient({ chainId: chainID });

  const abi = parseAbi([
    "function getPool(uint256) view returns ((bytes32 profileId, address strategy, address token, (uint256,string) metadata, bytes32 managerRole, bytes32 adminRole))",
    "function _maci() public view returns (address)",
    "function _pollContracts() public view returns ((address,address,address,address))",
    "function coordinatorPubKey() public view returns ((uint256,uint256))",
  ]);

  const alloContractAddress = "0x1133ea7af70876e64665ecd07c0a0476d09465a1";

  const [Pool] = await Promise.all([
    publicClient.readContract({
      abi,
      address: alloContractAddress,
      functionName: "getPool",
      args: [BigInt(roundID)],
    }),
  ]);

  const pool = Pool as {
    profileId: string;
    strategy: string;
    token: string;
    metadata: [bigint, string];
    managerRole: string;
    adminRole: string;
  };

  const [pollContracts, maci] = await Promise.all([
    publicClient.readContract({
      abi,
      address: pool.strategy as `0x${string}`,
      functionName: "_pollContracts",
    }),
    publicClient.readContract({
      abi,
      address: pool.strategy as `0x${string}`,
      functionName: "_maci",
    }),
  ]);

  const _coordinatorPubKey = await publicClient.readContract({
    abi,
    address: pollContracts[0] as `0x${string}`,
    functionName: "coordinatorPubKey",
  });

  const coordinatorPubKey = new PubKey([
    BigInt(_coordinatorPubKey[0]),
    BigInt(_coordinatorPubKey[1]),
  ]);

  return {
    maci,
    pollContracts,
    strategy: pool.strategy,
    coordinatorPubKey,
    roundId: roundID,
  };
}


const getContributed = async (
  chainID: number,
  roundID: string,
  walletAddress: string,
  dataLayer: DataLayer
): Promise<MACIContributions> => {
  const maciContracts = await getMaciAddress(chainID, roundID);
  const maciAddress = maciContracts.maci as `0x${string}`;

  const types = "uint256,address,address";
  const bytes = encodeAbiParameters(parseAbiParameters(types), [
    BigInt(chainID),
    maciAddress,
    walletAddress as `0x${string}`,
  ]);

  const id = ethers.utils.solidityKeccak256(["bytes"], [bytes]);
  const resp = await dataLayer.getContributionsByAddressAndId({
    contributorAddress: walletAddress.toLowerCase() as `0x${string}`,
    contributionId: id.toLowerCase() as `0x${string}`,
  });

  return { encrypted: resp[0], maciInfo: maciContracts };
};

const getContributions = async (
  walletAddress: string,
  dataLayer: DataLayer
): Promise<MACIContributions[]> => {
  const MACIContributions: MACIContributions[] = [];
  const contributions = await dataLayer.getContributionsByAddress({
    contributorAddress: walletAddress.toLowerCase() as `0x${string}`,
  });

  for (const contribution of contributions) {
    const maciContracts = await getMaciAddress(
      Number(contribution.chainId),
      contribution.roundId
    );
    MACIContributions.push({
      encrypted: contribution,
      maciInfo: maciContracts,
    });
  }

  return MACIContributions;
};
