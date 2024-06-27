import { getAddress } from "viem";

export const getZupassRegistryAddress = (chainId: number) => {
  const ZuPassRegistryAddress = getAddress(zupassRegistriesByChainId[chainId]);
  return ZuPassRegistryAddress;
};

const zupassRegistriesByChainId = {
  11155111: "0x455cC27badb067cb9b7cdE52F153DfebC83B1A99",
} as {
  [chainId: number]: `0x${string}`;
};
