import {
  CHAINS,
  getVotingTokenOptions,
  GroupedCartProjectsByRoundId,
} from "../../api/utils";
import { useEffect } from "react";
import { RoundInCart } from "./RoundInCart";
import { ChainId, useTokenPrice } from "common";
import { useCartStorage } from "../../../store";
import {
  GroupedCreditsByRoundId,
  MACIContributionsByRoundId,
  MACIDecryptedContributionsByRoundId,
} from "../../api/types";

type Props = {
  cart: GroupedCartProjectsByRoundId;
  maciContributions: MACIContributionsByRoundId | null;
  decryptedContributions: MACIDecryptedContributionsByRoundId | null;
  chainId: ChainId;
  needsSignature: {
    [roundId: string]: boolean;
  } | null;
  groupedCredits: GroupedCreditsByRoundId;
  handleDecrypt: () => Promise<void>;
};

export function CartWithProjects({
  cart,
  chainId,
  maciContributions,
  decryptedContributions,
  needsSignature,
  groupedCredits,
  handleDecrypt,
}: Props) {
  const chain = CHAINS[chainId];
  const cartByRound = Object.values(cart);

  const roundIds = Object.keys(cart);

  const store = useCartStorage();

  const { getVotingTokenForChain, setVotingTokenForChain } = useCartStorage();
  const selectedPayoutToken = getVotingTokenForChain(chainId);

  const { data, error, loading } = useTokenPrice(
    selectedPayoutToken.redstoneTokenId
  );
  const payoutTokenPrice = !loading && !error ? Number(data) : null;

  // get number of projects in cartByRound
  const projectCount = cartByRound.reduce((acc, curr) => acc + curr.length, 0);

  /** The payout token data (like permit version etc.) might've changed since the user last visited the page
   * Refresh it to update, default to the first payout token if the previous token was deleted */
  useEffect(() => {
    setVotingTokenForChain(chainId, getVotingTokenOptions(chainId)[0]);
    /* We only want this to happen on first render */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainId]);

  return (
    <div className="grow block px-[16px] lg:pl-0 py-4 bg-white">
      <div className="flex flex-col md:flex-row justify-between border-b-2 pb-2 gap-3 mb-6">
        <div className="flex flex-row basis-[28%] gap-2">
          <img
            className="mt-2 inline-block h-9 w-9"
            src={chain.logo}
            alt={"Chain Logo"}
          />
          <h2 className="mt-3 text-2xl font-semibold">{chain.name}</h2>
          <h2 className="mt-3 text-2xl font-semibold">({projectCount})</h2>
        </div>
      </div>

      {cartByRound.map((roundcart, key) => (
        <div key={key}>
          <RoundInCart
            key={key}
            roundCart={roundcart}
            maciContributions={
              maciContributions && maciContributions[roundIds[key]]
                ? maciContributions[roundIds[key]]
                : null
            }
            decryptedContributions={
              decryptedContributions && decryptedContributions[roundIds[key]]
                ? decryptedContributions[roundIds[key]]
                : null
            }
            voiceCredits={groupedCredits[roundIds[key]]}
            handleRemoveProjectFromCart={store.removeUserProject}
            selectedPayoutToken={selectedPayoutToken}
            payoutTokenPrice={payoutTokenPrice ?? 0}
            chainId={chainId}
            roundId={roundIds[key]}
            needsSignature={
              needsSignature ? needsSignature[roundIds[key]] : null
            }
            handleDecrypt={handleDecrypt}
          />
        </div>
      ))}
    </div>
  );
}
