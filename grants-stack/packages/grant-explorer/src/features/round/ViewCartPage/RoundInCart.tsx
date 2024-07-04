import React, { useCallback, useEffect, useState } from "react";
import { CartProject } from "../../api/types";
import { useRoundById } from "../../../context/RoundContext";
import { ProjectInCart } from "./ProjectInCart";
import { parseUnits } from "viem";
import { useAccount } from "wagmi";
import {
  Button,
  Tooltip,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  ModalFooter,
} from "@chakra-ui/react";
import { VotingToken } from "common";
import { SummaryContainer } from "./SummaryContainer";
import { zuAuthPopup } from "@pcd/zuauth";
import { fieldsToReveal } from "../../api/pcd";
import { ZuzaluEvents } from "../../../constants/ZuzaluEvents";
import { uuidToBigInt } from "@pcd/util";
import { isRoundZuProofReused } from "../../api/voting";
import { useAlreadyContributed } from "../../projects/hooks/useRoundMaciMessages";
import { useDataLayer } from "data-layer";
import { useCartStorage } from "../../../store";

export function RoundInCart(
  props: React.ComponentProps<"div"> & {
    roundCart: CartProject[];
    selectedPayoutToken: VotingToken;
    handleRemoveProjectFromCart: (
      project: CartProject,
      walletAddress: string
    ) => void;
    payoutTokenPrice: number;
    chainId: number;
    roundId: string;
  }
) {
  const {
    chainId,
    roundId,
    selectedPayoutToken,
    roundCart,
    handleRemoveProjectFromCart,
    payoutTokenPrice,
  } = props;

  const round = useRoundById(chainId, roundId).round;

  const { address } = useAccount();
  const dataLayer = useDataLayer();

  const store = useCartStorage();

  const [pcd, setPcd] = useState<string | undefined>(undefined);
  const [pcdFetched, setPcdFetched] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hasExceededVoteLimit, setHasExceededVoteLimit] = useState(false);
  const [generateProofClicked, setGenerateProofClicked] = useState(false);
  const [donationInput, setDonationInput] = useState<string>("0");
  const [donatedAmount, setDonatedAmount] = useState<bigint>(
    BigInt(parseInt(donationInput) * 1e18)
  );

  const [voiceCreditBalance, setVoiceCreditBalance] = useState<number>(0);

  const [balanceVoiceCredits, setBalanceVoiceCredits] = useState<number>(0);

  const [usedVoiceCredits, setUsedVoiceCredits] = useState<number>(
    parseInt(
      roundCart
        .reduce(
          (acc, project) =>
            acc +
            (isNaN(Number(project.amount)) || Number(project.amount) === 0
              ? 0
              : Number(project.amount)),
          0
        )
        .toString()
    )
  );

  const [isZupasReused, setIsZupasReused] = useState(false);
  const [isAllowlisted, setIsAllowlisted] = useState(false);
  const [hasExceededContributionLimit, setHasExceededContributionLimit] =
    useState(false);
  const [isZeroDonation, setIsZeroDonation] = useState(false);
  const { isLoading, data: status } = useAlreadyContributed(
    dataLayer,
    address as string,
    chainId,
    roundId
  );

  const votingToken = selectedPayoutToken;

  const validObjEventIDs = round?.roundMetadata?.maciParameters?.validEventIDs;

  const array = validObjEventIDs
    ? validObjEventIDs.map((eventId) => BigInt(eventId.eventID))
    : [];

  const eventIDs = Array.from(new Set(array));
  const filteredEvents = ZuzaluEvents.filter((event) =>
    eventIDs.includes(uuidToBigInt(event.eventId))
  );
  const eventsList = filteredEvents.map((event) => event.eventName).join("\n");

  const maxContributionAllowlisted = round
    ? Number(
        round.roundMetadata?.maciParameters?.maxContributionAmountAllowlisted ??
          "1.0"
      ).toString()
    : "1.0";
  const maxContributionNonAllowlisted = round
    ? Number(
        round.roundMetadata?.maciParameters
          ?.maxContributionAmountNonAllowlisted ?? "0.1"
      ).toString()
    : "0.1";
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    handleValueChange(event.target.value);
  };

  useEffect(() => {
    if (pcdFetched && !isZupasReused) {
      setIsAllowlisted(true);
    } else {
      setIsAllowlisted(false);
    }
  }, [pcdFetched, isZupasReused]);

  useEffect(() => {
    if (
      isAllowlisted &&
      Number(donationInput) > Number(maxContributionAllowlisted)
    ) {
      setHasExceededContributionLimit(true);
    } else if (
      !isAllowlisted &&
      Number(donationInput) > Number(maxContributionNonAllowlisted)
    ) {
      setHasExceededContributionLimit(true);
    } else {
      setHasExceededContributionLimit(false);
    }
  }, [
    donationInput,
    isAllowlisted,
    maxContributionAllowlisted,
    maxContributionNonAllowlisted,
  ]);

  useEffect(() => {
    if (Number(donationInput) <= 0) {
      setIsZeroDonation(true);
    } else {
      setIsZeroDonation(false);
    }
  }, [donationInput]);

  const handleValueChange = (_value: string) => {
    let value = _value;

    value = value === "" ? "0.0" : value;

    if (/^\d*\.?\d*$/.test(value)) {
      setDonationInput(value);
      const amountToDonate = parseUnits(value, votingToken.decimal);
      setDonatedAmount(amountToDonate);

      const _voiceCreditBalance = parseInt(
        (Number(amountToDonate) / 1e13).toString()
      );

      setVoiceCreditBalance(_voiceCreditBalance);
      store.updateRoundContributionAmount(chainId, roundId, value);
      setBalanceVoiceCredits(_voiceCreditBalance - usedVoiceCredits);
    }
  };

  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);

  const getProof = useCallback(async () => {
    if (!address) return;
    setGenerateProofClicked(true);

    const result = await zuAuthPopup({
      fieldsToReveal,
      watermark: address,
      config: filteredEvents,
    });
    if (result.pcdStr === undefined) {
      setGenerateProofClicked(false);
      return;
    }
    const isReused = await isRoundZuProofReused(
      JSON.parse(result.pcdStr).pcd,
      chainId,
      roundId
    );
    if (result.type === "pcd") {
      setPcd(JSON.parse(result.pcdStr).pcd);
      setPcdFetched(true);
      setIsZupasReused(isReused);
    }
  }, [address, filteredEvents]);

  useEffect(() => {
    setUsedVoiceCredits(
      parseInt(
        roundCart
          .reduce(
            (acc, project) =>
              acc +
              (isNaN(Number(project.amount)) || Number(project.amount) === 0
                ? 0
                : Number(project.amount)),
            0
          )
          .toString()
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [donatedAmount, donationInput, roundCart]);

  useEffect(() => {
    const storedRoundContributionAmount = store.getContributionAmount(
      chainId,
      roundId
    );

    if (storedRoundContributionAmount) {
      handleValueChange(storedRoundContributionAmount);
    }
  }, [chainId, roundId]);

  useEffect(() => {
    setBalanceVoiceCredits(voiceCreditBalance - usedVoiceCredits);
  }, [voiceCreditBalance, usedVoiceCredits]);

  useEffect(() => {}, [generateProofClicked]);

  return (
    <div className="my-4 flex w-full">
      <div className="flex flex-col flex-grow w-[70%] bg-grey-50 rounded-xl">
        <div className="px-4 py-6 flex-grow mr-2">
          <div className="flex flex-row items-end justify-between">
            <div className="flex flex-col">
              <div>
                <p className="text-xl font-semibold inline">
                  {round?.roundMetadata?.name}
                </p>
                <p className="text-lg font-bold ml-2 inline">
                  ({roundCart.length})
                </p>
                <RoundAllowlist
                  pcdFetched={pcdFetched}
                  maxContributionAllowlisted={maxContributionAllowlisted}
                  maxContributionNonAllowlisted={maxContributionNonAllowlisted}
                  openModal={openModal}
                  isZupasReused={isZupasReused}
                />
              </div>
            </div>
          </div>
          <div className="flex flex-row items-end justify-between items-center">
            <div className="flex pt-2 items-center mb-5 mr-2">
              <label
                htmlFor="totalDonationETH"
                className="text-md font-normal inline mr-2"
              >
                Your Contribution (ETH): {"  "}
              </label>
              <input
                type="text"
                id="totalDonationETH"
                value={donationInput}
                typeof="number"
                onChange={handleInputChange}
                className="px-5 py-2 w-[7rem] bg-white border shadow-sm border-slate-300 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:ring-sky-500 block rounded-lg sm:text-sm focus:ring-1"
                placeholder="Enter amount in ETH"
              />
              <span className="text-md font-normal inline ml-2 text-gray-400">
                {" "}
                ${(Number(donationInput) * payoutTokenPrice).toFixed(2)}
              </span>
            </div>
          </div>
          <div>
            {roundCart.map((project, key) => {
              return (
                <div key={key}>
                  <ProjectInCart
                    projects={roundCart}
                    selectedPayoutToken={selectedPayoutToken}
                    removeProjectFromCart={handleRemoveProjectFromCart}
                    totalAmount={parseFloat(donationInput)}
                    project={project}
                    index={key}
                    roundRoutePath={`/round/${chainId}/${roundCart[0].roundId}`}
                    last={key === roundCart.length - 1}
                    payoutTokenPrice={payoutTokenPrice}
                    alreadyContributed={status?.hasDonated ?? false}
                    walletAddress={address as `0x${string}`}
                    isZeroDonation={isZeroDonation}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="w-[30%] ml-[4%]">
        <SummaryContainer
          alreadyContributed={status?.hasContributed ?? false}
          alreadyDonated={status?.hasDonated ?? false}
          stateIndex={status?.stateIndex ?? 0}
          payoutTokenPrice={payoutTokenPrice}
          donatedAmount={donatedAmount}
          roundId={roundId}
          chainId={chainId}
          walletAddress={address as `0x${string}`}
          pcd={pcdFetched && !isZupasReused ? pcd : undefined}
          roundName={round?.roundMetadata?.name ?? ""}
          balanceVoiceCredits={balanceVoiceCredits}
          hasExceededContributionLimit={hasExceededContributionLimit}
          isZeroDonation={isZeroDonation}
        />
      </div>

      <Modal isOpen={isModalOpen} onClose={closeModal} isCentered={true}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Join Allowlist</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <p className="text-sm text-gray-700">
              Prove that you are a ZuPass holder and that you attended one of
              <Tooltip
                label={
                  <div style={{ whiteSpace: "pre-line" }}>{eventsList}</div>
                }
                aria-label="List of events"
                placement="top"
                closeOnClick={false}
                hasArrow
              >
                <span className="underline cursor-pointer"> these</span>
              </Tooltip>{" "}
              events to join the allowlist.
            </p>

            {pcdFetched && !isZupasReused && (
              <div className="mt-4 text-green-600">
                You can now contribute up to {maxContributionAllowlisted} ETH.
              </div>
            )}
            {isZupasReused && (
              <div className="mt-4 text-red-600">
                You have already used your Zupass for this round. You cannot
                contribute twice.
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button
              onClick={async () => {
                if (!pcdFetched && !generateProofClicked) {
                  await getProof();
                } else if (pcdFetched && generateProofClicked) {
                  closeModal();
                }
              }}
              disabled={generateProofClicked}
            >
              {!pcdFetched && !generateProofClicked
                ? "Generate proof"
                : pcdFetched
                  ? "Close"
                  : "Generating proof"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

const RoundAllowlist = ({
  pcdFetched,
  maxContributionAllowlisted,
  maxContributionNonAllowlisted,
  openModal,
  isZupasReused,
}: {
  pcdFetched: boolean;
  maxContributionAllowlisted: string;
  maxContributionNonAllowlisted: string;
  openModal: () => void;
  isZupasReused: boolean;
}) => {
  return (
    <div className="flex flex-col items-center">
      <div className="flex flex-col text-gray-600">
        {!pcdFetched ? (
          <div className="mb-5">
            {Number(maxContributionNonAllowlisted) <= 0 ? (
              <>
                <p className="text-sm pt-2 italic mr-2">
                  You can only contribute by{" "}
                  <Tooltip
                    label="Click to join the allowlist"
                    aria-label="Click to join the allowlist"
                  >
                    <a
                      onClick={openModal}
                      className="text-md pt-2 font-bold mb-5 ml-1 mr-1 cursor-pointer underline"
                      style={{ color: "black", fontStyle: "normal" }}
                    >
                      joining the allowlist.
                    </a>
                  </Tooltip>{" "}
                  Verified members can contribute up to{" "}
                  {maxContributionAllowlisted} ETH (
                  {parseInt(
                    (Number(maxContributionAllowlisted) * 1e5).toString()
                  )}{" "}
                  voice credits).
                </p>
              </>
            ) : (
              <>
                <p className="text-sm pt-2 italic mr-2">
                  Your max allowed contribution amount is{" "}
                  {maxContributionNonAllowlisted} ETH which gives you{" "}
                  {parseInt(
                    (Number(maxContributionNonAllowlisted) * 1e5).toString()
                  )}{" "}
                  voice credits. To contribute up to{" "}
                  {maxContributionAllowlisted} ETH (
                  {parseInt(
                    (Number(maxContributionAllowlisted) * 1e5).toString()
                  )}{" "}
                  voice credits),{" "}
                  <Tooltip
                    label="Click to join the allowlist"
                    aria-label="Click to join the allowlist"
                  >
                    <a
                      onClick={openModal}
                      className="text-md pt-2 font-bold mb-5 mr-2 cursor-pointer underline"
                      style={{ color: "black", fontStyle: "normal" }}
                    >
                      join the allowlist.
                    </a>
                  </Tooltip>
                </p>
                <p className="text-sm italic mr-2">
                  For each vote, the number of voice credits decreases by the
                  square of the number of votes cast.
                </p>
              </>
            )}
          </div>
        ) : !isZupasReused ? (
          <div className="flex flex-col">
            <p className="text-sm pt-2 italic">
              You successfully proved your Zuzalu commitment, you can now
              contribute up to {maxContributionAllowlisted} ETH (
              {parseInt((Number(maxContributionAllowlisted) * 1e5).toString())}{" "}
              voice credits).
            </p>
            <p className="text-sm italic mb-5 mr-2">
              For each vote, the number of voice credits decreases by the square
              of the number of votes cast.
            </p>
          </div>
        ) : Number(maxContributionNonAllowlisted) <= 0 ? (
          <div className="flex flex-col">
            <p className="text-sm pt-2 italic">
              You have already used your Zupass for this round. You cannot
              contribute twice.
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            <p className="text-sm pt-2 italic">
              You have already used your Zupass for this round. You can
              contribute up to {maxContributionNonAllowlisted} ETH (
              {parseInt(
                (Number(maxContributionNonAllowlisted) * 1e5).toString()
              )}{" "}
              voice credits).
            </p>
            <p className="text-sm italic mb-5 mr-2">
              For each vote, the number of voice credits decreases by the square
              of the number of votes cast.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
