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
import { Switch } from "@headlessui/react";
import { zuAuthPopup } from "@pcd/zuauth";
import { fieldsToReveal } from "../../api/pcd";
import { ZuzaluEvents } from "../../../constants/ZuzaluEvents";
import { uuidToBigInt } from "@pcd/util";
import { isRoundZuProofReused } from "../../api/voting";
import { useAlreadyContributed } from "../../projects/hooks/useRoundMaciMessages";
import { useDataLayer } from "data-layer";

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

  const [pcd, setPcd] = useState<string | undefined>(undefined);
  const [pcdFetched, setPcdFetched] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [donationInput, setDonationInput] = useState<string>(
    (
      roundCart.reduce(
        (acc, project) =>
          acc + (isNaN(Number(project.amount)) ? 0 : Number(project.amount)),
        0
      ) / 1e5
    ).toString()
  );
  const [donatedAmount, setDonatedAmount] = useState<bigint>(
    BigInt(parseInt(donationInput) * 1e18)
  );

  const [voiceCreditBalance, setVoiceCreditBalance] = useState<number>(
    Number(donatedAmount) / 1e13
  );

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

  const currentTime = new Date();
  const isActiveRound = round && round.roundEndTime > currentTime;

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
    let value = event.target.value;
    value =
      pcdFetched === true && Number(value) >= Number(maxContributionAllowlisted)
        ? maxContributionAllowlisted
        : pcdFetched === true
          ? value
          : Number(value) >= Number(maxContributionNonAllowlisted)
            ? maxContributionNonAllowlisted
            : value;
    value = value === "" ? "0.0" : value;

    if (/^\d*\.?\d*$/.test(value)) {
      setDonationInput(value);
      const amountToDonate = parseUnits(value, votingToken.decimal);
      setDonatedAmount(amountToDonate);
      setVoiceCreditBalance(
        parseInt((Number(amountToDonate) / 1e13).toString())
      );
    }
  };

  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);

  const getProof = useCallback(async () => {
    if (!address) return;
    const result = await zuAuthPopup({
      fieldsToReveal,
      watermark: address,
      config: filteredEvents,
    });
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

  return (
    <div className="my-4 flex w-full">
      <div className="flex flex-col flex-grow w-3/4">
        <div className="bg-grey-50 px-4 py-6 rounded-xl mb-4 flex-grow mr-2">
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
                className="px-5 py-2 w-20 bg-white border shadow-sm border-slate-300 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:ring-sky-500 block rounded-lg sm:text-sm focus:ring-1"
                placeholder="Enter amount in ETH"
              />
            </div>
            <div className="bg-blue-500 p-2 text-white rounded-lg">
              Your voice credits: {voiceCreditBalance - usedVoiceCredits} /{" "}
              {voiceCreditBalance}
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
                  />
                </div>
              );
            })}
            <div className="p-4 bg-grey-100 rounded-b-xl font-medium text-lg">
              <div className="flex justify-end">
                <div className="flex flex-row">
                  <p className="mb-2 mr-2">Total voice credits allocated:</p>
                  <p className="mb-2">{usedVoiceCredits.toString()}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="w-1/4 ml-[4%]">
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
            {!pcdFetched && (
              <Switch.Group
                as="div"
                className="flex items-center justify-between mt-4"
              >
                <span className="flex flex-grow flex-col">
                  <Switch.Label
                    as="span"
                    className="text-sm font-medium leading-6 text-gray-900"
                    passive
                  >
                    Join Allowlist
                  </Switch.Label>
                  <Switch.Description
                    as="span"
                    className="text-sm text-gray-500"
                  >
                    Toggle to generate proof and join the allowlist.
                  </Switch.Description>
                </span>
                <Switch
                  checked={enabled}
                  onChange={setEnabled}
                  className={classNames(
                    enabled ? "bg-indigo-600" : "bg-gray-200",
                    "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2"
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={classNames(
                      enabled ? "translate-x-5" : "translate-x-0",
                      "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
                    )}
                  />
                </Switch>
              </Switch.Group>
            )}

            {pcdFetched && !isZupasReused && (
              <div className="mt-4 text-green-600">
                You can now contribute up to {maxContributionAllowlisted} ETH.
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button onClick={enabled && !pcdFetched ? getProof : closeModal}>
              {enabled && !pcdFetched ? "Generate proof" : "Close"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
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
      <div className="flex flex-col">
        {!pcdFetched ? (
          <div className="mb-5">
            <p className="text-sm pt-2 italic  mr-2">
              Your max allowed contribution amount is{" "}
              {maxContributionNonAllowlisted} ETH (
              {parseInt(
                (Number(maxContributionNonAllowlisted) * 1e5).toString()
              )}{" "}
              voice credits). To contriute upto {maxContributionAllowlisted} ETH
              ({parseInt((Number(maxContributionAllowlisted) * 1e5).toString())}{" "}
              voice credits),{" "}
              <Tooltip
                label="Click to join the allowlist"
                aria-label="Click to join the allowlist"
              >
                <a
                  onClick={openModal}
                  className="text-md pt-2 font-bold mb-5 mr-2 cursor-pointer"
                  style={{ color: "black", fontStyle: "normal" }}
                >
                  join the allowlist.
                </a>
              </Tooltip>
            </p>
            <p className="text-sm italic mr-2">
              For each vote, the number of voice credits decreases by the square
              of the number of votes cast.
            </p>
          </div>
        ) : !isZupasReused ? (
          <div className="flex flex-col">
            <p className="text-sm pt-2 italic ">
              You successfuly proved your Zuzalu commitment you can
            </p>
            <p className="text-sm italic mb-5 mr-2">
              now contribute up to {maxContributionAllowlisted} ETH.
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            <p className="text-sm pt-2 italic ">
              You have already used your Zupass for this round. You can
            </p>
            <p className="text-sm italic mb-5 mr-2">
              contribute up to {maxContributionNonAllowlisted} ETH.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
