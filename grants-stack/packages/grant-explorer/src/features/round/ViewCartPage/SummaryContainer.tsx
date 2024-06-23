import { useCartStorage } from "../../../store";
import { useEffect, useState, useCallback } from "react";
import { Summary } from "./Summary";
import ChainConfirmationModal from "../../common/ConfirmationModal";
import { ChainConfirmationModalBody } from "./ChainConfirmationModalBody";
import { MACIContributions } from "../../api/types";
import { modalDelayMs } from "../../../constants";
import { useNavigate } from "react-router-dom";
import { useAccount, useWalletClient } from "wagmi";
import { Button } from "common/src/styles";
import { InformationCircleIcon } from "@heroicons/react/24/solid";
import { getClassForPassportColor } from "../../api/passport";
import useSWR from "swr";
import MRCProgressModal from "../../common/MRCProgressModal";
import { MRCProgressModalBody } from "./MRCProgressModalBody";
import { useCheckoutStore } from "../../../checkoutStore";
import { formatUnits, parseUnits, zeroAddress } from "viem";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { parseChainId } from "common/src/chains";
import { fetchBalance, getPublicClient } from "@wagmi/core";
import { useAllo } from "../../api/AlloWrapper";
import { useDataLayer } from "data-layer";
import { PCommand } from "maci-domainobjs";
import { NATIVE } from "common";

export function SummaryContainer(props: {
  alreadyContributed: boolean;
  maciMessages: MACIContributions | null;
  donatedAmount: bigint;
  totalAmountAfterDecryption: bigint;
  decryptedMessages: PCommand[] | null;
  payoutTokenPrice: number;
  stateIndex: bigint;
  chainId: number;
  roundId: string;
  pcd: string | undefined;
  walletAddress: string;
  roundName: string;
}) {
  const { data: walletClient } = useWalletClient();
  const { address, isConnected } = useAccount();
  const {
    userProjects,
    getVotingTokenForChain,
    removeUserProject: removeProjectFromCart,
  } = useCartStorage();
  const { checkoutMaci, changeDonations } = useCheckoutStore();
  const dataLayer = useDataLayer();
  const { openConnectModal } = useConnectModal();
  const allo = useAllo();
  const navigate = useNavigate();

  const projects = userProjects[props.walletAddress];
  const maciChainId = props.chainId;
  const maciRoundId = props.roundId;
  const votingToken = getVotingTokenForChain(parseChainId(maciChainId));

  const [totalDonations, setTotalDonations] = useState<bigint>(0n);
  const [tokenBalance, setTokenBalance] = useState<bigint>(0n);
  const [openChainConfirmationModal, setOpenChainConfirmationModal] =
    useState(false);
  const [openMRCProgressModal, setOpenMRCProgressModal] = useState(false);

  const filteredProjects = projects.filter(
    (project) =>
      project.chainId === parseChainId(maciChainId) &&
      project.roundId === maciRoundId
  );

  const fetchBalanceForChain = useCallback(async () => {
    const { value } = await fetchBalance({
      address: address ?? zeroAddress,
      token:
        votingToken.address === zeroAddress || votingToken.address === NATIVE
          ? undefined
          : votingToken.address,
      chainId: parseChainId(maciChainId),
    });
    setTokenBalance(value);
  }, [address, maciChainId, votingToken.address]);

  useEffect(() => {
    fetchBalanceForChain();
  }, [fetchBalanceForChain]);

  const { data: round } = useSWR([maciRoundId, maciChainId], async () => {
    const result = await dataLayer.getRoundForExplorer({
      roundId: maciRoundId,
      chainId: Number(maciChainId),
    });
    return result ? result.round : null;
  });

  useEffect(() => {
    if (!round) return;
    if (round.roundEndTime.getTime() < Date.now()) {
      filteredProjects.forEach((project) => {
        removeProjectFromCart(project, props.walletAddress);
      });
    }
  }, [filteredProjects, removeProjectFromCart, round, props.walletAddress]);

  useEffect(() => {
    let newTotalDonations: bigint;
    if (filteredProjects.length > 0) {
      try {
        newTotalDonations = filteredProjects.reduce(
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
        setTotalDonations(newTotalDonations);
      } catch (e) {
        console.error(e);
        return;
      }
    } else if (props.alreadyContributed) {
      setTotalDonations(props.donatedAmount);
    }
  }, [
    projects,
    votingToken,
    props,
  ]);

  const handleSubmitDonation = async () => {
    if (!walletClient || !allo) return;
    setTimeout(() => {
      setOpenMRCProgressModal(true);
      setOpenChainConfirmationModal(false);
    }, modalDelayMs);
    if (props.alreadyContributed) {
      const voiceCreditsBalance = BigInt(
        props.maciMessages?.encrypted.voiceCreditBalance ?? 0n
      );
      const isSuccess = await changeDonations(
        parseChainId(maciChainId),
        maciRoundId,
        voiceCreditsBalance,
        walletClient,
        props.decryptedMessages ?? [],
        props.stateIndex,
        dataLayer,
        address as string
      );
      if (isSuccess) {
        setOpenMRCProgressModal(false);
      }
    } else {
      const isSuccess = await checkoutMaci(
        parseChainId(maciChainId),
        maciRoundId,
        walletClient,
        getPublicClient({
          chainId: Number(maciChainId),
        }),
        dataLayer,
        address as string,
        props.pcd
      );
      if (isSuccess) {
        setOpenMRCProgressModal(false);
        navigate("/thankyou");
      }
    }
  };

  const handleConfirmation = async () => {
    if (
      filteredProjects.some(
        (project) =>
          !project.amount ||
          (Number(project.amount) === 0 && !props.alreadyContributed)
      ) ||
      (props.donatedAmount > totalDonations &&
        props.totalAmountAfterDecryption > totalDonations) ||
      (props.donatedAmount < totalDonations &&
        props.totalAmountAfterDecryption < totalDonations)
    ) {
      return;
    }
    setOpenChainConfirmationModal(true);
  };

  const PayoutModals = () => (
    <>
      <ChainConfirmationModal
        title={"Checkout"}
        confirmButtonText={
          props.alreadyContributed ? "Change Donations" : "Checkout"
        }
        confirmButtonAction={handleSubmitDonation}
        body={
          <div>
            <ChainConfirmationModalBody
              projectsByChain={{ [maciChainId]: filteredProjects }}
              totalDonationsPerChain={{ [maciChainId]: totalDonations }}
              chainIdsBeingCheckedOut={[parseChainId(maciChainId)]}
              setChainIdsBeingCheckedOut={() => {}}
            />
          </div>
        }
        isOpen={openChainConfirmationModal}
        setIsOpen={setOpenChainConfirmationModal}
        disabled={totalDonations > tokenBalance && !props.alreadyContributed}
      />
      <MRCProgressModal
        isOpen={openMRCProgressModal}
        subheading={
          !props.alreadyContributed
            ? "Please hold while we submit your donation."
            : "Please hold while we change your donations. Keep in mind that each time you change your donations, gas fees grow exponentially."
        }
        body={
          <div className="flex flex-col items-center">
            <MRCProgressModalBody
              chainIdsBeingCheckedOut={[parseChainId(maciChainId)]}
              tryAgainFn={handleSubmitDonation}
              setIsOpen={setOpenMRCProgressModal}
            />
          </div>
        }
      />
    </>
  );

  if (filteredProjects.length === 0) {
    return null;
  }

  return (
    <div className="block font-semibold sticky top-20">
      <div className="px-4 pt-6 pb-4 rounded-t-3xl bg-grey-50 border border-grey-50">
        <h2 className="text-2xl border-b-2 pb-2 font-bold">Summary</h2>
        <div
          className={`flex flex-row items-center justify-between mt-2 font-semibold italic ${getClassForPassportColor("black")}`}
        ></div>
        <div>
          <Summary
            chainId={parseChainId(maciChainId)}
            selectedPayoutToken={votingToken}
            totalDonation={totalDonations}
            alreadyContributed={props.alreadyContributed}
            roundName={props.roundName}
          />
          {totalDonations > 0 && (
            <div className="flex flex-row justify-between mt-4 border-t-2">
              <div className="flex flex-col mt-4">
                <p className="mb-2">Your total contribution</p>
              </div>
              <div className="flex justify-end mt-4">
                <p>
                  ${" "}
                  {(
                    Number(
                      formatUnits(props.donatedAmount, votingToken.decimal)
                    ) * props.payoutTokenPrice
                  ).toFixed(2)}
                </p>
              </div>
            </div>
          )}
          {filteredProjects.some(
            (project) => !project.amount || Number(project.amount) === 0
          ) &&
            !props.alreadyContributed && (
              <p className="rounded-md bg-red-50 py-2 text-pink-500 flex justify-center my-4 text-sm">
                <InformationCircleIcon className="w-4 h-4 mr-1 mt-0.5" />
                <span>You must enter donations for all the projects</span>
              </p>
            )}
        </div>
      </div>

      <Button
        data-testid="handle-confirmation"
        type="button"
        disabled={totalDonations > tokenBalance && !props.alreadyContributed}
        onClick={() => {
          if (!isConnected) {
            openConnectModal?.();
            return;
          }
          handleConfirmation();
        }}
        className={`items-center text-sm rounded-b-3xl w-full bg-blue-100 text-black py-5 text-normal font-mono ${
          totalDonations > tokenBalance && "border-t"
        }`}
      >
        {isConnected
          ? totalDonations > tokenBalance && !props.alreadyContributed
            ? "Not enough funds to donate"
            : props.donatedAmount < totalDonations
              ? "Exceeds donation limit"
              : props.donatedAmount > totalDonations 
                ? "Make use 100% of your donation amount"
                : props.alreadyContributed
                  ? "Change donations"
                  : "Submit your donation!"
          : "Connect wallet to continue"}
      </Button>
      <PayoutModals />
    </div>
  );
}
