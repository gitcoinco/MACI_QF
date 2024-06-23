import React, { useCallback, useEffect, useState } from "react";
import { CartProject, MACIContributions } from "../../api/types";
import { useRoundById } from "../../../context/RoundContext";
import { ProjectInCart } from "./ProjectInCart";
import { formatUnits, parseUnits } from "viem";
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
import { PCommand } from "maci-domainobjs";
import { SummaryContainer } from "./SummaryContainer";
import { Switch } from "@headlessui/react";
import { zuAuthPopup } from "@pcd/zuauth";
import { fieldsToReveal } from "../../api/pcd";
import { ZuzaluEvents } from "../../../constants/ZuzaluEvents";
import { uuidToBigInt } from "@pcd/util";

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
  const {
    chainId,
    roundId,
    voiceCredits,
    selectedPayoutToken,
    roundCart,
    decryptedContributions,
    handleRemoveProjectFromCart,
    maciContributions,
    payoutTokenPrice,
  } = props;

  const round = useRoundById(chainId, roundId).round;
  const { address } = useAccount();

  const [totalAmountAfterDecryption, setTotalAmountAfterDecryption] =
    useState(0n);
  const [donationInput, setDonationInput] = useState("0");
  const [pcd, setPcd] = useState<string | undefined>(undefined);
  const [pcdFetched, setPcdFetched] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const alreadyContributed = Boolean(voiceCredits);
  const votingToken = selectedPayoutToken;

  const filteredProjects = roundCart.filter(
    (project) => project.chainId === chainId && project.roundId === roundId
  );

  const validObjEventIDs = round?.roundMetadata?.maciParameters?.validEventIDs;
  const array = validObjEventIDs
    ? validObjEventIDs.map((eventId) => BigInt(eventId.eventID))
    : [];

  const eventIDs = Array.from(new Set(array));
  const filteredEvents = ZuzaluEvents.filter((event) =>
    eventIDs.includes(uuidToBigInt(event.eventId))
  );
  const eventsList = filteredEvents.map((event) => event.eventName).join("\n");

  const [donatedAmount, setDonatedAmount] = useState<bigint>(0n);

  const currentTime = new Date();
  const isActiveRound = round && round.roundEndTime > currentTime;

  useEffect(() => {
    if (decryptedContributions) {
      const totalAmount = decryptedContributions.reduce(
        (acc, contribution) => acc + contribution.newVoteWeight,
        0n
      );
      setTotalAmountAfterDecryption(totalAmount * 10n ** 13n);
    }
  }, [decryptedContributions]);

  const maxContributionAllowlisted = round
    ? BigInt(
        round.roundMetadata?.maciParameters?.maxContributionAmountAllowlisted ??
          2n
      ).toString()
    : "1.0";
  const maxContributionNonAllowlisted = round
    ? BigInt(
        round.roundMetadata?.maciParameters
          ?.maxContributionAmountNonAllowlisted ?? 1n
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
      setDonatedAmount(BigInt(Number(value) * 10 ** 18));
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
    if (result.type === "pcd") {
      setPcd(JSON.parse(result.pcdStr).pcd);
      setPcdFetched(true);
    }
  }, [address, filteredEvents]);

  useEffect(() => {
    if (alreadyContributed && voiceCredits) {
      console.log("voiceCredits", voiceCredits);
      const donatedAmount = voiceCredits
        ? BigInt(voiceCredits) * 10n ** 13n
        : filteredProjects.reduce(
            (acc, project) =>
              acc +
              parseUnits(
                project.amount === ""
                  ? "0"
                  : isNaN(Number(project.amount))
                    ? "0"
                    : project.amount,
                votingToken.decimal
              ),
            0n
          );

      setDonatedAmount(donatedAmount);
      setDonationInput(formatUnits(donatedAmount, 18));
    }
  }, [alreadyContributed, voiceCredits, donatedAmount, donationInput]);

  if (!isActiveRound) {
    return null;
  }

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
              </div>
              {!alreadyContributed && (
                <div className="flex flex-row items-center">
                  <div className="flex flex-col">
                    {!pcdFetched ? (
                      <p className="text-sm pt-2 italic mb-5 mr-2">
                        Your max allowed contribution amount is{" "}
                        {maxContributionNonAllowlisted} ETH.{" "}
                        <Tooltip
                          label="Click to join the allowlist"
                          aria-label="Click to join the allowlist"
                        >
                          <a
                            onClick={openModal}
                            className="text-md pt-2 font-bold mb-5 mr-2 cursor-pointer"
                            style={{ color: "black", fontStyle: "normal" }}
                          >
                            Join the allowlist
                          </a>
                        </Tooltip>
                        to increase your limit to {maxContributionAllowlisted}{" "}
                        ETH.
                      </p>
                    ) : (
                      <p className="text-sm pt-2 italic mb-5 mr-2">
                        You successfuly proved your Zuzalu commitment you can
                        now contribute up to {maxContributionAllowlisted} ETH.
                      </p>
                    )}
                  </div>
                </div>
              )}
              {alreadyContributed && (
                <p className="text-sm pt-2 italic mb-5">
                  You have contributed {formatUnits(donatedAmount, 18)} ETH. You
                  can now change the distributions of this amount until the
                  round ends.
                </p>
              )}
            </div>
            {!alreadyContributed && !decryptedContributions && (
              <div className="flex items-center pt-2  mb-5 mr-2">
                <label
                  htmlFor="totalDonationETH"
                  className="text-lg font-semibold inline mr-2"
                >
                  Total Donation:{"  "}
                </label>
                <input
                  type="text"
                  id="totalDonationETH"
                  value={donationInput}
                  typeof="number"
                  onChange={handleInputChange}
                  className="px-3 py-2 w-20 bg-white border shadow-sm border-slate-300 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:ring-sky-500 block rounded-md sm:text-sm focus:ring-1"
                  placeholder="Enter amount in ETH"
                />
              </div>
            )}
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
                    alreadyContributed={alreadyContributed}
                    walletAddress={address as `0x${string}`}
                  />
                </div>
              );
            })}
          </div>
        </div>
        {/* <div className="p-4 bg-grey-100 rounded-b-xl font-medium text-lg">
          <div className="flex flex-row justify-between items-center">
            <div className="flex flex-row gap-3 justify-center pt-1 pr-2">
              <div className="font-semibold">
                <p>
                  <span className="mr-2">Total donation</span>$
                  {donationValue.toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        </div> */}
      </div>
      <div className="w-1/4 ml-[4%]">
        <SummaryContainer
          alreadyContributed={
            (maciContributions?.encrypted ? true : (false as boolean)) || false
          }
          payoutTokenPrice={payoutTokenPrice}
          decryptedMessages={decryptedContributions}
          stateIndex={BigInt(maciContributions?.encrypted?.stateIndex ?? "0")}
          donatedAmount={donatedAmount}
          totalAmountAfterDecryption={totalAmountAfterDecryption}
          maciMessages={maciContributions ?? null}
          roundId={roundId}
          chainId={chainId}
          walletAddress={address as `0x${string}`}
          pcd={pcdFetched ? pcd : undefined}
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
                <span className="underline cursor-pointer"> those</span>
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

            {pcdFetched && (
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
