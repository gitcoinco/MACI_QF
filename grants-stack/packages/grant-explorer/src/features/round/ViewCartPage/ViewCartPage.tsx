import React, { useEffect, useState, useCallback, useMemo } from "react";
import { ChainId } from "common";
import { groupProjectsInCart } from "../../api/utils";
import Footer from "common/src/components/Footer";
import Navbar from "../../common/Navbar";
import Breadcrumb, { BreadcrumbItem } from "../../common/Breadcrumb";
import { EmptyCart } from "./EmptyCart";
import { Header } from "./Header";
import { useCartStorage } from "../../../store";
import { CartWithProjects } from "./CartWithProjects";
import { useDataLayer } from "data-layer";
import { useRoundsApprovedApplications } from "../../projects/hooks/useRoundApplications";
import {
  useMACIContributions,
  useDecryptMessages,
} from "../../projects/hooks/useRoundMaciMessages";
import { useAccount } from "wagmi";
import { Spinner } from "@chakra-ui/react";
import { setContributed, areSignaturesPresent } from "../../api/maciCartUtils";
import {
  MACIContributionsByRoundId,
  MACIDecryptedContributionsByRoundId,
  GroupedCredits,
} from "../../api/types";
import { signAndStoreSignatures } from "../../api/keys";
import { WalletClient, getWalletClient } from "@wagmi/core";

const LOCAL_STORAGE_KEY = "lastConnectedWallet";

export default function ViewCart() {
  const [signaturesReady, setSignaturesReady] = useState(false);
  const [signaturesRequested, setSignaturesRequested] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [groupedCredits, setGroupedCredits] = useState<GroupedCredits>({});
  const [loadingMessage, setLoadingMessage] = useState<string>(
    "Checking needed signatures..."
  );
  const { userProjects, setUserCart, removeUserProject } = useCartStorage();
  const { address: walletAddress, isConnected } = useAccount();

  const projects = useMemo(
    () => (walletAddress ? userProjects[walletAddress] ?? [] : []),
    [userProjects, walletAddress]
  );

  const dataLayer = useDataLayer();

  const { data: maciContributions } = useMACIContributions(
    walletAddress?.toLowerCase() as string,
    dataLayer
  );

  const maciContributionsByChainId = Object.keys(
    maciContributions?.groupedMaciContributions ?? {}
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

  const groupedCartProjects = groupProjectsInCart(projects);
  const groupedProjectsByChainId = Object.keys(groupedCartProjects);
  const combinedGroupedCartByChainId = Array.from(
    new Set([...groupedProjectsByChainId, ...maciContributionsByChainId])
  );

  async function getNeededPairs(
    groupedRounds:
      | {
          chainId: number;
          roundId: string;
          address: string;
        }[]
      | undefined
  ) {
    if (!groupedRounds) return;
    const pairs: { chainId: number; roundId: string }[] = [];
    for (const { chainId, roundId } of groupedRounds ?? []) {
      const round = (
        await dataLayer.getRoundForExplorer({
          roundId: roundId,
          chainId,
        })
      )?.round;
      const currentTime = new Date();

      const isActiveRound = round && round?.roundEndTime > currentTime;
      if (!isActiveRound) {
        for (const project of projects) {
          if (project.chainId === chainId && project.roundId === roundId) {
            removeUserProject(project, walletAddress as string);
          }
        }
        continue;
      }
      pairs.push({ chainId, roundId });
    }
    return pairs.length ? pairs : null;
  }

  const getNeededSignatures = useCallback(async () => {
    if (signaturesRequested) return;
    setSignaturesRequested(true);
    const pairs = await getNeededPairs(maciContributions?.groupedRounds);

    if (!pairs || pairs.length === 0) {
      setSignaturesReady(true);
      setInitialLoading(false);
      setLoadingMessage("");
      return;
    }

    setLoadingMessage("Requesting signatures...");
    const walletClient = await getWalletClient();
    if (pairs) {
      await signAndStoreSignatures({
        pairs,
        walletClient: walletClient as WalletClient,
        address: walletAddress as string,
      });
    }
    setTimeout(() => {
      setSignaturesReady(true);
      setLoadingMessage("Decrypting...");
    }, 2000); // 2-second delay
  }, [maciContributions, walletAddress, signaturesRequested]);

  const getCartProjects = useCallback(async () => {
    await setContributed(
      projects,
      walletAddress as string,
      dataLayer,
      setUserCart,
      applications,
      maciContributions?.groupedMaciContributions,
      DecryptedContributions?.decryptedMessagesByRound
    );
    const credits = await dataLayer.getVoiceCreditsByChainIdAndRoundId({
      contributorAddress: walletAddress?.toLowerCase() as string,
    });
    setGroupedCredits(credits);
    setInitialLoading(false);
  }, [
    dataLayer,
    applications,
    maciContributions,
    DecryptedContributions,
    walletAddress,
    setUserCart,
  ]);

  useEffect(() => {
    const lastWalletAddress = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (
      isConnected &&
      walletAddress &&
      walletAddress.toLowerCase() !== lastWalletAddress?.toLowerCase()
    ) {
      localStorage.setItem(LOCAL_STORAGE_KEY, walletAddress.toLowerCase());
      setSignaturesRequested(false);
      setSignaturesReady(false);
      setInitialLoading(true);
      setLoadingMessage("Checking needed signatures...");
    }

    if (maciContributions && walletAddress) {
      const signaturesExist = areSignaturesPresent(
        maciContributions.groupedMaciContributions,
        walletAddress
      );
      if (signaturesExist) {
        setSignaturesReady(true);
        setInitialLoading(false);
        setLoadingMessage("");
      } else {
        getNeededSignatures();
      }
    }
  }, [maciContributions, walletAddress, getNeededSignatures]);

  useEffect(() => {
    if (signaturesReady) {
      refetch();
    }
  }, [signaturesReady, refetch]);

  useEffect(() => {
    if (DecryptedContributions && signaturesReady) {
      getCartProjects();
    }
  }, [DecryptedContributions, signaturesReady, getCartProjects]);

  const breadCrumbs: BreadcrumbItem[] = [
    {
      name: "Explorer Home",
      path: "/",
    },
    {
      name: "Cart",
      path: `/cart`,
    },
  ];

  return (
    <>
      <Navbar />
      <div className="relative top-28 lg:mx-20 h-screen sm:px-4 px-2 py-7 lg:pt-0 font-sans">
        <div className="flex flex-col pb-4" data-testid="bread-crumbs">
          <Breadcrumb items={breadCrumbs} />
        </div>
        <main>
          <Header />
          {initialLoading && walletAddress ? (
            <div className="flex flex-col justify-center items-center my-10">
              <Spinner size="xl" />
              {loadingMessage && (
                <p className="mt-4 text-lg">{loadingMessage}</p>
              )}
            </div>
          ) : (
            <div className="flex flex-col md:flex-row gap-5">
              {!maciContributionsByChainId ||
              !walletAddress ||
              (maciContributionsByChainId &&
                maciContributionsByChainId.length === 0 &&
                projects.length === 0) ? (
                <EmptyCart />
              ) : (
                <div className={"grid sm:grid-cols-2 gap-5 w-full mx-5"}>
                  <div className="flex flex-col gap-5 sm:col-span-2 order-2 sm:order-1">
                    {combinedGroupedCartByChainId &&
                      projects.length > 0 &&
                      combinedGroupedCartByChainId.map((chainId) => (
                        <div key={Number(chainId)}>
                          <CartWithProjects
                            cart={groupedCartProjects[Number(chainId)]}
                            maciContributions={
                              (maciContributions?.groupedMaciContributions[
                                Number(chainId)
                              ] as MACIContributionsByRoundId) ?? null
                            }
                            decryptedContributions={
                              (DecryptedContributions
                                ?.decryptedMessagesByRound?.[
                                Number(chainId)
                              ] as MACIDecryptedContributionsByRoundId) ?? null
                            }
                            groupedCredits={
                              groupedCredits?.[Number(chainId)] ?? {}
                            }
                            needsSignature={
                              DecryptedContributions?.needSignature?.[
                                Number(chainId)
                              ] ?? null
                            }
                            handleDecrypt={getCartProjects}
                            chainId={Number(chainId) as ChainId}
                          />
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
        <div className="my-11">
          <Footer />
        </div>
      </div>
    </>
  );
}
