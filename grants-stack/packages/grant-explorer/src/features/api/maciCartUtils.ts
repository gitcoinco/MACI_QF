import { Application, DataLayer } from "data-layer";
import {
  CartProject,
  GroupedMACIDecryptedContributions,
  GroupedMaciContributions,
} from "./types";
import { PCommand } from "maci-domainobjs";
import { formatAmount } from "./formatAmount";
import { getVoteIdMap } from "./projectsMatching";
import { createCartProjectFromApplication } from "../discovery/ExploreProjectsPage";
import { getMACIKey } from "./keys";

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
              matchedVote.newVoteWeight * matchedVote.newVoteWeight * 10n ** 13n
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
      const round = (
        await dataLayer.getRoundForExplorer({
          roundId: roundID,
          chainId,
        })
      )?.round;
      const currentTime = new Date();

      const isActiveRound = round && round?.roundEndTime > currentTime;
      if (!isActiveRound) {
        continue;
      }

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

      console.log("updatedProjects", updatedProjects);
      console.log("newProjects", newProjects);

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

export const areSignaturesPresent = (
  maciContributions: GroupedMaciContributions,
  walletAddress: string
) => {
  if (!maciContributions || !walletAddress) return false;

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
