import useSWR from "swr";
import { Application, DataLayer } from "data-layer";


type Params = {
  chainId?: number;
  roundId?: string;
};

export function useRoundApprovedApplications(
  params: Params,
  dataLayer: DataLayer
) {
  const shouldFetch = Object.values(params).every(Boolean);
  return useSWR(
    shouldFetch ? ["allApprovedApplications", params] : null,
    async () => {
      if (params.chainId === undefined || params.roundId === undefined) {
        return null;
      }

      return await dataLayer.getApplicationsForExplorer({
        roundId: params.roundId,
        chainId: params.chainId,
      });
    }
  );
}

export function useRoundsApprovedApplications(
  params: Params[],
  dataLayer: DataLayer
) {
  const shouldFetch = params.every(
    (param) => param.chainId !== undefined && param.roundId !== undefined
  );

  return useSWR(
    shouldFetch ? ["allApprovedApplications", params] : null,
    async () => {
      const response: {
        [chainId: number]: { [roundId: string]: Application[] };
      } = {};

      for (const param of params) {
        if (param.chainId === undefined || param.roundId === undefined) {
          return null;
        }

        if (!response[param.chainId]) {
          response[param.chainId] = {};
        }

        response[param.chainId][param.roundId] =
          await dataLayer.getApplicationsForExplorer({
            roundId: param.roundId,
            chainId: param.chainId,
          });
      }

      return response;
    }
  );
}