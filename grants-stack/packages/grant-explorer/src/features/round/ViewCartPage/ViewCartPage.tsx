import React, { useEffect, useState } from "react";
import { ChainId } from "common";
import { groupProjectsInCart } from "../../api/utils";
import Footer from "common/src/components/Footer";
import Navbar from "../../common/Navbar";
import Breadcrumb, { BreadcrumbItem } from "../../common/Breadcrumb";
import { EmptyCart } from "./EmptyCart";
import { Header } from "./Header";
import { useCartStorage } from "../../../store";
import { CartWithProjects } from "./CartWithProjects";
import { Application, useDataLayer } from "data-layer";
import { createCartProjectFromApplication } from "../../discovery/ExploreProjectsPage";
import { useRoundsApprovedApplications } from "../../projects/hooks/useRoundApplications";
import {
  useMACIContributions,
  useDecryptMessages,
} from "../../projects/hooks/useRoundMaciMessages";

import { useAccount } from "wagmi";
import { getVoteIdMap } from "../../api/projectsMatching";
import { formatAmount } from "../../api/formatAmount";

import { PCommand } from "maci-domainobjs";
import { Button } from "@chakra-ui/react";
import {
  CartProject,
  MACIContributionsByRoundId,
  MACIDecryptedContributionsByRoundId,
} from "../../api/types";
export default function ViewCart() {
  const [fetchedContributed, setFetchedContributed] = useState(false);

  const { projects, setCart } = useCartStorage();

  const { address: walletAddress } = useAccount();

  const dataLayer = useDataLayer();

  const groupedCartProjects = groupProjectsInCart(projects);

  const { data: maciContributions } = useMACIContributions(
    walletAddress?.toLowerCase() as string,
    dataLayer
  );

  const { data: groupedDecryptedContributions } = useDecryptMessages(
    maciContributions?.groupedMaciContributions,
    walletAddress?.toLowerCase() as string
  );

  const { data: applications } = useRoundsApprovedApplications(
    maciContributions?.groupedRounds ?? [],
    dataLayer
  );

  interface Result {
    applicationId: string;
    newVoteWeight: string | undefined;
  }

  async function getApplicationsByVoteOptionIndex(
    applications: Application[],
    votes: PCommand[],
    voteIdMap: {
      [chainId: number]: {
        [roundId: string]: {
          [appId: string]: {
            id: bigint;
            maxNonce: bigint | undefined;
            newVoteWeight: string | undefined;
          };
        };
      };
    }
  ): Promise<(Application & Result)[]> {
    return applications
      .map((app) => {
        const voteInfo = voteIdMap[Number(app.chainId)][app.roundId][app.id];
        const matchingVotes = votes.filter(
          (vote) => voteInfo.id.toString() === vote.voteOptionIndex.toString()
        );
        let maxNonceVote;
        // Find the vote with the maximum nonce
        if (matchingVotes.length === 0) {
          return {
            ...app,
            applicationId: voteInfo.id.toString(),
            newVoteWeight: "0",
          };
        } else if (matchingVotes.length === 1) {
          maxNonceVote = matchingVotes[0];
        } else {
          maxNonceVote = matchingVotes.reduce((maxVote, currentVote) =>
            maxVote === undefined || currentVote.nonce > maxVote.nonce
              ? currentVote
              : maxVote
          );
        }
        // Update the maxNonce in the voteIdMap
        voteInfo.maxNonce = maxNonceVote.nonce;

        const matchedVote = votes.find(
          (vote) =>
            voteInfo.id.toString() === vote.voteOptionIndex.toString() &&
            vote.nonce === voteInfo.maxNonce
        );

        const voteWeight =
          matchedVote && matchedVote.newVoteWeight !== 0n
            ? formatAmount(
                matchedVote.newVoteWeight *
                  matchedVote.newVoteWeight *
                  10n ** 13n
              ).toString()
            : matchedVote && matchedVote.newVoteWeight === 0n
            ? undefined
            : "0";

        return {
          ...app,
          applicationId: voteInfo.id.toString(),
          newVoteWeight: voteWeight,
        };
      })
      .filter((app) => {
        // Exclude contributed projects with newVoteWeight === "0"
        return app.newVoteWeight !== undefined && app.newVoteWeight !== "0";
      });
  }

  const getContributed = async () => {
    const contributedApplications = [];

    for (const chainID of Object.keys(
      maciContributions?.groupedMaciContributions || {}
    )) {
      const chainId = Number(chainID);
      for (const roundID of Object.keys(
        maciContributions?.groupedMaciContributions[chainId] || {}
      )) {
        const decryptedMessages = groupedDecryptedContributions
          ? groupedDecryptedContributions[chainId]?.[roundID] || []
          : [];

        const applicationsForChainRound = applications
          ? applications[chainId]?.[roundID] || []
          : [];

        const voteIdMap = await getVoteIdMap(applicationsForChainRound);
        const contributed = await getApplicationsByVoteOptionIndex(
          applicationsForChainRound,
          decryptedMessages,
          voteIdMap
        );
        contributedApplications.push(...contributed);
      }
    }

    return contributedApplications;
  };

  async function setContributed() {
    const contributedTo = await getContributed();
    const applicationRefs = getApplicationRefs();
    console.log("applicationRefs", contributedTo);

    dataLayer
      .getApprovedApplicationsByExpandedRefs(applicationRefs)
      .then((applications) => {
        const updatedProjects: CartProject[] = applications.flatMap(
          (application) => {
            const contribution = contributedTo.find((app) => {
              return (
                application.roundApplicationId.toLowerCase() ===
                  app.id.toLowerCase() &&
                application.chainId === Number(app.chainId) &&
                application.roundId === app.roundId
              );
            });

            const newProject = createCartProjectFromApplication(application);
            return {
              ...newProject,
              amount: contribution?.newVoteWeight?.toString() ?? "0",
            };
          }
        );

        // Retain new projects that haven't been contributed to
        const newProjects = projects.filter(
          (project) =>
            !contributedTo.some(
              (contrib) =>
                project.anchorAddress?.toString() === contrib.id &&
                project.chainId === Number(contrib.chainId) &&
                project.roundId === contrib.roundId
            )
        );

        // Combine new projects with updated ones, excluding contributed projects with newVoteWeight === "0"
        setCart([
          ...updatedProjects.filter((p) => p.amount !== "0"),
          ...newProjects,
        ]);
      })
      .catch((error) => {
        console.error("Error fetching applications in cart", error);
      });
  }

  function getApplicationRefs() {
    const applicationRefs = projects.map((project) => ({
      chainId: project.chainId,
      roundId: project.roundId,
      id: project.anchorAddress?.toString() ?? "",
    }));

    if (applications) {
      for (const chainId of Object.keys(applications)) {
        const chainID = Number(chainId);
        for (const roundId of Object.keys(applications[chainID])) {
          applications[chainID][roundId].forEach((project) => {
            if (
              !applicationRefs.some(
                (app) =>
                  app.chainId === chainID &&
                  app.roundId === roundId &&
                  app.id === project.id.toString()
              )
            ) {
              applicationRefs.push({
                chainId: chainID,
                roundId: roundId,
                id: project.id.toString(),
              });
            }
          });
        }
      }
    }
    return applicationRefs;
  }

  useEffect(() => {
    setFetchedContributed(false);
  }, [projects]);

  useEffect(() => {
    if (!fetchedContributed) {
      setContributed();
      setFetchedContributed(true);
    }
  }, [fetchedContributed]);

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
          <div className="flex flex-col md:flex-row gap-5">
            {/* <Button onClick={async () => await setContributed()}>
              Set contributed
            </Button> */}
            {projects.length === 0 ? (
              <>
                <EmptyCart />
              </>
            ) : (
              <div className={"grid sm:grid-cols-2 gap-5 w-full mx-[5%]"}>
                <div className="flex flex-col gap-5 sm:col-span-2 order-2 sm:order-1">
                  {Object.keys(groupedCartProjects).map((chainId) => (
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
                          groupedDecryptedContributions?.[Number(chainId)]
                            ? (groupedDecryptedContributions?.[
                                Number(chainId)
                              ] as MACIDecryptedContributionsByRoundId)
                            : null
                        }
                        chainId={Number(chainId) as ChainId}
                      />
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
