import { useCartStorage } from "../../../store";
import { useEffect, useState, useCallback } from "react";
import { Summary } from "./Summary";
import ChainConfirmationModal from "../../common/ConfirmationModal";
import { ChainConfirmationModalBody } from "./ChainConfirmationModalBody";
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
import { formatEther, formatUnits, parseUnits, zeroAddress } from "viem";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { parseChainId } from "common/src/chains";
import { fetchBalance } from "@wagmi/core";
import { useAllo } from "../../api/AlloWrapper";
import { useDataLayer } from "data-layer";
import { NATIVE } from "common";

export function SummaryContainer(props: {
  alreadyContributed: boolean;
  donatedAmount: bigint;
  payoutTokenPrice: number;
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
  const { checkoutMaci } = useCheckoutStore();
  const dataLayer = useDataLayer();
  const { openConnectModal } = useConnectModal();
  const allo = useAllo();
  const navigate = useNavigate();

  const {
    alreadyContributed,
    donatedAmount,
    payoutTokenPrice,
    chainId,
    roundId,
    pcd,
    walletAddress,
    roundName,
  } = props;

  const votingToken = getVotingTokenForChain(parseChainId(chainId));
  const projects = userProjects[walletAddress];
  const [totalDonations, setTotalDonations] = useState<bigint>(0n);
  const [tokenBalance, setTokenBalance] = useState<bigint>(0n);
  const [openChainConfirmationModal, setOpenChainConfirmationModal] =
    useState(false);
  const [openMRCProgressModal, setOpenMRCProgressModal] = useState(false);

  const filteredProjects = projects.filter(
    (project) =>
      project.chainId === parseChainId(chainId) && project.roundId === roundId
  );

  const fetchBalanceForChain = useCallback(async () => {
    const { value } = await fetchBalance({
      address: address ?? zeroAddress,
      token:
        votingToken.address === zeroAddress || votingToken.address === NATIVE
          ? undefined
          : votingToken.address,
      chainId: parseChainId(chainId),
    });
    setTokenBalance(value);
  }, [address, chainId, votingToken.address]);

  useEffect(() => {
    fetchBalanceForChain();
  }, [fetchBalanceForChain]);

  const { data: round } = useSWR([roundId, chainId], async () => {
    const result = await dataLayer.getRoundForExplorer({
      roundId: roundId,
      chainId: Number(chainId),
    });
    return result ? result.round : null;
  });

  useEffect(() => {
    if (!round) return;
    if (round.roundEndTime.getTime() < Date.now()) {
      filteredProjects.forEach((project) => {
        removeProjectFromCart(project, walletAddress);
      });
    }
  }, [filteredProjects, removeProjectFromCart, round, walletAddress]);

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
                  : (
                      Number(project.amount === "" ? "0" : project.amount) / 1e5
                    ).toString(),
              votingToken.decimal
            ),
          0n
        );
        setTotalDonations(newTotalDonations);
      } catch (e) {
        console.error(e);
        return;
      }
    } else if (alreadyContributed) {
      setTotalDonations(donatedAmount);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, votingToken, props]);

  const handleSubmitDonation = async () => {
    if (!walletClient || !allo) return;
    setTimeout(() => {
      setOpenMRCProgressModal(true);
      setOpenChainConfirmationModal(false);
    }, modalDelayMs);
    if (alreadyContributed) {
      return;
    } else {
      const isSuccess = await checkoutMaci(
        parseChainId(chainId),
        roundId,
        walletClient,
        dataLayer,
        address as string,
        pcd
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
          (Number(project.amount) === 0 && !alreadyContributed)
      ) ||
      donatedAmount < totalDonations
    ) {
      return;
    }
    setOpenChainConfirmationModal(true);
  };

  const PayoutModals = () => (
    <>
      <ChainConfirmationModal
        title={"Checkout"}
        confirmButtonText={"Checkout"}
        confirmButtonAction={handleSubmitDonation}
        body={
          <div>
            <ChainConfirmationModalBody
              projectsByChain={{ [chainId]: filteredProjects }}
              totalDonationsPerChain={{ [chainId]: totalDonations }}
              totalContributed={donatedAmount}
              chainIdsBeingCheckedOut={[parseChainId(chainId)]}
              setChainIdsBeingCheckedOut={() => {}}
              alreadyContributed={alreadyContributed}
            />
          </div>
        }
        isOpen={openChainConfirmationModal}
        setIsOpen={setOpenChainConfirmationModal}
        disabled={totalDonations > tokenBalance && !alreadyContributed}
      />
      <MRCProgressModal
        isOpen={openMRCProgressModal}
        subheading={"Please hold while we submit your donation."}
        body={
          <div className="flex flex-col items-center">
            <MRCProgressModalBody
              chainIdsBeingCheckedOut={[parseChainId(chainId)]}
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
            chainId={parseChainId(chainId)}
            selectedPayoutToken={votingToken}
            totalDonation={totalDonations}
            alreadyContributed={alreadyContributed}
            roundName={roundName}
          />
          {totalDonations > 0 && (
            <div className="flex flex-row justify-between mt-4 border-t-2">
              <div className="flex flex-col mt-4">
                <p className="mb-2">Your total contribution</p>
              </div>
              <div className="flex justify-end mt-4">
                <div className="flex flex-col">
                  <p className="text-right">
                    <span data-testid={"totalDonation"} className="mr-2">
                      {Number(formatEther(donatedAmount)).toFixed(5)}
                    </span>
                    <span data-testid={"summaryPayoutToken"}>
                      {votingToken.name}
                    </span>
                  </p>
                  {payoutTokenPrice && (
                    <div className="flex justify-end mt-2">
                      <p className="text-[14px] text-[#979998] font-bold">
                        ${" "}
                        {(
                          Number(
                            formatUnits(totalDonations, votingToken.decimal)
                          ) * payoutTokenPrice
                        ).toFixed(2)}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {filteredProjects.some(
            (project) => !project.amount || Number(project.amount) === 0
          ) &&
            !alreadyContributed && (
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
        disabled={totalDonations > tokenBalance && !alreadyContributed}
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
          ? totalDonations > tokenBalance && !alreadyContributed
            ? "Not enough funds to donate"
            : donatedAmount < totalDonations
              ? "Exceeds donation amount"
              : "Submit your donation!"
          : "Connect wallet to continue"}
      </Button>
      <PayoutModals />
    </div>
  );
}
