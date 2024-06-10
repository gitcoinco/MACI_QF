import { getPublicClient } from "@wagmi/core";
import { parseAbi } from "viem";
import { Application } from "data-layer";

export const getVoteIdMap = async (
  applications: Application[]
): Promise<{
  [key: string]: {
    id: bigint;
    maxNonce: bigint | undefined;
    newVoteWeight: string | undefined;
    isNew?: boolean;
  };
}> => {
  const client = getPublicClient();
  const voteIdMap: {
    [key: string]: {
      id: bigint;
      maxNonce: bigint | undefined;
      newVoteWeight: string | undefined;
      isNew?: boolean;
    };
  } = {};

  for (const app of applications) {
    const strategyAddress = await client
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

    // Store the ID with the maximum nonce found
    voteIdMap[app.id] = {
      id: ID,
      maxNonce: undefined,
      newVoteWeight: undefined,
      isNew: false,
    };
  }
  return voteIdMap;
};
