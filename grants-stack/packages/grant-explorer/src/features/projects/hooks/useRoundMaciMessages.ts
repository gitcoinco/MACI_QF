import useSWR from "swr";
import { DataLayer } from "data-layer";
import { getPublicClient, signMessage } from "@wagmi/core";
import {
  encodeAbiParameters,
  getAddress,
  parseAbi,
  parseAbiParameters,
} from "viem";
import { generatePubKeyWithSeed } from "../../../checkoutStore";
import { ethers } from "ethers";
import { getContributorMessages } from "../../api/voting";
import { PubKey } from "maci-domainobjs";
type Params = {
  chainId?: number;
  roundId?: string;
  address: string;
};

export function useRoundMaciMessages(params: Params, dataLayer: DataLayer) {
  const shouldFetch = Object.values(params).every(Boolean);
  return useSWR(
    shouldFetch ? ["allApprovedApplications", params] : null,
    async () => {
      if (params.chainId === undefined || params.roundId === undefined) {
        return null;
      }

      return await getContributed(
        params.chainId,
        params.roundId,
        params.address,
        dataLayer
      );
    }
  );
}

async function getMaciAddress(chainID: number, roundID: string) {
  const publicClient = getPublicClient({
    chainId: chainID,
  });

  const abi = parseAbi([
    "function getPool(uint256) view returns ((bytes32 profileId, address strategy, address token, (uint256,string) metadata, bytes32 managerRole, bytes32 adminRole))",
    "function _maci() public view returns (address)",
    "function _pollContracts() public view returns ((address,address,address,address))",
    "function coordinatorPubKey() public view returns ((uint256,uint256))",
  ]);

  const alloContractAddress = "0x1133ea7af70876e64665ecd07c0a0476d09465a1";

  const [Pool] = await Promise.all([
    publicClient.readContract({
      abi: abi,
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
      abi: abi,
      address: pool.strategy as `0x${string}`,
      functionName: "_pollContracts",
    }),
    publicClient.readContract({
      abi: abi,
      address: pool.strategy as `0x${string}`,
      functionName: "_maci",
    }),
  ]);

  const _coordinatorPubKey = await publicClient.readContract({
    abi: abi,
    address: pollContracts[0] as `0x${string}`,
    functionName: "coordinatorPubKey",
  });

  const coordinatorPubKey = new PubKey([
    BigInt(_coordinatorPubKey[0]),
    BigInt(_coordinatorPubKey[1]),
  ]);

  console.log("pool", pool.strategy);

  return {
    maci: maci,
    pollContracts: pollContracts,
    strategy: pool.strategy,
    coordinatorPubKey: coordinatorPubKey,
    roundId: roundID,
  };
}

const getContributed = async (
  chainID: number,
  roundID: string,
  walletAddress: string,
  dataLayer: DataLayer
) => {
  const maciContracts = await getMaciAddress(chainID, roundID);

  const maciAddress = maciContracts.maci as `0x${string}`;

  console.log("maciAddress", maciAddress);

  const types = "uint256,address,address";
  const bytes = encodeAbiParameters(parseAbiParameters(types), [
    BigInt(chainID),
    maciAddress,
    walletAddress as `0x${string}`,
  ]);

  const id = ethers.utils.solidityKeccak256(["bytes"], [bytes]);
  const resp = await dataLayer.getContributionsByAddressAndId({
    contributorAddress: walletAddress?.toLowerCase() as `0x${string}`,
    contributionId: id.toLowerCase() as `0x${string}`,
  });

  return { encrypted: resp, maciInfo: maciContracts };
};
