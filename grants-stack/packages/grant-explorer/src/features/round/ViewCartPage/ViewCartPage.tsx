import React, { useEffect } from "react";
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
import { useRoundApprovedApplications } from "../../projects/hooks/useRoundApplications";
import { useRoundMaciMessages } from "../../projects/hooks/useRoundMaciMessages";
import { getPublicClient, signMessage } from "@wagmi/core";
import { generatePubKeyWithSeed } from "../../../checkoutStore";
import { getContributorMessages } from "../../api/voting";
import { BigNumberish, ethers } from "ethers";
import { formatEther } from "viem";
import { useAccount } from "wagmi";

import { PCommand, PubKey } from "maci-domainobjs";
import { Button } from "@chakra-ui/react";
import { CartProject } from "../../api/types";
export default function ViewCart() {
  const { projects, setCart } = useCartStorage();
  const dataLayer = useDataLayer();
  const groupedCartProjects = groupProjectsInCart(projects);
  const { address: walletAddress } = useAccount();

  const formatUnits = ethers.utils.formatUnits;

  const [decryptedMessages, setDecryptedMessages] = React.useState<
    PCommand[] | null
  >(null);
  function formatAmount(
    _value: bigint | string,
    units: BigNumberish = 18,
    maximumSignificantDigits?: number | null
  ): string {
    // If _value is already in string form, assign to formattedValue
    // Otherwise, convert BigNumber (really large integers) to whole AOE balance (human readable floats)
    const formattedValue: string =
      typeof _value === "string"
        ? _value
        : formatUnits(_value as bigint, units).toString();
    let result: number = parseFloat(formattedValue);
    // If `maxDecimals` passed, fix/truncate to string and parse back to number
    result = parseFloat(result.toFixed(2));

    // If `maximumSignificantDigits` passed, return compact human-readable form to specified digits
    if (maximumSignificantDigits) {
      return new Intl.NumberFormat("en", {
        notation: "compact",
        maximumSignificantDigits,
      }).format(result);
    }

    try {
      // Else, return commified result
      return result.toLocaleString();
    } catch {
      // return result without comma if failed to add comma
      return result.toString(10);
    }
  }

  const chainID = 11155111;
  const roundID = "187";

  const { data: applications } = useRoundApprovedApplications(
    { chainId: chainID, roundId: roundID },
    dataLayer
  );
  console.log(applications);

  const { data: maciMessages } = useRoundMaciMessages(
    { chainId: chainID, roundId: roundID, address: walletAddress as string },
    dataLayer
  );

  const alreadyContributed = maciMessages?.encrypted.length !== 0;

  console.log("maciMessages", maciMessages);

  interface Result {
    applicationId: string;
    newVoteWeight: string | undefined;
  }

  function getApplicationsByVoteOptionIndex(
    applications: Application[],
    votes: PCommand[]
  ): (Application & Result)[] {
    return applications
      .filter((app) =>
        votes.some((vote) => app.id === vote.voteOptionIndex.toString())
      )
      .map((app) => {
        const matchedVote = votes.find(
          (vote) => app.id === vote.voteOptionIndex.toString()
        );
        console.log("matchedVote", matchedVote);

        return {
          ...app,
          applicationId: app.id,
          newVoteWeight: matchedVote
            ? formatAmount(
                matchedVote.newVoteWeight *
                  matchedVote.newVoteWeight *
                  10n ** 13n
              ).toString()
            : undefined,
        };
      });
  }

  // NEW CODE
  const getContributed = async () => {
    const signature = await signMessage({
      message: `Sign this message to get your public key for MACI voting on Allo for the round with address ${maciMessages?.maciInfo.roundId} on chain ${chainID}`,
    });
    const pk = await generatePubKeyWithSeed(signature);

    const messages = maciMessages?.encrypted[0].messages as Message[];

    const decryptedMessages = await getContributorMessages({
      // Poll contract address
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
    console.log("decryptedMessages", decryptedMessages);

    return getApplicationsByVoteOptionIndex(
      applications as Application[],
      decryptedMessages
    );
  };

  async function setContributed() {
    const contributedTo = await getContributed();
    const applicationRefs = projects.map((project) => {
      return {
        chainId: project.chainId,
        roundId: project.roundId,
        id: project.applicationIndex.toString(),
      };
    });
    contributedTo.map((project) => {
      applicationRefs.push({
        chainId: ChainId.SEPOLIA,
        roundId: project.roundId,
        id: project.id.toString(),
      });
      console.log("project", project);
    });

    console.log("applicationRefs", applicationRefs);
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
                  project.applicationIndex.toString()
            );
          });

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
        console.log("updatedProjects", updatedProjects);
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
        id: project.applicationIndex.toString(),
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
                  project.applicationIndex.toString()
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
