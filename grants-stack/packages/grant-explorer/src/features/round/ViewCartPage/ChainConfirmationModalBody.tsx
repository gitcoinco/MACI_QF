import React from "react";
import { CartProject } from "../../api/types";
import { ChainId, VotingToken } from "common";
import { CHAINS } from "../../api/utils";
import { useCartStorage } from "../../../store";
import { formatUnits } from "viem";
import { parseChainId } from "common/src/chains";
import { Checkbox, Tooltip } from "@chakra-ui/react";
import { InformationCircleIcon } from "@heroicons/react/24/outline";

type ChainConfirmationModalBodyProps = {
  projectsByChain: { [chain: number]: CartProject[] };
  totalDonationsPerChain: { [chain: number]: bigint };
  totalContributed: bigint;
  chainIdsBeingCheckedOut: number[];
  setChainIdsBeingCheckedOut: React.Dispatch<React.SetStateAction<number[]>>;
  alreadyContributed: boolean;
};

export function ChainConfirmationModalBody({
  projectsByChain,
  totalDonationsPerChain,
  totalContributed,
  chainIdsBeingCheckedOut,
  setChainIdsBeingCheckedOut,
  alreadyContributed,
}: ChainConfirmationModalBodyProps) {
  const handleChainCheckboxChange = (chainId: number, checked: boolean) => {
    if (checked) {
      setChainIdsBeingCheckedOut((prevChainIds) =>
        prevChainIds.includes(chainId)
          ? prevChainIds
          : [...prevChainIds, chainId]
      );
    } else {
      setChainIdsBeingCheckedOut((prevChainIds) =>
        prevChainIds.filter((id) => id !== chainId)
      );
    }
  };

  const getVotingTokenForChain = useCartStorage(
    (state) => state.getVotingTokenForChain
  );

  return (
    <>
      {!alreadyContributed ? (
        <p className="text-sm text-grey-400">
          Checkout your donations for the round.
        </p>
      ) : (
        <p className="text-sm text-grey-400">
          Change your donations for the round.
        </p>
      )}
      <div className="">
        {Object.keys(projectsByChain)
          .map(parseChainId)
          .filter((chainId) => chainIdsBeingCheckedOut.includes(chainId))
          .map((chainId, index) => (
            <ChainSummary
              chainId={chainId}
              selectedPayoutToken={getVotingTokenForChain(chainId)}
              totalDonation={totalDonationsPerChain[chainId]}
              totalContributed={totalContributed}
              checked={chainIdsBeingCheckedOut.includes(chainId)}
              chainsBeingCheckedOut={chainIdsBeingCheckedOut.length}
              onChange={(checked) =>
                handleChainCheckboxChange(chainId, checked)
              }
              isLastItem={index === Object.keys(projectsByChain).length - 1}
            />
          ))}
      </div>
    </>
  );
}

type ChainSummaryProps = {
  totalDonation: bigint;
  totalContributed: bigint;
  selectedPayoutToken: VotingToken;
  chainId: ChainId;
  checked: boolean;
  chainsBeingCheckedOut: number;
  onChange: (checked: boolean) => void;
  isLastItem: boolean;
};

export function ChainSummary({
  selectedPayoutToken,
  totalDonation,
  totalContributed,
  chainId,
  checked,
  chainsBeingCheckedOut,
  onChange,
  isLastItem,
}: ChainSummaryProps) {
  return (
    <div
      className={`flex flex-col justify-center mt-2 ${
        isLastItem ? "" : "border-b"
      } py-4`}
    >
      <p className="font-sans font-medium">
        <Checkbox
          className={`mr-2 mt-1  ${
            chainsBeingCheckedOut === 1 ? "invisible" : ""
          }`}
          border={"1px"}
          borderRadius={"4px"}
          colorScheme="whiteAlpha"
          iconColor="black"
          size="lg"
          isChecked={checked}
          disabled={chainsBeingCheckedOut === 1}
          onChange={(e) => onChange(e.target.checked)}
        />

        <div className="flex items-center">
          <img
            className="inline mr-2 w-5 h-5"
            alt={CHAINS[chainId].name}
            src={CHAINS[chainId].logo}
          />
          <span className="font-sans font-medium">
            Checkout {CHAINS[chainId].name} cart
          </span>
          <Tooltip
            label="Due to the use of big integers in MACI voting calculations, small rounding differences might appear in the total donation amounts."
            aria-label="Explanation tooltip"
          >
            <InformationCircleIcon className="w-4 h-4 ml-2" />
          </Tooltip>
        </div>
      </p>
      <p className="ml-7 mt-2 flex flex-wrap items-center">
        <span data-testid={"totalDonation"} className="mr-2">
          {formatUnits(totalDonation, selectedPayoutToken.decimal)}
        </span>
        <span data-testid={"chainSummaryPayoutToken"}>
          to be donated out of{" "}
          {formatUnits(totalContributed, selectedPayoutToken.decimal)}{" "}
          {selectedPayoutToken.name}
        </span>
        <Tooltip
          label="Make sure that you use 100% of your contribution amount."
          aria-label="Important info tooltip"
        >
          <InformationCircleIcon className="w-4 h-4 ml-2" />
        </Tooltip>
      </p>
    </div>
  );
}
