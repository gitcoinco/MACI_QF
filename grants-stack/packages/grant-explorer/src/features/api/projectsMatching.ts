import { getPublicClient } from "@wagmi/core";
import { parseAbi } from "viem";
import { Application } from "data-layer";

export const getVoteIdMap = async (
  applications: Application[]
): Promise<{
  [chainId: number]: {
    [roundId: string]: {
      [appId: string]: {
        id: bigint;
        maxNonce: bigint | undefined;
        newVoteWeight: string | undefined;
        isNew?: boolean;
        chainId: number;
        roundId: string;
      };
    };
  };
}> => {
  const client = getPublicClient();
  const voteIdMap: {
    [chainId: number]: {
      [roundId: string]: {
        [appId: string]: {
          id: bigint;
          maxNonce: bigint | undefined;
          newVoteWeight: string | undefined;
          isNew?: boolean;
          chainId: number;
          roundId: string;
        };
      };
    };
  } = {};

  for (const app of applications) {
    const strategyAddress = await getPublicClient({
      chainId: Number(app.chainId),
    })
      .readContract({
        address: "0x1133eA7Af70876e64665ecD07C0A0476d09465a1" as `0x${string}`,
        abi: parseAbi([
          "function getPool(uint256) public view returns ((bytes32, address, address, (uint256,string), bytes32, bytes32))",
        ]),
        functionName: "getPool",
        args: [BigInt(app.roundId)],
      })
      .then((res) => res[1]);

    const ID = await client.readContract({
      address: strategyAddress as `0x${string}`,
      abi: parseAbi([
        "function recipientToVoteIndex(address) public view returns (uint256)",
      ]),
      functionName: "recipientToVoteIndex",
      args: [app.id as `0x${string}`],
    });

    const chainId = Number(app.chainId);

    // Initialize nested objects if they don't exist
    if (!voteIdMap[chainId]) {
      voteIdMap[chainId] = {};
    }
    if (!voteIdMap[chainId][app.roundId]) {
      voteIdMap[chainId][app.roundId] = {};
    }

    // Store the ID with the maximum nonce found
    voteIdMap[chainId][app.roundId][app.id] = {
      id: ID,
      maxNonce: undefined,
      newVoteWeight: undefined,
      isNew: false,
      chainId: chainId,
      roundId: app.roundId,
    };
  }
  return voteIdMap;
};
