import { Application, DataLayer } from "data-layer";


export const getVoteIdMap = async (
  applications: Application[],
  dataLayer: DataLayer
): Promise<{
  [chainId: number]: {
    [roundId: string]: {
      [appId: string]: {
        id: bigint;
        maxNonce: bigint | undefined;
        newVoteWeight: string | undefined;
        timestamp: string | undefined;
        transactionHash: string | undefined;
        chainId: number;
        roundId: string;
      };
    };
  };
}> => {
  const voteIdMap: {
    [chainId: number]: {
      [roundId: string]: {
        [appId: string]: {
          id: bigint;
          maxNonce: bigint | undefined;
          newVoteWeight: string | undefined;
          timestamp: string | undefined;
          transactionHash: string | undefined;
          chainId: number;
          roundId: string;
        };
      };
    };
  } = {};

  for (const app of applications) {
    const chainID = Number(app.chainId);

    const ID = (await dataLayer.getVoteOptionIndexByChainIdAndRoundId({
      chainId: chainID,
      roundId: app.roundId,
      recipientId: app.anchorAddress ?? ("" as string),
    })) as {
      votingIndexOptions: { optionIndex: bigint }[];
    };

    const voteOption = ID?.votingIndexOptions[0].optionIndex;

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
      id: voteOption,
      maxNonce: undefined,
      newVoteWeight: undefined,
      timestamp: undefined,
      transactionHash: undefined,
      chainId: chainId,
      roundId: app.roundId,
    };
  }
  return voteIdMap;
};
