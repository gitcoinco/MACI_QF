import useSWR from "swr";
import { DataLayer } from "data-layer";
interface VotingIndexOption {
  chainId: number;
  id: string;
  optionIndex: number;
  recipientId: string;
}

// Fetcher function for SWR
const fetcher = async (
  dataLayer: DataLayer,
  chainId: number,
  roundId: string
): Promise<VotingIndexOption[]> => {
  const response = await dataLayer.getVoteOptionIndexesByChainIdAndRoundId(
    chainId,
    roundId
  );
  return response.votingIndexOptions as VotingIndexOption[];
};

export const useVoteOptions = (
  dataLayer: DataLayer,
  chainId: number,
  roundId: string
) => {
  const { data, error } = useSWR(["voteOptions", chainId, roundId], () =>
    fetcher(dataLayer, chainId, roundId)
  );

  return {
    loading: !error && !data,
    error,
    data,
  };
};
