import React, { useEffect, useMemo, useState } from "react";
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
    handleRemoveProjectFromCart: (
      project: CartProject,
      walletAddress: string
    ) => void;
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

  // create a variable with the current Date time in UTC
  const currentTime = new Date();

  const isActiveRound = round && round?.roundEndTime > currentTime;

  // State to hold the input value
  const [donationInput, setDonationInput] = useState(
    alreadyContributed ? formatUnits(donatedAmount, 18) : "0.0"
  );

  // Memoized value to ensure it's numeric and to apply any additional logic
  const donationValue = isNaN(parseFloat(donationInput))
    ? 0
    : parseFloat(donationInput) * props.payoutTokenPrice;

  // Handle input changes
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    // Use a regex to ensure only numeric input (optional: include decimal handling)
    if (/^\d*\.?\d*$/.test(value)) {
      setDonationInput(value);
    }
  };

  return (
    <div className="my-4 flex w-full">
      {/* Left Section: Round In Cart and Total Donations */}
      {isActiveRound ? (
        <div className="flex w-full">
          <div className="flex flex-col flex-grow w-3/4">
            <div className="bg-grey-50 px-4 py-6 rounded-t-xl mb-4 flex-grow mr-2">
              {" "}
              {/* Margin right of 2 added here */}
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

                {!alreadyContributed && (
                  <div className="flex flex-col items-end">
                    <label
                      htmlFor="totalDonationETH"
                      className="text-lg font-semibold"
                    >
                      Total Donation (ETH):
                    </label>
                    <input
                      type="text"
                      id="totalDonationETH"
                      value={donationInput}
                      onChange={handleInputChange}
                      className="mt-1 px-3 py-2 bg-white border shadow-sm border-slate-300 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:ring-sky-500 block w-full rounded-md sm:text-sm focus:ring-1"
                      placeholder="Enter amount in ETH"
                    />
                  </div>
                )}
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
                        totalAmount={parseFloat(donationInput)}
                        project={project}
                        index={key}
                        roundRoutePath={`/round/${props.chainId}/${props.roundCart[0].roundId}`}
                        last={key === props.roundCart.length - 1}
                        payoutTokenPrice={props.payoutTokenPrice}
                        walletAddress={address as string}
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
                      {donationValue.toFixed(2)}
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
              donatedAmount={BigInt(parseFloat(donationInput) * 10 ** 18)}
              maciMessages={props.maciContributions ?? null}
              roundId={props.roundId}
              chainId={props.chainId}
              walletAddress={address as string}
            />
          </div>
        </div>
      ) : (
        <div></div>
      )}
    </div>
  );
}
