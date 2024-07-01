import { Chain } from "@rainbow-me/rainbowkit";
import { alchemyProvider } from "wagmi/providers/alchemy";
import { infuraProvider } from "wagmi/providers/infura";
import { publicProvider } from "wagmi/providers/public";
import { sepolia, scroll } from "common/src/chains";
import { getConfig } from "common/src/config";

const availableChains: { [key: string]: Chain } = {
  scroll,
  sepolia,
};

const stagingChains = [scroll, sepolia];

const productionChains = [scroll, sepolia];

export function getEnabledChainsAndProviders() {
  const config = getConfig();
  const chains: Chain[] = [];
  const providers = [publicProvider({ priority: 2 })];

  const {
    blockchain: { chainsOverride },
  } = config;
  const selectedChainsNames =
    chainsOverride !== undefined &&
    chainsOverride.trim() !== "" &&
    // FIXME: now that we are validating config vars with zod, we allow optional vars.
    // Until we finalize the global configuration we leave chainsOverride in prod set as "-"
    // to make the verify-env task passing.
    // When we finish the refactoring to use the global config everywhere, we can change the way we
    // verify the env vars
    chainsOverride !== "-"
      ? chainsOverride.split(",").map((name) => name.trim())
      : [];

  let usingDevOnlyChains = true;

  if (selectedChainsNames.length > 0) {
    // if REACT_APP_CHAINS_OVERRIDE is specified we use those
    selectedChainsNames.forEach((name) => {
      // if it's not a local dev chain, it means we are using external
      // chains and we need infura/alchemy ids to be set
      if (!/^dev[1-9]+$/.test(name)) {
        usingDevOnlyChains = false;
      }

      const chain = availableChains[name];
      if (chain === undefined) {
        throw new Error(
          `availableChains doesn't contain a chain called "${name}"`
        );
      }

      chains.push(chain);
    });
  } else if (config.appEnv === "production") {
    // if REACT_APP_CHAINS_OVERRIDE is not specified  ans we are in production
    // we use the default chains for production environments
    usingDevOnlyChains = false;
    chains.push(...productionChains);
  } else {
    // if REACT_APP_CHAINS_OVERRIDE is not specified we use the
    // default chains for staging
    usingDevOnlyChains = false;
    chains.push(...stagingChains);
  }

  if (!usingDevOnlyChains) {
    if (
      process.env.NODE_ENV !== "test" &&
      (config.blockchain.infuraId === undefined ||
        config.blockchain.alchemyId === undefined)
    ) {
      throw new Error(
        "REACT_APP_INFURA_ID and REACT_APP_ALCHEMY_ID must be set to use non-local chains"
      );
    }

    providers.push(
      infuraProvider({ apiKey: config.blockchain.infuraId!, priority: 0 }),
      alchemyProvider({ apiKey: config.blockchain.alchemyId!, priority: 1 })
    );
  }

  return { chains, providers };
}
