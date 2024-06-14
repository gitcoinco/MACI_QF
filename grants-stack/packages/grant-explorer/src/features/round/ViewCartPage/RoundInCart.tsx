import React, { useState, useEffect, useCallback } from "react";
import { CartProject, MACIContributions } from "../../api/types";
import { useRoundById } from "../../../context/RoundContext";
import { ProjectInCart } from "./ProjectInCart";
import { useAccount } from "wagmi";
import { useCartStorage } from "../../../store";
import { Button, Input, Tooltip } from "@chakra-ui/react";
import { VotingToken } from "common";
import { getMACIKeys } from "../../api/keys";
import { PCommand } from "maci-domainobjs";
import { SummaryContainer } from "./SummaryContainer";
import { WalletClient, getWalletClient } from "@wagmi/core";
import { useDataLayer } from "data-layer";
import { useVoiceCreditsByRoundIdAndChainId } from "../../projects/hooks/useRoundMaciMessages";
import { parseEther } from "viem";

export function RoundInCart(
  props: React.ComponentProps<"div"> & {
    roundCart: CartProject[];
    maciContributions: MACIContributions | null;
    decryptedContributions: PCommand[] | null;
    selectedPayoutToken: VotingToken;
    handleRemoveProjectFromCart: (project: CartProject) => void;
    payoutTokenPrice: number;
    chainId: number;
    roundId: string;
    needsSignature: boolean | null;
    handleDecrypt: () => Promise<void>;
  }
) {
  const round = useRoundById(props.chainId, props.roundId).round;

  const minDonationThresholdAmount =
    round?.roundMetadata?.quadraticFundingConfig?.minDonationThresholdAmount ??
    1;

  const { address } = useAccount();
  const dataLayer = useDataLayer();

  const { data: voiceCreditBalance } = useVoiceCreditsByRoundIdAndChainId(
    props.chainId,
    props.roundId,
    address as string,
    dataLayer
  );

  const [percentages, setPercentages] = useState<number[]>([]);
  const [locked, setLocked] = useState<boolean[]>([]);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [totalAmount, setTotalAmount] = useState<number>(0);

  useEffect(() => {
    if (props.roundCart.length > 0) {
      const totalAmount = props.roundCart.reduce(
        (acc, proj) => acc + Number(proj.amount),
        0
      );
      setTotalAmount(totalAmount);
      setPercentages(
        props.roundCart.map((proj) =>
          totalAmount > 0 ? (Number(proj.amount) / totalAmount) * 100 : 0
        )
      );
      setLocked(props.roundCart.map(() => false));
    }
  }, [props.roundCart]);

  const handleTotalAmountChange = (newTotalAmount: number) => {
    if (newTotalAmount < 0) return;

    setTotalAmount(newTotalAmount);

    const lockedPercentage = percentages.reduce(
      (acc, perc, idx) => (locked[idx] ? acc + perc : acc),
      0
    );
    const unlockedPercentage = 100 - lockedPercentage;

    const newPercentages = percentages.map((percentage, idx) => {
      if (locked[idx]) {
        return percentage;
      }
      return (percentage / unlockedPercentage) * (100 - lockedPercentage);
    });

    setPercentages(newPercentages);

    const newAmounts = newPercentages.map((percentage) =>
      Math.max(Math.floor((percentage / 100) * newTotalAmount), 0)
    );

    props.roundCart.forEach((proj, idx) => {
      proj.amount = newAmounts[idx].toString();
    });
  };

  const handlePercentageChange = (index: number, newPercentage: number) => {
    const totalPercentage = percentages.reduce(
      (acc, perc, idx) => acc + (locked[idx] ? perc : 0),
      0
    );
    const availablePercentage = 100 - totalPercentage;

    if (newPercentage > availablePercentage) {
      setTooltipVisible(true);
      setTimeout(() => setTooltipVisible(false), 2000);
      return;
    }

    const updatedPercentages = [...percentages];
    updatedPercentages[index] = newPercentage;

    const remainingPercentage = 100 - newPercentage;
    const remainingUnlockedIndexes = percentages
      .map((perc, idx) => !locked[idx] && idx)
      .filter((idx) => idx !== false && idx !== index);

    const distributedPercentages = remainingUnlockedIndexes.map((idx) => {
      const currentPerc = percentages[idx as number];
      return (currentPerc / remainingPercentage) * (100 - newPercentage);
    });

    remainingUnlockedIndexes.forEach((idx, i) => {
      updatedPercentages[idx as number] = distributedPercentages[i];
    });

    setPercentages(updatedPercentages);

    const newAmounts = updatedPercentages.map((percentage) =>
      Math.max(Math.floor((percentage / 100) * totalAmount), 0)
    );

    props.roundCart.forEach((proj, idx) => {
      proj.amount = newAmounts[idx].toString();
    });
  };

  const handleLockToggle = (index: number) => {
    setLocked((prev) => {
      const updated = [...prev];
      updated[index] = !updated[index];
      return updated;
    });
  };

  const alreadyContributed =
    (props.maciContributions?.encrypted ? true : (false as boolean)) || false;

  return (
    <div className="my-4 flex w-full">
      {round ? (
        <div className="flex w-full">
          <div className="flex flex-col flex-grow w-3/4">
            {!alreadyContributed && (
              <div className="flex items-center mb-4 justify-end">
                <p className="mr-2 font-semibold">Total Contribution Amount:</p>
                <Input
                  type="number"
                  value={totalAmount}
                  onChange={(e) =>
                    handleTotalAmountChange(parseFloat(e.target.value) || 0)
                  }
                  min={0}
                  step={0.01}
                  className="w-[100px] sm:w-[80px] text-center border border-black"
                />
              </div>
            )}
            <div className="bg-grey-50 px-4 py-6 rounded-t-xl mb-4 flex-grow">
              <div className="flex flex-row items-end justify-between">
                <div className="flex flex-col">
                  <div>
                    <p className="text-xl font-semibold inline">
                      {round?.roundMetadata?.name}
                    </p>
                    <p className="text-lg font-bold ml-2 inline">
                      ({props?.roundCart?.length})
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
                {props?.roundCart?.length > 0 &&
                  props.roundCart.map((project, key) => (
                    <div key={key}>
                      <ProjectInCart
                        projects={props?.roundCart}
                        selectedPayoutToken={props?.selectedPayoutToken}
                        removeProjectFromCart={
                          props?.handleRemoveProjectFromCart
                        }
                        project={project}
                        index={key}
                        roundRoutePath={`/round/${props?.chainId}/${props.roundCart[0]?.roundId}`}
                        last={key === props?.roundCart?.length - 1}
                        payoutTokenPrice={props?.payoutTokenPrice}
                        percentage={percentages[key]}
                        onPercentageChange={handlePercentageChange}
                        isLocked={locked[key]}
                        onLockToggle={handleLockToggle}
                      />
                    </div>
                  ))}
                {tooltipVisible && (
                  <Tooltip label="Total percentage cannot exceed 100%">
                    <span className="text-red-500">
                      Total percentage cannot exceed 100%
                    </span>
                  </Tooltip>
                )}
              </div>
            </div>
          </div>
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
              donatedAmount={BigInt(parseEther(totalAmount.toString()))}
              maciMessages={props?.maciContributions ?? null}
              roundId={props?.roundId}
              chainId={props?.chainId}
            />
          </div>
        </div>
      ) : (
        <div></div>
      )}
    </div>
  );
}
