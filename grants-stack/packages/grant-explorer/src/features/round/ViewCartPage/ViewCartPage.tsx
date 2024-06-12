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
import { Button } from "@chakra-ui/react";
import { setContributed } from "../../api/maciCartUtils";
import {
  CartProject,
  MACIContributionsByRoundId,
  MACIDecryptedContributionsByRoundId,
} from "../../api/types";
import { signAndStoreSignatures } from "../../api/keys";
import { WalletClient, getWalletClient } from "@wagmi/core";

export default function ViewCart() {
  const [fetchedContributed, setFetchedContributed] = useState(false);
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

  const { data: DecryptedContributions } = useDecryptMessages(
    maciContributions?.groupedMaciContributions,
    walletAddress?.toLowerCase() as string
  );

  const groupedCartProjects = groupProjectsInCart(projects);
  const combinedGroupedCartProjects = groupedCartProjects;

  for (const chainId of Object.keys(
    DecryptedContributions?.needSignature || {}
  )) {
    for (const roundId of Object.keys(
      DecryptedContributions?.needSignature?.[Number(chainId)] || {}
    )) {
      if (!combinedGroupedCartProjects[Number(chainId)]) {
        combinedGroupedCartProjects[Number(chainId)] = {};
      }
      if (!combinedGroupedCartProjects[Number(chainId)][roundId]) {
        combinedGroupedCartProjects[Number(chainId)][roundId] = [];
      }
      if (DecryptedContributions?.needSignature?.[Number(chainId)]?.[roundId]) {
        groupedCartProjects[Number(chainId)][roundId].push({
          chainId: Number(chainId),
          roundId,
          amount: "0",
        } as CartProject);
      }
    }
  }

  const getNeededSignatures = async () => {
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
  };

  const updateCart = useCallback(async () => {
    if (DecryptedContributions && !fetchedContributed) {
      setCart([]);
      await setContributed(
        projects,
        dataLayer,
        setCart,
        applications,
        maciContributions?.groupedMaciContributions,
        DecryptedContributions?.decryptedMessagesByRound
      );
      setFetchedContributed(true);
    }
  }, [
    applications,
  ]);

  useEffect(() => {
    updateCart();
  }, [
    walletAddress,
    applications,
  ]);

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
          <div>
            <Button
              onClick={async () =>
                await setContributed(
                  projects,
                  dataLayer,
                  setCart,
                  applications,
                  maciContributions?.groupedMaciContributions,
                  DecryptedContributions?.decryptedMessagesByRound
                )
              }
            >
              Set contributed
            </Button>
            <Button
              onClick={async () => {
                await getNeededSignatures();
                setFetchedContributed(false);
              }}
            >
              SignToDecrypt
            </Button>
          </div>
          <div className="flex flex-col md:flex-row gap-5">
            {!maciContributionsByChainId ||
            (maciContributionsByChainId && projects.length === 0) ? (
              <>
                <EmptyCart />
              </>
            ) : (
              <div className={"grid sm:grid-cols-2 gap-5 w-full mx-5"}>
                <div className="flex flex-col gap-5 sm:col-span-2 order-2 sm:order-1">
                  {maciContributionsByChainId &&
                    maciContributionsByChainId.map((chainId) => (
                      <div key={Number(chainId)}>
                        <CartWithProjects
                          cart={groupedCartProjects[Number(chainId)]}
                          maciContributions={
                            maciContributions?.groupedMaciContributions[
                              Number(chainId)
                            ]
                              ? (maciContributions?.groupedMaciContributions[
                                  Number(chainId)
                                ] as MACIContributionsByRoundId)
                              : null
                          }
                          decryptedContributions={
                            DecryptedContributions?.decryptedMessagesByRound?.[
                              Number(chainId)
                            ]
                              ? (DecryptedContributions
                                  ?.decryptedMessagesByRound?.[
                                  Number(chainId)
                                ] as MACIDecryptedContributionsByRoundId)
                              : null
                          }
                          needsSignature={
                            DecryptedContributions?.needSignature?.[
                              Number(chainId)
                            ]
                              ? DecryptedContributions?.needSignature?.[
                                  Number(chainId)
                                ]
                              : null
                          }
                          handleDecrypt={getNeededSignatures}
                          chainId={Number(chainId) as ChainId}
                        />{" "}
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </main>
        <div className="my-11">
          <Footer />
        </div>
      </div>
    </>
  );
}
