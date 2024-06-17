import React from "react";
import { CartProject, MACIContributions } from "../../api/types";
import { useRoundById } from "../../../context/RoundContext";
import { ProjectInCart } from "./ProjectInCart";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";
import { useCartStorage } from "../../../store";
import { Button } from "@chakra-ui/react";
import { VotingToken } from "common";

import { getMACIKeys } from "../../api/keys";
import { PCommand } from "maci-domainobjs";
import { SummaryContainer } from "./SummaryContainer";
import { WalletClient, getWalletClient } from "@wagmi/core";

export function RoundInCart(
  props: React.ComponentProps<"div"> & {
    roundCart: CartProject[];
    maciContributions: MACIContributions | null;
    decryptedContributions: PCommand[] | null;
    selectedPayoutToken: VotingToken;
    handleRemoveProjectFromCart: (project: CartProject) => void;
    voiceCredits: string | null;
    payoutTokenPrice: number;
    chainId: number;
    roundId: string;
    needsSignature: boolean | null;
    handleDecrypt: () => Promise<void>;
  }
) {
  const round = useRoundById(props.chainId, props.roundId).round;

  const minDonationThresholdAmount = 1;

  const { address } = useAccount();

  const voiceCreditBalance = props.voiceCredits;

  const alreadyContributed = voiceCreditBalance ? true : false;

  console.log("voiceCreditBalance", voiceCreditBalance);

  const donatedCredits = BigInt(voiceCreditBalance ?? 0n);

  const donatedAmount = donatedCredits * 10n ** 13n;

  const votingTokenForChain = useCartStorage((state) =>
    state.getVotingTokenForChain(props.chainId)
  );

  const totalDonationInUSD =
    props.roundCart.reduce((acc, proj) => acc + Number(proj.amount), 0) *
    props.payoutTokenPrice;

  // create a variable with the current Date time in UTC
  const currentTime = new Date();

  const isActiveRound = round && round?.roundEndTime > currentTime;

  return (
    <div className="my-4 flex w-full">
      {/* Left Section: Round In Cart and Total Donations */}
      {isActiveRound ? (
        <div className="flex w-full">
          <div className="flex flex-col flex-grow w-3/4">
            <div className="bg-grey-50 px-4 py-6 rounded-t-xl mb-4 flex-grow">
              <div className="flex flex-row items-end justify-between">
                <div className="flex flex-col">
                  <div>
                    <p className="text-xl font-semibold inline">
                      {round?.roundMetadata?.name}
                    </p>
                    <p className="text-lg font-bold ml-2 inline">
                      ({props.roundCart.length})
                    </p>
                  </div>
                  {minDonationThresholdAmount && (
                    <div>
                      <p className="text-sm pt-2 italic mb-5">
                        Your donation to each project must be valued at{" "}
                        {minDonationThresholdAmount} USD or more to be eligible
                        for matching.
                      </p>
                    </div>
                  )}
                </div>
              </div>
              <div>
                {props.roundCart.map((project, key) => {
                  return (
                    <div key={key}>
                      <ProjectInCart
                        projects={props.roundCart}
                        selectedPayoutToken={props.selectedPayoutToken}
                        removeProjectFromCart={
                          props.handleRemoveProjectFromCart
                        }
                        credits={donatedCredits}
                        project={project}
                        index={key}
                        roundRoutePath={`/round/${props.chainId}/${props.roundCart[0].roundId}`}
                        last={key === props.roundCart.length - 1}
                        payoutTokenPrice={props.payoutTokenPrice}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Total Donations */}
            <div className="p-4 bg-grey-100 rounded-b-xl font-medium text-lg">
              <div className="flex flex-row justify-between items-center">
                <div className="flex flex-row gap-3 justify-center pt-1 pr-2">
                  <div className="font-semibold">
                    <p>
                      <span className="mr-2">Total donation</span>$
                      {!alreadyContributed
                        ? isNaN(totalDonationInUSD)
                          ? "0.0"
                          : totalDonationInUSD.toFixed(2)
                        : (
                            Number(
                              formatUnits(
                                donatedAmount,
                                votingTokenForChain.decimal
                              )
                            ) * props.payoutTokenPrice
                          ).toFixed(2)}
                    </p>
                  </div>
                  {props.needsSignature && (
                    <div className="flex flex-row items-center gap-2">
                      <Button
                        onClick={async () => {
                          const walletClient = await getWalletClient();
                          await getMACIKeys({
                            chainID: props.roundCart[0].chainId,
                            roundID: props.roundCart[0].roundId,
                            walletAddress: address as string,
                            walletClient: walletClient as WalletClient,
                          });
                          await props.handleDecrypt();
                        }}
                      >
                        Decrypt
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          {/* Summary Container */}
          <div className="w-1/4 ml-[4%]">
            <SummaryContainer
              alreadyContributed={
                (props.maciContributions?.encrypted
                  ? true
                  : (false as boolean)) || false
              }
              payoutTokenPrice={props.payoutTokenPrice}
              decryptedMessages={props.decryptedContributions}
              stateIndex={BigInt(
                props.maciContributions?.encrypted?.stateIndex ?? "0"
              )}
              donatedAmount={donatedAmount}
              maciMessages={props.maciContributions ?? null}
              roundId={props.roundId}
              chainId={props.chainId}
            />
          </div>
        </div>
      ) : (
        <div></div>
      )}
    </div>
  );
}