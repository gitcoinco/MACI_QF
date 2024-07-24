import { useAccount, useEnsAddress, useEnsAvatar, useEnsName } from "wagmi";
import { lazy, useCallback, useEffect, useMemo, useState } from "react";
import { getChainIds, votingTokens } from "../api/utils";
import Navbar from "../common/Navbar";
import blockies from "ethereum-blockies";
import CopyToClipboardButton from "../common/CopyToClipboardButton";
import Footer from "common/src/components/Footer";
import Breadcrumb, { BreadcrumbItem } from "../common/Breadcrumb";
import { StatCard } from "../common/StatCard";
import { DonationsTable } from "./DonationsTable";
import { isAddress } from "viem";
import { VotingToken, dateToEthereumTimestamp, useTokenPrice } from "common";
import { Contribution, useDataLayer } from "data-layer";
import {
  useDecryptMessages,
  useMACIContributions,
} from "../projects/hooks/useRoundMaciMessages";
import { useRoundsApprovedApplications } from "../projects/hooks/useRoundApplications";
import { WalletClient, getWalletClient } from "@wagmi/core";
import { signAndStoreSignatures } from "../api/keys";
import { areSignaturesPresent, getDonationHistory } from "../api/maciCartUtils";
import { Spinner } from "../common/Spinner";

const DonationHistoryBanner = lazy(
  () => import("../../assets/DonationHistoryBanner")
);
const LOCAL_STORAGE_KEY = "lastConnectedWallet";

export function ViewContributionHistoryPage() {
  const [signaturesReady, setSignaturesReady] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState<string>(
    "Fetching your contributions..."
  );
  const [contributions, setContributions] = useState<Contribution[]>([]);

  const chainIds = getChainIds();
  const { address: walletAddress, isConnected } = useAccount();

  const { data: ensResolvedAddress } = useEnsAddress({
    name: isAddress(walletAddress ?? "") ? undefined : walletAddress,
    chainId: 1,
  });

  const dataLayer = useDataLayer();

  const { data: maciContributions } = useMACIContributions(
    walletAddress?.toLowerCase() as string,
    dataLayer
  );

  const { data: applications } = useRoundsApprovedApplications(
    maciContributions?.groupedRounds ?? [],
    dataLayer
  );

  const { data: DecryptedContributions, refetch } = useDecryptMessages(
    maciContributions?.groupedMaciContributions,
    walletAddress?.toLowerCase() as string,
    signaturesReady
  );

  const getNeededPairs = useCallback(
    (
      groupedRounds:
        | {
            chainId: number;
            roundId: string;
            address: string;
          }[]
        | undefined
    ) => {
      if (!groupedRounds) return null;
      return groupedRounds.map(({ chainId, roundId }) => ({
        chainId,
        roundId,
      }));
    },
    []
  );

  const hasDonations = useMemo(() => {
    if (maciContributions && maciContributions.groupedRounds) {
      return maciContributions.groupedRounds.length > 0;
    } else {
      return false;
    }
  }, [maciContributions]);

  const getNeededSignatures = useCallback(async () => {
    const pairs = getNeededPairs(maciContributions?.groupedRounds);

    if (!pairs || pairs.length === 0) {
      setSignaturesReady(true);
      setLoadingMessage("");
      return;
    }

    setLoadingMessage("Requesting signatures...");
    const walletClient = await getWalletClient();
    await signAndStoreSignatures({
      pairs,
      walletClient: walletClient as WalletClient,
      address: walletAddress as string,
    });

    setSignaturesReady(true);
  }, [maciContributions, walletAddress, getNeededPairs]);

  const fetchDonationHistory = useCallback(async () => {
    const donations = await getDonationHistory(
      dataLayer,
      walletAddress as string,
      applications,
      maciContributions?.groupedMaciContributions,
      DecryptedContributions?.decryptedMessagesByRound
    );
    setContributions(donations);
    setInitialLoading(false);
  }, [
    dataLayer,
    applications,
    maciContributions,
    DecryptedContributions,
    walletAddress,
  ]);

  useEffect(() => {
    const lastWalletAddress = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (
      isConnected &&
      walletAddress &&
      walletAddress.toLowerCase() !== lastWalletAddress?.toLowerCase()
    ) {
      localStorage.setItem(LOCAL_STORAGE_KEY, walletAddress.toLowerCase());
      setSignaturesReady(false);
      setInitialLoading(true);
      setLoadingMessage("Fetching your contributions...");
    }

    if (maciContributions && walletAddress) {
      const signaturesExist = areSignaturesPresent(
        maciContributions.groupedMaciContributions,
        walletAddress
      );
      if (signaturesExist) {
        setSignaturesReady(true);
      } else {
        setLoadingMessage(
          "Sign the messages to view your contributions history."
        );
        getNeededSignatures();
      }
    }
  }, [isConnected, walletAddress, maciContributions, getNeededSignatures]);

  useEffect(() => {
    if (signaturesReady) {
      refetch();
    }
  }, [signaturesReady, refetch]);

  useEffect(() => {
    if (DecryptedContributions && signaturesReady) {
      setLoadingMessage("Fetching your contributions...");
      fetchDonationHistory();
    }
  }, [DecryptedContributions, signaturesReady, fetchDonationHistory]);

  return (
    <>
      <Navbar showWalletInteraction={true} />
      <ViewContributionHistoryFetcher
        address={ensResolvedAddress || walletAddress || ""}
        chainIds={chainIds}
        contributions={contributions}
        loadingMessage={loadingMessage}
        hasDonations={isConnected ? hasDonations : false}
        initialLoading={isConnected ? initialLoading : false}
      />
    </>
  );
}

function ViewContributionHistoryFetcher(props: {
  address: string;
  chainIds: number[];
  contributions: Contribution[];
  loadingMessage: string;
  hasDonations: boolean;
  initialLoading: boolean;
}) {
  const { data: ensName } = useEnsName({
    /* If props.address is an ENS name, don't pass in anything, as we already have the ens name*/
    address: isAddress(props.address) ? props.address : undefined,
    chainId: 1,
  });

  const { data: ensAvatar } = useEnsAvatar({
    name: ensName,
    chainId: 1,
  });

  const breadCrumbs = [
    {
      name: "Explorer Home",
      path: "/",
    },
    {
      name: "Donations",
      path: `/contributor`,
    },
  ] as BreadcrumbItem[];

  const addressLogo = useMemo(() => {
    return (
      ensAvatar ??
      blockies
        .create({
          seed: props.address.toLowerCase(),
        })
        .toDataURL()
    );
  }, [props.address, ensAvatar]);

  // tokens is a map of token address + chainId to token
  const tokens = Object.fromEntries(
    votingTokens.map((token) => [
      token.address.toLowerCase() + "-" + token.chainId,
      token,
    ])
  );

  return (
    <ViewContributionHistory
      tokens={tokens}
      addressLogo={addressLogo}
      contributions={{
        data: props.contributions,
        chainIds: props.chainIds,
      }}
      loadingMessage={props.loadingMessage}
      hasDonations={props.hasDonations}
      address={props.address}
      breadCrumbs={breadCrumbs}
      ensName={ensName}
      initialLoading={props.initialLoading}
    />
  );
}

export function ViewContributionHistory(props: {
  tokens: Record<string, VotingToken>;
  contributions: {
    chainIds: number[];
    data: Contribution[];
  };
  loadingMessage: string;
  hasDonations: boolean;
  address: string;
  addressLogo: string;
  ensName?: string | null;
  breadCrumbs: BreadcrumbItem[];
  initialLoading: boolean;
}) {
  const { data: price } = useTokenPrice("ETH");

  const [totalDonations, totalUniqueContributions, totalProjectsFunded] =
    useMemo(() => {
      let totalDonations = 0;
      let totalUniqueContributions = 0;
      const projects: string[] = [];

      props.contributions.data.forEach((contribution) => {
        const tokenId =
          contribution.tokenAddress.toLowerCase() + "-" + contribution.chainId;
        const token = props.tokens[tokenId];
        if (token) {
          totalDonations +=
            (Number(contribution.amount) * (price ?? 0)) / 10 ** 18;
          totalUniqueContributions += 1;
          const project = contribution.projectId;
          if (!projects.includes(project)) {
            projects.push(project);
          }
        }
      });

      return [totalDonations, totalUniqueContributions, projects.length];
    }, [props.contributions, props.tokens, price]);

  const activeRoundDonations = useMemo(() => {
    const now = Date.now();

    const filteredRoundDonations = props.contributions.data.filter(
      (contribution) => {
        const formattedRoundEndTime =
          Number(
            dateToEthereumTimestamp(
              new Date(contribution.round.donationsEndTime)
            )
          ) * 1000;
        return formattedRoundEndTime >= now;
      }
    );
    if (filteredRoundDonations.length === 0) {
      return [];
    }
    return filteredRoundDonations;
  }, [props.contributions]);

  const pastRoundDonations = useMemo(() => {
    const now = Date.now();

    const filteredRoundDonations = props.contributions.data.filter(
      (contribution) => {
        const formattedRoundEndTime =
          Number(
            dateToEthereumTimestamp(
              new Date(contribution.round.donationsEndTime)
            )
          ) * 1000;
        return formattedRoundEndTime < now;
      }
    );
    if (filteredRoundDonations.length === 0) {
      return [];
    }

    return filteredRoundDonations;
  }, [props.contributions]);

  return (
    <div className="relative top-16 lg:mx-20 xl:mx-20 px-4 py-7 h-screen">
      <div className="flex flex-col pb-4" data-testid="bread-crumbs">
        <Breadcrumb items={props.breadCrumbs} />
      </div>
      <main>
        <div className="border-b pb-2 mb-4 flex flex-row items-center justify-between">
          <div className="flex flex-row items-center">
            <img
              className="w-10 h-10 rounded-full mr-4 mt-2"
              src={props.addressLogo}
              alt="Address Logo"
            />
            <div
              className="text-lg lg:text-4xl"
              data-testid="contributor-address"
              title={props.address}
            >
              {props.ensName ||
                props.address.slice(0, 6) + "..." + props.address.slice(-6)}
            </div>
          </div>
          <div className="flex justify-between items-center"></div>
        </div>
        <div className="mt-8 mb-2 font-sans italic">
          * Please note that your recent transactions may take a short while to
          reflect in your donation history, as processing times may vary.
        </div>
        <div className="text-2xl my-6 font-sans">Donation Impact</div>
        <div className="grid grid-cols-2 grid-row-2 lg:grid-cols-3 lg:grid-row-1 gap-6">
          <div className="col-span-2 lg:col-span-1">
            <StatCard
              title="Total Donations"
              value={"$" + totalDonations.toFixed(2).toString()}
            />
          </div>
          <div className="col-span-1">
            <StatCard
              title="Contributions"
              value={totalUniqueContributions.toString()}
            />
          </div>
          <div className="col-span-1">
            <StatCard
              title="Projects Funded"
              value={totalProjectsFunded.toString()}
            />
          </div>
        </div>
        <div className="text-2xl my-6">Donation History</div>

        {props.initialLoading ||
        (props.contributions.data.length === 0 && props.hasDonations) ? (
          <div className="flex flex-col items-center justify-center mt-[4%]">
            <Spinner />
            <p>{props.loadingMessage}</p>
          </div>
        ) : (
          <div>
            <div className="text-lg bg-grey-75 text-black rounded-2xl pl-4 px-1 py-1 mb-2 font-semibold">
              Active Rounds
            </div>
            <DonationsTable
              contributions={activeRoundDonations}
              tokens={props.tokens}
              activeRound={true}
              price={price ?? 0}
            />
            <div className="text-lg bg-grey-75 text-black rounded-2xl pl-4 px-1 py-1 mb-2 font-semibold">
              Past Rounds
            </div>
            <DonationsTable
              contributions={pastRoundDonations}
              tokens={props.tokens}
              activeRound={false}
              price={price ?? 0}
            />
          </div>
        )}
      </main>
      <div className="mt-24 mb-11 h-11">
        <Footer />
      </div>
    </div>
  );
}

export function ViewContributionHistoryWithoutDonations(props: {
  address: string;
  addressLogo: string;
  ensName?: string;
  breadCrumbs: BreadcrumbItem[];
}) {
  const currentOrigin = window.location.origin;
  const { address: walletAddress } = useAccount();
  return (
    <div className="relative top-16 lg:mx-20 px-4 py-7 h-screen">
      <div className="flex flex-col pb-4" data-testid="bread-crumbs">
        <Breadcrumb items={props.breadCrumbs} />
      </div>
      <main>
        <div className="border-b pb-2 mb-4 flex items-center justify-between">
          <div className="flex items-center">
            <img
              className="w-10 h-10 rounded-full mr-4"
              src={props.addressLogo}
              alt="Address Logo"
            />
            <div
              className="text-[18px] lg:text-[32px]"
              data-testid="contributor-address"
              title={props.address}
            >
              {props.ensName ||
                props.address.slice(0, 6) + "..." + props.address.slice(-6)}
            </div>
          </div>
          <CopyToClipboardButton
            textToCopy={`${currentOrigin}/#/contributor`}
            styles="text-xs p-2"
            iconStyle="h-4 w-4 mr-1"
          />
        </div>
        <div className="text-2xl">Donation History</div>
        <div className="flex justify-center">
          <div className="w-3/4 my-6 text-center mx-auto">
            {props.address === walletAddress ? (
              <>
                <p className="text-md">
                  This is your donation history page, where you can keep track
                  of all the public goods you've funded.
                </p>
                <p className="text-md">
                  As you make donations, your transaction history will appear
                  here.
                </p>
              </>
            ) : (
              <>
                <p className="text-md">
                  This is{" "}
                  {props.ensName ||
                    props.address.slice(0, 6) + "..." + props.address.slice(-6)}
                  ’s donation history page, showcasing their contributions
                  towards public goods.
                </p>
                <p className="text-md">
                  As they make donations, their transaction history will appear
                  here.
                </p>
              </>
            )}
            <div />
          </div>
        </div>
        <div className="flex justify-center">
          {" "}
          <DonationHistoryBanner className="w-full h-auto object-cover rounded-t" />
        </div>
      </main>
      <div className="mt-24 mb-11 h-11">
        <Footer />
      </div>
    </div>
  );
}
