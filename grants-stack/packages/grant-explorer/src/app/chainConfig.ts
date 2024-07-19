import { Chain } from "wagmi/chains";
import { scroll, sepolia, customOptimism as optimism } from "common/src/chains";
import { ChainId } from "common/src/chain-ids";

const ensureValidChainId = (chain: Chain) => {
  if (Object.values(ChainId).includes(chain.id)) {
    return chain;
  } else {
    throw new Error(`Chain id not recognized: ${chain.id}`);
  }
};

const TESTNET_CHAINS = [optimism, sepolia].map(ensureValidChainId);

const MAINNET_CHAINS = [optimism].map(ensureValidChainId);

export const getEnabledChains = (): Chain[] => {
  switch (process.env.REACT_APP_ENV) {
    case "development":
      return [...TESTNET_CHAINS, ...MAINNET_CHAINS];
    case "production":
      return MAINNET_CHAINS;
    case "test":
      return MAINNET_CHAINS;
    default:
      throw new Error(
        `Unrecognized REACT_APP_ENV: ${process.env.REACT_APP_ENV}`
      );
  }
};
