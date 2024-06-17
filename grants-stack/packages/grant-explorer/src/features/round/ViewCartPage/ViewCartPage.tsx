import React, { useEffect, useState, useCallback } from "react";
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
import { Spinner } from "@chakra-ui/react"; // Added Spinner for loading indicator
import { setContributed, areSignaturesPresent } from "../../api/maciCartUtils";
import {
  MACIContributionsByRoundId,
  MACIDecryptedContributionsByRoundId,
  GroupedCredits,
} from "../../api/types";
import { signAndStoreSignatures } from "../../api/keys";
import { WalletClient, getWalletClient } from "@wagmi/core";

export default function ViewCart() {
  const [signaturesReady, setSignaturesReady] = useState(false);
  const [signaturesRequested, setSignaturesRequested] = useState(false); // To prevent multiple signature requests
  const [initialLoading, setInitialLoading] = useState(true); // Added initial loading state
  const [groupedCredits, setGroupedCredits] = useState<GroupedCredits>({}); // Added groupedCredits state

  console.log("groupedCredits", groupedCredits);

  const { projects, setCart } = useCartStorage();
  const { address: walletAddress } = useAccount();

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
    signaturesReady // Add signaturesReady as a dependency to refetch
  );

  const groupedCartProjects = groupProjectsInCart(projects);
  const groupedProjectsByChainId = Object.keys(groupedCartProjects);
  const combinedGroupedCartByChainId = Array.from(
    new Set([...groupedProjectsByChainId, ...maciContributionsByChainId])
  );

  const getNeededSignatures = useCallback(async () => {
    if (signaturesRequested) return; // Prevent multiple requests
    setSignaturesRequested(true);

    const pairs =
      maciContributions?.groupedRounds &&
      (maciContributions?.groupedRounds.flatMap((round) => {
        return { chainId: round.chainId, roundId: round.roundId };
      }) as { chainId: number; roundId: string }[]);
    const walletClient = await getWalletClient();
    if (pairs) {
      await signAndStoreSignatures({
        pairs,
        walletClient: walletClient as WalletClient,
        address: walletAddress as string,
      });
    }
    setSignaturesReady(true); // Update state to indicate signatures are ready
  }, [maciContributions, walletAddress, signaturesRequested]);

  const getCartProjects = useCallback(async () => {
    await setContributed(
      projects,
      dataLayer,
      setCart,
      applications,
      maciContributions?.groupedMaciContributions,
      DecryptedContributions?.decryptedMessagesByRound
    );
    const credits = await dataLayer.getVoiceCreditsByChainIdAndRoundId({
      contributorAddress: walletAddress?.toLowerCase() as string,
    });
    setGroupedCredits(credits);
    setInitialLoading(false); // Set initial loading to false after loading cart projects
  }, [dataLayer, applications, maciContributions, DecryptedContributions]);

  // Check for existing signatures and set state accordingly
  useEffect(() => {
    if (maciContributions && walletAddress) {
      const signaturesExist = areSignaturesPresent(
        maciContributions.groupedMaciContributions,
        walletAddress
      );
      if (signaturesExist) {
        setSignaturesReady(true);
        setInitialLoading(false); // Set initial loading to false if signatures already exist
      } else {
        getNeededSignatures();
      }
    }
  }, [maciContributions, walletAddress, getNeededSignatures]);

  // Refetch decrypted contributions once signatures are ready
  useEffect(() => {
    if (signaturesReady) {
      refetch();
    }
  }, [signaturesReady, refetch]);

  // Get cart projects once decrypted contributions are available
  useEffect(() => {
    if (DecryptedContributions && signaturesReady) {
      getCartProjects();
    }
  }, [DecryptedContributions, signaturesReady, getCartProjects]);

  // Clear cart when wallet address changes
  useEffect(() => {
    setSignaturesRequested(false);
    setCart([]);
    setInitialLoading(true); // Set initial loading to true when wallet address changes
  }, [walletAddress]);

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
          <Header projects={projects} />

          {initialLoading && walletAddress ? (
            <div className="flex justify-center items-center my-10">
              <Spinner size="xl" />
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
