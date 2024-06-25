import { Application, Contribution, DataLayer } from "data-layer";
import {
  CartProject,
  GroupedMACIDecryptedContributions,
  GroupedMaciContributions,
  MACIContributions,
} from "./types";
import { PCommand } from "maci-domainobjs";
import { getVoteIdMap } from "./projectsMatching";
import { createCartProjectFromApplication } from "../discovery/ExploreProjectsPage";
import { getMACIKey } from "./keys";
import { formatEther } from "viem";
import { dateToEthereumTimestamp } from "common";

function translateApplicationToContribution(
  application: Application,
  amount: string,
  price: string | undefined,
  walletAddress: string,
  timestamp: string | undefined,
  blockNumber: number,
  transactionHash: string
): Contribution {
  return {
    id: application.id,
    chainId: parseInt(application.chainId, 10),
    projectId: application.projectId,
    roundId: application.roundId,
    recipientAddress: application.metadata.application.recipient,
    applicationId: application.id,
    tokenAddress: application.round.matchTokenAddress,
    donorAddress: walletAddress, // This should be replaced with the actual donor address if available
    amount: (Number(amount) * 10 ** 18).toString(), // This should be replaced with the actual donation amount if available
    amountInUsd: Number((Number(price) * Number(amount)).toFixed(2)), // This should be replaced with the actual donation amount in USD if available
    transactionHash: transactionHash, // This should be replaced with the actual transaction hash if available
    blockNumber: blockNumber, // This should be replaced with the actual block number if available
    round: {
      roundMetadata: application.round.roundMetadata,
      donationsStartTime: application.round.donationsStartTime,
      donationsEndTime: application.round.donationsEndTime,
    },
    application: {
      project: {
        name: application.project.metadata.title,
      },
    },
    timestamp: dateToEthereumTimestamp(
      timestamp ? new Date(timestamp) : new Date()
    ),
  };
}
interface Result {
  applicationId: string;
  newVoteWeight: string | undefined;
  timestamp: string | undefined;
  transactionHash: string | undefined;
}

async function getApplicationsByVoteOptionIndex(
  maciContributions: MACIContributions | undefined,
  applications: Application[],
  votes: PCommand[],
  voteIdMap: {
    [chainId: number]: {
      [roundId: string]: {
        [appId: string]: {
          id: bigint;
          maxNonce: bigint | undefined;
          newVoteWeight: string | undefined;
          timestamp: string | undefined;
          transactionHash: string | undefined;
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
          timestamp: undefined,
          transactionHash: undefined,
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
          ? formatEther(
              matchedVote.newVoteWeight * matchedVote.newVoteWeight * 10n ** 13n
            ).toString()
          : matchedVote && matchedVote.newVoteWeight === 0n
            ? undefined
            : "0";

      return {
        ...app,
        applicationId: voteInfo.id.toString(),
        newVoteWeight: voteWeight,
        timestamp: maciContributions?.encrypted?.timestamp ?? undefined,
        transactionHash:
          maciContributions?.encrypted?.transactionHash ?? undefined,
      };
    })
    .filter((app) => {
      // Exclude contributed projects with newVoteWeight === "0"
      return app.newVoteWeight !== undefined && app.newVoteWeight !== "0";
    });
}

const getContributed = async (
  dataLayer: DataLayer,
  groupedMaciContributions?: GroupedMaciContributions,
  groupedDecryptedContributions?: GroupedMACIDecryptedContributions,
  applications?: {
    [chainId: number]: {
      [roundId: string]: Application[];
    };
  } | null
) => {
  const contributedApplications = [];

  for (const chainID of Object.keys(groupedMaciContributions || {})) {
    const chainId = Number(chainID);
    for (const roundID of Object.keys(
      (groupedMaciContributions && groupedMaciContributions[chainId]) ?? {}
    )) {
      const decryptedMessages = groupedDecryptedContributions
        ? groupedDecryptedContributions[chainId]?.[roundID] || []
        : [];

      const maciContributionsForChainRound = groupedMaciContributions
        ? (groupedMaciContributions[chainId]?.[roundID] as MACIContributions)
        : undefined;

      const applicationsForChainRound = applications
        ? applications[chainId]?.[roundID] || []
        : [];

      const voteIdMap = await getVoteIdMap(
        applicationsForChainRound,
        dataLayer
      );
      const contributed = await getApplicationsByVoteOptionIndex(
        maciContributionsForChainRound,
        applicationsForChainRound,
        decryptedMessages,
        voteIdMap
      );
      contributedApplications.push(...contributed);
    }
  }

  return contributedApplications;
};

export const setContributed = async (
  projects: CartProject[],
  walletAddress: string,
  dataLayer: DataLayer,
  setUserCart: (projects: CartProject[], walletAddress: string) => void,
  applications?: {
    [chainId: number]: {
      [roundId: string]: Application[];
    };
  } | null,
  groupedMaciContributions?: GroupedMaciContributions,
  groupedDecryptedContributions?: GroupedMACIDecryptedContributions
) => {
  const contributedTo = await getContributed(
    dataLayer,
    groupedMaciContributions,
    groupedDecryptedContributions,
    applications
  );
  const applicationRefs = getApplicationRefs(projects, applications);

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
      setUserCart(
        [...updatedProjects.filter((p) => p.amount !== "0"), ...newProjects],
        walletAddress
      );
    })
    .catch((error) => {
      console.error("Error fetching applications in cart", error);
    });
};

function getApplicationRefs(
  projects: CartProject[],
  applications?: {
    [chainId: number]: {
      [roundId: string]: Application[];
    };
  } | null
) {
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

export const getDonationHistory = async (
  dataLayer: DataLayer,
  walletAddress: string,
  applications?: {
    [chainId: number]: {
      [roundId: string]: Application[];
    };
  } | null,
  groupedMaciContributions?: GroupedMaciContributions,
  groupedDecryptedContributions?: GroupedMACIDecryptedContributions,
): Promise<Contribution[]> => {
  const contributedTo = await getContributed(
    dataLayer,
    groupedMaciContributions,
    groupedDecryptedContributions,
    applications
  );

  const contributions: Contribution[] = contributedTo.map((app) =>
    translateApplicationToContribution(
      app,
      app.newVoteWeight ?? "0",
      app.newVoteWeight,
      walletAddress,
      app.timestamp, // Mock timestamp
      123456, // Mock block number
      app.transactionHash ?? "0xabcdef" // Mock transaction hash
    )
  );

  return contributions;
};

export const areSignaturesPresent = (
  maciContributions: GroupedMaciContributions | undefined,
  walletAddress: string
) => {
  if (!walletAddress) return false;
  if (!maciContributions) return true;
  for (const chainId in maciContributions) {
    for (const roundId in maciContributions[chainId]) {
      const signature = getMACIKey({
        chainID: Number(chainId),
        roundID: roundId,
        walletAddress,
      });
      if (!signature) {
        return false;
      }
    }
  }
  return true;
};
