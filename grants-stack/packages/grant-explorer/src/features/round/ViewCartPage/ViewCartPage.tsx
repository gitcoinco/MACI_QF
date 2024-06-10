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
import { SummaryContainer } from "./SummaryContainer";
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
export default function ViewCart() {
  const { projects, setCart } = useCartStorage();

  const { address: walletAddress } = useAccount();

  const dataLayer = useDataLayer();

  const groupedCartProjects = groupProjectsInCart(projects);

  const { data: maciContributions } = useMACIContributions(
    walletAddress?.toLowerCase() as string,
    dataLayer
  );

  console.log(maciContributions);

  const alreadyContributedRounds = maciContributions?.groupedRounds || [];

  const selectedCartRounds = Array.from(
    new Map(
      projects
        .map((project) => {
          return {
            chainId: project.chainId,
            roundId: project.roundId,
            address: walletAddress as string,
          };
        })
        .map((item) => [
          `${item.chainId}-${item.roundId}`,
          { chainId: item.chainId, roundId: item.roundId },
        ])
    ).values()
  );
  const combinedUniqueDetails = Array.from(
    new Map(
      [...selectedCartRounds, ...alreadyContributedRounds].map((item) => [
        `${item.chainId}-${item.roundId}`,
        { chainId: item.chainId, roundId: item.roundId },
      ])
    ).values()
  );

  const { data: groupedDecryptedContributions } = useDecryptMessages(
    maciContributions?.groupedMaciContributions,
    walletAddress?.toLowerCase() as string
  );

  const { data: applications } = useRoundsApprovedApplications(
    maciContributions?.groupedRounds ?? [],
    dataLayer
  );
  const chainID = 11155111;
  const roundID = "220";
  const maciMessages = maciContributions?.groupedMaciContributions[chainID][
    roundID
  ]
    ? maciContributions.groupedMaciContributions[chainID][roundID]
    : null;

  const alreadyContributed = maciContributions?.groupedMaciContributions[
    chainID
  ][roundID].encrypted
    ? true
    : false;

  interface Result {
    applicationId: string;
    newVoteWeight: string | undefined;
  }

  async function getApplicationsByVoteOptionIndex(
    applications: Application[],
    votes: PCommand[]
  ): Promise<(Application & Result)[]> {
    // Define a map from application id to vote ID string to int
    const voteIdMap = await getVoteIdMap(applications);

    return applications
      .filter((app) => {
        // Filter the votes to find the ones matching the application ID
        const matchingVotes = votes.filter(
          (vote) =>
            voteIdMap[app.id].id.toString() === vote.voteOptionIndex.toString()
        );

        if (matchingVotes.length > 0) {
          // Find the vote with the maximum nonce
          const maxNonceVote = matchingVotes.reduce((maxVote, currentVote) =>
            maxVote === undefined || currentVote.nonce > maxVote.nonce
              ? currentVote
              : maxVote
          );

          // Update the maxNonce in the voteIdMap
          voteIdMap[app.id].maxNonce = maxNonceVote.nonce;
          return true;
        }
        return false;
      })
      .map((app) => {
        const matchedVote = votes.find(
          (vote) =>
            voteIdMap[app.id].id.toString() ===
              vote.voteOptionIndex.toString() &&
            vote.nonce === voteIdMap[app.id].maxNonce
        );

        const voteWeight = matchedVote
          ? formatAmount(
              matchedVote.newVoteWeight * matchedVote.newVoteWeight * 10n ** 13n
            ).toString()
          : undefined;

        return {
          ...app,
          applicationId: voteIdMap[app.id].id.toString(),
          newVoteWeight: voteWeight,
        };
      })
      .filter((app) => app.newVoteWeight !== "0");
  }

  // NEW CODE
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
        const contributed = await getApplicationsByVoteOptionIndex(
          applicationsForChainRound,
          decryptedMessages
        );
        contributedApplications.push(...contributed);
      }
    }

    return contributedApplications;
  };

  async function setContributed() {
    const contributedTo = await getContributed();
    const applicationRefs = getApplicationRefs();
    console.log("applicationRefs", applicationRefs);

    dataLayer
      .getApprovedApplicationsByExpandedRefs(applicationRefs)
      .then((applications) => {
        const updatedProjects = applications.flatMap((application) => {
          const newProject = createCartProjectFromApplication(application);
          return {
            ...newProject,
            amount:
              contributedTo.find(
                (app) => application.roundApplicationId === app.id
              )?.newVoteWeight ?? "",
          };
        });
        setCart(updatedProjects);
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

  // ensure cart data is up to date on mount
  useEffect(() => {
    const applicationRefs = getApplicationRefs();

    // only update cart if fetching applications is successful
    dataLayer
      .getApprovedApplicationsByExpandedRefs(applicationRefs)
      .then((applications) => {
        const updatedProjects = applications.flatMap((application) => {
          const existingProject = projects.find((project) => {
            return applications.some(
              (application) =>
                application.chainId === project.chainId &&
                application.roundId === project.roundId &&
                application.roundApplicationId ===
                  project.anchorAddress?.toString()
            );
          });

          const newProject = createCartProjectFromApplication(application);

          // update all application data, but preserve the selected amount
          return { ...newProject, amount: existingProject?.amount ?? "" };
        });

        // replace whole cart
        setCart(updatedProjects);
      })
      .catch((error) => {
        console.error("error fetching applications in cart", error);
      });

    // we only want to run this once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {}, [projects]);

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
            {alreadyContributed && (
              <Button onClick={async () => await setContributed()}>
                Set contributed
              </Button>
            )}
            {projects.length === 0 ? (
              <>
                <EmptyCart />
                <SummaryContainer
                  alreadyContributed={(alreadyContributed as boolean) || false}
                  // TODO: MAKE Summary Container handle more than one round
                  decryptedMessages={null}
                  stateIndex={BigInt(
                    maciMessages?.encrypted?.stateIndex ?? "0"
                  )}
                  maciMessages={maciMessages}
                />
              </>
            ) : (
              <div className={"grid sm:grid-cols-3 gap-5 w-full"}>
                <div className="flex flex-col gap-5 sm:col-span-2 order-2 sm:order-1">
                  {Object.keys(groupedCartProjects).map((chainId) => (
                    <div key={Number(chainId)}>
                      <CartWithProjects
                        cart={groupedCartProjects[Number(chainId)]}
                        chainId={Number(chainId) as ChainId}
                      />
                    </div>
                  ))}
                </div>
                <div className="sm:col-span-1 order-1 sm:order-2">
                  <SummaryContainer
                    alreadyContributed={
                      (alreadyContributed as boolean) || false
                    }
                    // TODO: MAKE Summary Container handle more than one round
                    decryptedMessages={null}
                    stateIndex={BigInt(
                      maciMessages?.encrypted?.stateIndex ?? "0"
                    )}
                    maciMessages={maciMessages}
                  />
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
