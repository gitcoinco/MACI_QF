import { PublicClient, parseAbi } from "viem";
import { VotingToken } from "../types";

export type PermitSignature = {
  v: number;
  r: string;
  s: string;
};
/** Given a payout token, selects the correct permit type.
 * - DAI is the old permit type without `value` and with the `allowed` prop
 * - eip2612 is the standard permit interface, as specified in https://eips.ethereum.org/EIPS/eip-2612
 *
 * Old DAI permit type is only implemented on Ethereum and Polygon PoS. Check /docs/DAI.md for more info.
 * */
export const getPermitType = (token: VotingToken): PermitType => {
  if (/DAI/i.test(token.name) && [1, 137, 11155111].includes(token.chainId)) {
    return "dai";
  } else {
    return "eip2612";
  }
};

export type PermitType = "dai" | "eip2612";

export const getMACIABI = () => {
  const abi = parseAbi([
    "function getPool(uint256) view returns ((bytes32 profileId, address strategy, address token, (uint256,string) metadata, bytes32 managerRole, bytes32 adminRole))",
    "function pollContracts() view returns ((address poll, address messageProcessor,address tally,address subsidy))",
    "function coordinatorPubKey() view returns (uint256 x, uint256 y)",
    "function allocate(uint256, bytes) external payable",
    "function usedRoundNullifiers(address, uint256) view returns (bool)",
    "function publishMessageBatch((uint256 msgType,uint256[10] data)[] _messages,(uint256 x,uint256 y)[] _pubKeys)",
    "function maxValues() view returns (uint256 maxVoteOptions)",
    "function coordinatorPubKey() view returns ((uint256, uint256))",
    "function tallyHash() view returns (string)",
    "function totalVotesSquares() view returns (uint256)",
    "function ALPHA_PRECISION() view returns (uint256)",
    "function voiceCreditFactor() view returns (uint256)",
    "function getPoolAmount() view returns (uint256)",
  ]);
  return abi;
};

export const getPoolData = async (
  roundId: number,
  alloContractAddress: `0x${string}`,
  publicClient: PublicClient
) => {
  const abi = getMACIABI();
  const [Pool] = await Promise.all([
    publicClient.readContract({
      abi: abi,
      address: alloContractAddress,
      functionName: "getPool",
      args: [BigInt(roundId)],
    }),
  ]);

  return Pool;
};

export const getMaciContracts = async (
  strategyAddress: `0x${string}`,
  publicClient: PublicClient
) => {
  const abi = getMACIABI();
  const pollContracts = await publicClient.readContract({
    abi: abi,
    address: strategyAddress,
    functionName: "pollContracts",
  });
  return pollContracts;
};
