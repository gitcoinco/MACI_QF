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
import { Application, Message, useDataLayer } from "data-layer";
import { createCartProjectFromApplication } from "../../discovery/ExploreProjectsPage";
import { useRoundsApprovedApplications } from "../../projects/hooks/useRoundApplications";
import { useRoundMaciMessages } from "../../projects/hooks/useRoundMaciMessages";
import { WalletClient, getPublicClient } from "@wagmi/core";
import { generatePubKeyWithSeed } from "../../../checkoutStore";
import { getContributorMessages } from "../../api/voting";
import { parseAbi } from "viem";
import { useAccount } from "wagmi";
import { getWalletClient } from "@wagmi/core";
import { formatAmount } from "../../api/formatAmount";

import { PCommand, PubKey } from "maci-domainobjs";
import { Button } from "@chakra-ui/react";
import { getMACIKeys } from "../../api/keys";
export default function ViewCart() {
  const { projects, setCart } = useCartStorage();

  // Create a set of objects that have the chainId and roundID information keep the distinct values

  const { address: walletAddress } = useAccount();

  const details = projects.map((project) => {
    return {
      chainId: project.chainId,
      roundId: project.roundId,
      address: walletAddress as string,
    };
  });

  const uniqueDetails = Array.from(
    new Map(
      details.map((item) => [
        `${item.chainId}-${item.roundId}`,
        { chainId: item.chainId, roundId: item.roundId },
      ])
    ).values()
  );

  const dataLayer = useDataLayer();
  const groupedCartProjects = groupProjectsInCart(projects);

  // Create a set of tuples that have the chainId and roundID information from the grouped projects

  const [decryptedMessages, setDecryptedMessages] = React.useState<
    PCommand[] | null
  >(null);

  const chainID = 11155111;
  const roundID = "220";

  const { data: applications } = useRoundsApprovedApplications(
    uniqueDetails,
    dataLayer
  );

  console.log(details);

  const { data: MaciRoundsMessages } = useRoundMaciMessages(details, dataLayer);

  const maciMessages = MaciRoundsMessages ? MaciRoundsMessages[0] : null;
  const alreadyContributed = maciMessages?.encrypted ? true : false;

  interface Result {
    applicationId: string;
    newVoteWeight: string | undefined;
  }

  async function getApplicationsByVoteOptionIndex(
    applications: Application[],
    votes: PCommand[]
  ): Promise<(Application & Result)[]> {
    const client = getPublicClient();

    // Define a map from application id to vote ID string to int
    const voteIdMap: {
      [key: string]: {
        id: bigint;
        maxNonce: bigint | undefined;
        newVoteWeight: string | undefined;
      };
    } = {};

    for (const app of applications) {
      const strategyAddress = await client
        .readContract({
          address:
            "0x1133eA7Af70876e64665ecD07C0A0476d09465a1" as `0x${string}`,
          abi: parseAbi([
            "function getPool(uint256) public view returns ((bytes32, address, address, (uint256,string), bytes32, bytes32))",
          ]),
          functionName: "getPool",
          args: [BigInt(roundID)],
        })
        .then((res) => res[1]);

      const ID = await client.readContract({
        address: strategyAddress as `0x${string}`,
        abi: parseAbi([
          "function recipientToVoteIndex(address) public view returns (uint256)",
        ]),
        functionName: "recipientToVoteIndex",
        args: [app.id as `0x${string}`],
      });

      // Store the ID with the maximum nonce found
      voteIdMap[app.id] = {
        id: ID,
        maxNonce: undefined,
        newVoteWeight: undefined,
      };
    }

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
    const roundID = maciMessages?.maciInfo.roundId ?? "";

    const signature = await getMACIKeys({
      chainID: chainID,
      roundID: roundID,
      walletAddress: walletAddress as string,
      walletClient: (await getWalletClient()) as WalletClient,
    });

    const pk = await generatePubKeyWithSeed(signature);

    const messages = maciMessages?.encrypted.messages as Message[];

    const decryptedMessages = await getContributorMessages({
      contributorKey: pk,
      coordinatorPubKey: maciMessages?.maciInfo.coordinatorPubKey as PubKey,
      maciMessages: {
        messages: messages.map((m) => {
          return {
            msgType: BigInt(m.message.msgType),
            data: m.message.data.map((d) => BigInt(d)),
          };
        }),
      },
    });
    setDecryptedMessages(decryptedMessages);

    return await getApplicationsByVoteOptionIndex(
      applications ? applications[chainID][roundID] : ([] as Application[]),
      decryptedMessages
    );
  };

  async function setContributed() {
    const contributedTo = await getContributed();
    const applicationRefs = projects.map((project) => {
      return {
        chainId: project.chainId,
        roundId: project.roundId,
        id: project.anchorAddress?.toString() ?? "",
      };
    });
    contributedTo.map((project) => {
      applicationRefs.push({
        chainId: ChainId.SEPOLIA,
        roundId: project.roundId,
        id: project.id.toString(),
      });
    });

    // only update cart if fetching applications is successful
    dataLayer
      .getApprovedApplicationsByExpandedRefs(applicationRefs)
      .then((applications) => {
        const updatedProjects = applications.flatMap((application) => {
          const newProject = createCartProjectFromApplication(application);

          // update all application data, but preserve the selected amount
          return {
            ...newProject,
            amount:
              contributedTo.find(
                (app) => application?.roundApplicationId === app.id
              )?.newVoteWeight ?? "",
          };
        });
        // replace whole cart
        setCart(updatedProjects);
      })
      .catch((error) => {
        console.error("error fetching applications in cart", error);
      });
  }

  // ensure cart data is up to date on mount
  useEffect(() => {
    const applicationRefs = projects.map((project) => {
      return {
        chainId: project.chainId,
        roundId: project.roundId,
        id: project.anchorAddress?.toString() ?? "",
      };
    });

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
                  decryptedMessages={decryptedMessages}
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
                    decryptedMessages={decryptedMessages}
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
