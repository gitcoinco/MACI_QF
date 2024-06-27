/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { create } from "zustand";
import { devtools } from "zustand/middleware";
import {
  CartProject,
  ProgressStatus,
  IPublishBatchArgs,
  IPublishMessage,
  PoolInfo,
  MACIPollContracts,
  IMessageContractParams,
  IPubKey,
} from "./features/api/types";
import { ChainId } from "common";
import { useCartStorage } from "./store";
import {
  Hex,
  InternalRpcError,
  parseAbi,
  parseUnits,
  SwitchChainError,
  UserRejectedRequestError,
} from "viem";
import {
  Keypair as GenKeyPair,
  prepareAllocationData,
  bnSqrt,
} from "./features/api/voting";
import { groupBy, uniq } from "lodash-es";
import { getEnabledChains } from "./app/chainConfig";
import { WalletClient } from "wagmi";
import { getPublicClient } from "@wagmi/core";
import { decodeAbiParameters, parseAbiParameters } from "viem";
import { Keypair, PCommand, PubKey, PrivKey } from "maci-domainobjs";
import { genRandomSalt } from "maci-crypto";
import { DataLayer } from "data-layer";
import { generatePubKey } from "./features/api/keys";
import { getAlloAddress } from "common/dist/allo/backends/allo-v2";
import { getMACIABI } from "common/src/allo/voting";

type ChainMap<T> = Record<ChainId, T>;

interface CheckoutState {
  permitStatus: ChainMap<ProgressStatus>;
  setPermitStatusForChain: (
    chain: ChainId,
    permitStatus: ProgressStatus
  ) => void;
  maciKeyStatus: ChainMap<ProgressStatus>;
  setMaciKeyStatusForChain: (
    chain: ChainId,
    maciKeyStatus: ProgressStatus
  ) => void;
  contributionStatus: ChainMap<ProgressStatus>;
  setContributionStatusForChain: (
    chain: ChainId,
    contributionStatus: ProgressStatus
  ) => void;
  changeDonationsStatus: ChainMap<ProgressStatus>;
  setChangeDonationsStatusForChain: (
    chain: ChainId,
    changeDonationsStatus: ProgressStatus
  ) => void;

  isDonationOrChangeDonationInProgress: boolean;
  setIsDonationOrChangeDonationInProgress: (isInProgress: boolean) => void;

  voteStatus: ChainMap<ProgressStatus>;
  setVoteStatusForChain: (chain: ChainId, voteStatus: ProgressStatus) => void;
  chainSwitchStatus: ChainMap<ProgressStatus>;
  setChainSwitchStatusForChain: (
    chain: ChainId,
    voteStatus: ProgressStatus
  ) => void;
  currentChainBeingCheckedOut?: ChainId;
  chainsToCheckout: ChainId[];
  setChainsToCheckout: (chains: ChainId[]) => void;
  /** Checkout the given chains
   * this has the side effect of adding the chains to the wallet if they are not yet present
   * We get the data necessary to construct the votes from the cart store */
  checkoutMaci: (
    chainId: ChainId,
    roundId: string,
    walletClient: WalletClient,
    dataLayer: DataLayer,
    walletAddress: string,
    pcd?: string
  ) => Promise<boolean>;

  changeDonations: (
    chainId: ChainId,
    roundId: string,
    voiceCreditsBalance: bigint,
    walletClient: WalletClient,
    previousMessages: PCommand[],
    stateIndex: bigint,
    dataLayer: DataLayer,
    walletAddress: string
  ) => Promise<boolean>;

  getCheckedOutProjects: () => CartProject[];
  checkedOutProjects: CartProject[];
  setCheckedOutProjects: (newArray: CartProject[]) => void;
}

const defaultProgressStatusForAllChains = Object.fromEntries(
  Object.values(getEnabledChains()).map((value) => [
    value.id as ChainId,
    ProgressStatus.NOT_STARTED,
  ])
) as ChainMap<ProgressStatus>;

const abi = getMACIABI();

export const useCheckoutStore = create<CheckoutState>()(
  devtools((set, get) => ({
    permitStatus: defaultProgressStatusForAllChains,
    setPermitStatusForChain: (chain: ChainId, permitStatus: ProgressStatus) =>
      set((oldState) => ({
        permitStatus: { ...oldState.permitStatus, [chain]: permitStatus },
      })),
    maciKeyStatus: defaultProgressStatusForAllChains,
    setMaciKeyStatusForChain: (chain: ChainId, maciKeyStatus: ProgressStatus) =>
      set((oldState) => ({
        maciKeyStatus: { ...oldState.maciKeyStatus, [chain]: maciKeyStatus },
      })),
    contributionStatus: defaultProgressStatusForAllChains,
    setContributionStatusForChain: (
      chain: ChainId,
      contributionStatus: ProgressStatus
    ) =>
      set((oldState) => ({
        contributionStatus: {
          ...oldState.contributionStatus,
          [chain]: contributionStatus,
        },
      })),

    changeDonationsStatus: defaultProgressStatusForAllChains,
    setChangeDonationsStatusForChain: (
      chain: ChainId,
      changeDonationsStatus: ProgressStatus
    ) =>
      set((oldState) => ({
        changeDonationsStatus: {
          ...oldState.changeDonationsStatus,
          [chain]: changeDonationsStatus,
        },
      })),

    voteStatus: defaultProgressStatusForAllChains,
    setVoteStatusForChain: (chain: ChainId, voteStatus: ProgressStatus) =>
      set((oldState) => ({
        voteStatus: { ...oldState.voteStatus, [chain]: voteStatus },
      })),
    chainSwitchStatus: defaultProgressStatusForAllChains,
    setChainSwitchStatusForChain: (
      chain: ChainId,
      chainSwitchStatus: ProgressStatus
    ) =>
      set((oldState) => ({
        chainSwitchStatus: {
          ...oldState.chainSwitchStatus,
          [chain]: chainSwitchStatus,
        },
      })),
    currentChainBeingCheckedOut: undefined,
    chainsToCheckout: [],
    setChainsToCheckout: (chains: ChainId[]) => {
      set({
        chainsToCheckout: chains,
      });
    },
    isDonationOrChangeDonationInProgress: false,
    setIsDonationOrChangeDonationInProgress: (isInProgress: boolean) => {
      set({
        isDonationOrChangeDonationInProgress: isInProgress,
      });
    },

    /** Checkout the given chains
     * this has the side effect of adding the chains to the wallet if they are not yet present
     * We get the data necessary to construct the votes from the cart store */
    checkoutMaci: async (
      chainId: ChainId,
      roundId: string,
      walletClient: WalletClient,
      dataLayer: DataLayer,
      walletAddress: string,
      pcd?: string
    ): Promise<boolean> => {
      const chainIdsToCheckOut = [chainId];
      get().setChainsToCheckout(
        uniq([...get().chainsToCheckout, ...chainIdsToCheckOut])
      );
      get().setContributionStatusForChain(chainId, ProgressStatus.NOT_STARTED);
      get().setMaciKeyStatusForChain(chainId, ProgressStatus.NOT_STARTED);
      get().setVoteStatusForChain(chainId, ProgressStatus.NOT_STARTED);
      get().setIsDonationOrChangeDonationInProgress(false);

      const projectsToCheckOut = useCartStorage
        .getState()
        .userProjects[
          walletAddress
        ].filter((project) => project.chainId === chainId && project.roundId === roundId);

      const projectsByChain = { [chainId]: projectsToCheckOut };

      const getVotingTokenForChain =
        useCartStorage.getState().getVotingTokenForChain;

      const donations = projectsByChain[chainId];

      set({
        currentChainBeingCheckedOut: chainId,
      });

      await switchToChain(chainId, walletClient, get);

      const token = getVotingTokenForChain(chainId);

      try {
        const groupedDonations = groupBy(
          donations.map((d) => ({
            ...d,
            roundId: d.roundId,
          })),
          "roundId"
        );

        get().setMaciKeyStatusForChain(chainId, ProgressStatus.IN_PROGRESS);

        const groupedKeyPairs: Record<string, GenKeyPair> = {};
        groupedKeyPairs[roundId] = await generatePubKey(
          walletClient,
          roundId,
          chainId.toString()
        );

        get().setMaciKeyStatusForChain(chainId, ProgressStatus.IS_SUCCESS);

        const groupedEncodedVotes: Record<string, string> = {};

        const groupedAmounts: Record<string, bigint> = {};
        groupedDonations[roundId].forEach((donation) => {
          groupedAmounts[roundId] =
            (groupedAmounts[roundId] || 0n) +
            parseUnits(
              (
                Number(donation.amount === "" ? "0" : donation.amount) / 1e5
              ).toString(),
              token.decimal
            );
        });

        const DonationVotesEachRound: Record<
          string,
          Record<string, bigint>
        > = {};

        const voteIdMap: { [key: string]: bigint } = {};

        for (const app of groupedDonations[roundId]) {
          const ID = (await dataLayer.getVoteOptionIndexByChainIdAndRoundId({
            chainId: chainId,
            roundId: roundId,
            recipientId: app.anchorAddress ?? ("" as string),
          })) as {
            votingIndexOptions: { optionIndex: bigint }[];
          };

          const voteOption = ID?.votingIndexOptions[0].optionIndex;

          voteIdMap[app.anchorAddress ?? ""] = voteOption;
        }

        // Process each donation
        groupedDonations[roundId].forEach((donation) => {
          const voteWeight = BigInt(
            donation.amount === "" ? "0" : donation.amount
          );

          // Ensure DonationVotesEachRound is correctly updated
          if (!DonationVotesEachRound[donation.roundId]) {
            DonationVotesEachRound[donation.roundId] = {};
          }

          DonationVotesEachRound[donation.roundId][
            voteIdMap[donation.anchorAddress ?? ""].toString()
          ] = voteWeight;
        });

        const messagesPerRound: Record<string, IPublishMessage[]> = {};
        let nonceValue = 1;

        groupedEncodedVotes[roundId] = prepareAllocationData({
          publicKey: groupedKeyPairs[roundId].pubKey,
          amount: groupedAmounts[roundId],
          proof: pcd,
        });

        const messages: IPublishMessage[] = [];

        groupedDonations[roundId].forEach((donation) => {
          messages.push({
            stateIndex: 1n,
            voteOptionIndex: BigInt(voteIdMap[donation.anchorAddress ?? ""]),
            nonce: BigInt(nonceValue++),
            newVoteWeight: bnSqrt(
              DonationVotesEachRound[roundId][
                voteIdMap[donation.anchorAddress ?? ""].toString()
              ] as bigint
            ),
          });
        });

        messagesPerRound[roundId] = messages;

        console.log("Messages", messages);

        get().setContributionStatusForChain(
          chainId,
          ProgressStatus.IN_PROGRESS
        );

        const PublishBatchArgs = await allocate({
          messages,
          walletClient,
          roundId,
          chainId,
          amount: groupedAmounts[roundId],
          bytes: groupedEncodedVotes[roundId] as Hex,
          pubKey: groupedKeyPairs[roundId].pubKey,
          privateKey: groupedKeyPairs[roundId].privKey,
        });

        get().setContributionStatusForChain(chainId, ProgressStatus.IS_SUCCESS);

        get().setVoteStatusForChain(chainId, ProgressStatus.IN_PROGRESS);

        // Publish the batch of messages
        await publishBatch(PublishBatchArgs);

        get().setVoteStatusForChain(chainId, ProgressStatus.IS_SUCCESS);

        set({
          checkedOutProjects: [...get().checkedOutProjects, ...donations],
        });

        return true;
      } catch (error) {
        let context: Record<string, unknown> = {
          chainId,
          donations,
          token,
        };

        if (error instanceof Error) {
          context = {
            ...context,
            error: error.message,
            cause: error.cause,
          };
        }

        if (!(error instanceof UserRejectedRequestError)) {
          console.error("donation error", error, context);
        }

        get().setVoteStatusForChain(chainId, ProgressStatus.IS_ERROR);
        return false;
      }
    },

    /** Checkout the given chains
     * this has the side effect of adding the chains to the wallet if they are not yet present
     * We get the data necessary to construct the votes from the cart store */
    changeDonations: async (
      chainId: ChainId,
      roundId: string,
      voiceCreditsBalance: bigint,
      walletClient: WalletClient,
      previousMessages: PCommand[],
      stateIndex: bigint,
      dataLayer: DataLayer,
      walletAddress: string
    ): Promise<boolean> => {
      const chainIdsToCheckOut = [chainId];
      get().setChainsToCheckout(
        uniq([...get().chainsToCheckout, ...chainIdsToCheckOut])
      );

      get().setIsDonationOrChangeDonationInProgress(true);

      const projectsToCheckOut = useCartStorage
        .getState()
        .userProjects[
          walletAddress
        ].filter((project) => project.chainId === chainId && project.roundId === roundId);

      const projectsByChain = { [chainId]: projectsToCheckOut };

      const getVotingTokenForChain =
        useCartStorage.getState().getVotingTokenForChain;

      const donations = projectsByChain[chainId];

      set({
        currentChainBeingCheckedOut: chainId,
      });

      await switchToChain(chainId, walletClient, get);

      const token = getVotingTokenForChain(chainId);

      try {
        get().setVoteStatusForChain(chainId, ProgressStatus.IN_PROGRESS);

        const groupedDonations = groupBy(
          donations.map((d) => ({
            ...d,
            roundId: d.roundId,
          })),
          "roundId"
        );

        const voteIdMap: { [key: string]: bigint } = {};

        const publicClient = getPublicClient({
          chainId,
        });

        const alloContractAddress = getAlloAddress(chainId);

        const [Pool] = await Promise.all([
          publicClient.readContract({
            abi: abi,
            address: alloContractAddress as Hex,
            functionName: "getPool",
            args: [BigInt(roundId)],
          }),
        ]);

        const pool = Pool as PoolInfo;
        for (const app of groupedDonations[roundId]) {
          const ID = (await dataLayer.getVoteOptionIndexByChainIdAndRoundId({
            chainId: chainId,
            roundId: roundId,
            recipientId: app.anchorAddress ?? ("" as string),
          })) as {
            votingIndexOptions: { optionIndex: bigint }[];
          };

          const voteOption = ID?.votingIndexOptions[0].optionIndex;

          voteIdMap[app.anchorAddress ?? ""] = voteOption;
        }

        get().setMaciKeyStatusForChain(chainId, ProgressStatus.IN_PROGRESS);

        const groupedKeyPairs: Record<string, GenKeyPair> = {};
        groupedKeyPairs[roundId] = await generatePubKey(
          walletClient,
          roundId,
          chainId.toString()
        );

        get().setMaciKeyStatusForChain(chainId, ProgressStatus.IS_SUCCESS);

        get().setChangeDonationsStatusForChain(
          chainId,
          ProgressStatus.IN_PROGRESS
        );

        const totalDonationAmount = donations.reduce(
          (acc, project) =>
            acc +
            parseUnits(
              project.amount === ""
                ? "0"
                : isNaN(Number(project.amount))
                  ? "0"
                  : (
                      Number(project.amount === "" ? "0" : project.amount) / 1e5
                    ).toString(),
              token.decimal
            ),
          0n
        );
        const groupedAmounts: Record<string, bigint> = {};
        groupedDonations[roundId].forEach((donation) => {
          groupedAmounts[roundId] =
            (parseUnits(donation.amount, token.decimal) / totalDonationAmount) *
            voiceCreditsBalance;
        });

        const DonationVotesEachRound: Record<
          string,
          Record<string, bigint>
        > = {};
        const SINGLEVOTE = 10n ** 5n;

        // Process each donation
        groupedDonations[roundId].forEach((donation) => {
          const donationAmount = parseUnits(donation.amount, token.decimal);

          // Calculate the vote weight
          const voteWeight = (SINGLEVOTE * donationAmount) / 10n ** 18n;

          // Ensure DonationVotesEachRound is correctly updated
          if (!DonationVotesEachRound[donation.roundId]) {
            DonationVotesEachRound[donation.roundId] = {};
          }

          DonationVotesEachRound[donation.roundId][
            voteIdMap[donation.anchorAddress ?? ""].toString()
          ] = voteWeight;
        });

        // Sort the previous messages by nonce 0 index of the array should have the max nonce
        previousMessages.sort((a, b) => {
          return a.nonce < b.nonce ? -1 : 1;
        });

        let maxNonce =
          previousMessages.length > 0
            ? previousMessages[previousMessages.length - 1].nonce
            : 1n;

        // Increment maxNonce to start from the next nonce
        if (previousMessages.length > 0) {
          maxNonce++;
        }

        const messages: IPublishMessage[] =
          previousMessages.length > 0
            ? previousMessages.map((msg) => {
                return {
                  stateIndex: stateIndex,
                  voteOptionIndex: msg.voteOptionIndex,
                  nonce: msg.nonce,
                  newVoteWeight: msg.newVoteWeight,
                };
              })
            : [];

        groupedDonations[roundId].forEach((donation) => {
          const amount = DonationVotesEachRound[roundId][
            voteIdMap[donation.anchorAddress ?? ""].toString()
          ] as bigint;
          messages.push({
            stateIndex: 1n,
            voteOptionIndex: BigInt(
              voteIdMap[donation.anchorAddress ?? ""] ?? 0n
            ),
            nonce: maxNonce,
            newVoteWeight: amount === 0n ? 0n : bnSqrt(amount),
          });
          maxNonce++;
        });

        const seen = new Set();
        const filteredMessages = messages.filter((item) => {
          if (seen.has(item.nonce)) {
            return false;
          } else {
            seen.add(item.nonce);
            return true;
          }
        });

        const pollContracts = await publicClient.readContract({
          abi: abi,
          address: pool.strategy as Hex,
          functionName: "pollContracts",
        });

        const poll = pollContracts as MACIPollContracts;

        const Messages = filteredMessages.map((message) => {
          return {
            stateIndex: stateIndex,
            voteOptionIndex: message.voteOptionIndex,
            nonce: message.nonce,
            newVoteWeight: message.newVoteWeight,
          };
        });

        console.log("Messages", Messages);

        await Promise.all([
          publishBatch({
            messages: Messages,
            Poll: poll.poll,
            publicKey: groupedKeyPairs[roundId].pubKey,
            privateKey: groupedKeyPairs[roundId].privKey,
            walletClient,
            chainId,
          }),
        ]);

        donations.forEach((donation) => {
          if (donation.amount === "0") {
            useCartStorage.getState().remove(donation);
          }
        });

        get().setChangeDonationsStatusForChain(
          chainId,
          ProgressStatus.IS_SUCCESS
        );

        set((oldState) => ({
          voteStatus: {
            ...oldState.voteStatus,
            [chainId]: ProgressStatus.IS_SUCCESS,
          },
        }));
        set({
          checkedOutProjects: [...get().checkedOutProjects, ...donations],
        });

        return true;
      } catch (error) {
        let context: Record<string, unknown> = {
          chainId,
          donations,
          token,
        };

        if (error instanceof Error) {
          context = {
            ...context,
            error: error.message,
            cause: error.cause,
          };
        }

        if (!(error instanceof UserRejectedRequestError)) {
          console.error("donation error", error, context);
        }

        get().setVoteStatusForChain(chainId, ProgressStatus.IS_ERROR);
        return false;
      }
    },
    checkedOutProjects: [],
    getCheckedOutProjects: () => {
      return get().checkedOutProjects;
    },
    setCheckedOutProjects: (newArray: CartProject[]) => {
      set({
        checkedOutProjects: newArray,
      });
    },
  }))
);

const allocate = async ({
  messages,
  walletClient,
  roundId,
  chainId,
  bytes,
  amount,
  pubKey,
  privateKey,
}: {
  messages: IPublishMessage[];
  walletClient: WalletClient;
  roundId: string;
  chainId: ChainId;
  bytes: Hex;
  amount: bigint;
  pubKey: PubKey;
  privateKey: PrivKey;
}) => {
  const publicClient = getPublicClient({
    chainId,
  });

  const alloContractAddress = getAlloAddress(chainId);

  const [Pool] = await Promise.all([
    publicClient.readContract({
      abi: abi,
      address: alloContractAddress,
      functionName: "getPool",
      args: [BigInt(roundId)],
    }),
  ]);

  const pool = Pool as PoolInfo;
  const pollContracts = await publicClient.readContract({
    abi: abi,
    address: pool.strategy as Hex,
    functionName: "pollContracts",
  });

  const poll = pollContracts as MACIPollContracts;

  const allocate = await walletClient.writeContract({
    address: alloContractAddress,
    abi: abi,
    functionName: "allocate",
    args: [BigInt(roundId), bytes],
    value: amount,
  });

  const transaction = await publicClient.waitForTransactionReceipt({
    hash: allocate,
  });

  const data = transaction.logs;

  const [stateIndex, ,] = decodeAbiParameters(
    parseAbiParameters("uint256,uint256,uint256"),
    data[0].data
  );

  const Messages = messages.map((message) => {
    return {
      stateIndex: stateIndex,
      voteOptionIndex: message.voteOptionIndex,
      nonce: message.nonce,
      newVoteWeight: message.newVoteWeight,
    };
  });
  console.log("Messages", Messages);

  return {
    messages: Messages,
    Poll: poll.poll,
    publicKey: pubKey,
    privateKey: privateKey,
    walletClient,
    chainId,
  };
};

export const publishBatch = async ({
  messages,
  Poll,
  publicKey,
  privateKey,
  walletClient,
  chainId,
}: IPublishBatchArgs) => {
  const publicClient = getPublicClient({
    chainId,
  });

  const userMaciPubKey = publicKey;

  const userMaciPrivKey = privateKey;

  const [coordinatorPubKeyResult] = await Promise.all([
    publicClient.readContract({
      abi: abi,
      address: Poll as Hex,
      functionName: "coordinatorPubKey",
    }),
  ]);

  const maxVoteOptions = 125;

  // validate the vote options index against the max leaf index on-chain
  messages.forEach(({ stateIndex, voteOptionIndex, nonce }) => {
    if (voteOptionIndex < 0 || maxVoteOptions < voteOptionIndex) {
      throw new Error("invalid vote option index");
    }

    // check < 1 cause index zero is a blank state leaf
    if (stateIndex < 1) {
      throw new Error("invalid state index");
    }

    if (nonce < 0) {
      throw new Error("invalid nonce");
    }
  });

  const coordinatorPubKey = new PubKey([
    BigInt(coordinatorPubKeyResult[0]),
    BigInt(coordinatorPubKeyResult[1]),
  ]);

  const sharedKey = Keypair.genEcdhSharedKey(
    userMaciPrivKey,
    coordinatorPubKey
  );

  const payload = messages.map(
    ({ stateIndex, voteOptionIndex, newVoteWeight, nonce }) => {
      const userSalt = genRandomSalt();

      // create the command object
      const command = new PCommand(
        stateIndex,
        userMaciPubKey,
        voteOptionIndex,
        newVoteWeight,
        nonce,
        // we only support one poll for now
        BigInt(0),
        userSalt
      );

      // sign the command with the user private key
      const signature = command.sign(userMaciPrivKey);

      const message = command.encrypt(signature, sharedKey);

      return {
        message: message.asContractParam(),
        key: userMaciPubKey.asContractParam(),
      };
    }
  );

  const preparedMessages = payload
    .map((obj) => obj.message)
    .reverse() as unknown as IMessageContractParams[];
  const preparedKeys = payload.map((obj) => obj.key) as IPubKey[];

  if (!walletClient) {
    console.log("Wallet client not found");
    return;
  }

  const hash = await walletClient.writeContract({
    address: Poll as Hex,
    abi: abi,
    functionName: "publishMessageBatch",
    args: [preparedMessages, preparedKeys],
  });
  await Promise.all([
    publicClient.waitForTransactionReceipt({
      hash: hash,
      confirmations: 1,
    }),
  ]);
};

/** This function handles switching to a chain
 * if the chain is not present in the wallet, it will add it, and then switch */
async function switchToChain(
  chainId: ChainId,
  walletClient: WalletClient,
  get: () => CheckoutState
) {
  get().setChainSwitchStatusForChain(chainId, ProgressStatus.IN_PROGRESS);
  const nextChainData = getEnabledChains().find(
    (chain) => chain.id === chainId
  );
  if (!nextChainData) {
    get().setChainSwitchStatusForChain(chainId, ProgressStatus.IS_ERROR);
    throw "next chain not found";
  }
  try {
    /* Try switching normally */
    await walletClient.switchChain({
      id: chainId,
    });
  } catch (e) {
    if (e instanceof UserRejectedRequestError) {
      console.log("Rejected!");
      get().setChainSwitchStatusForChain(chainId, ProgressStatus.IS_ERROR);
      return;
    } else if (e instanceof SwitchChainError || e instanceof InternalRpcError) {
      console.log("Chain not added yet, adding", { e });
      /** Chain might not be added in wallet yet. Request to add it to the wallet */
      try {
        await walletClient.addChain({
          chain: {
            id: nextChainData.id,
            name: nextChainData.name,
            network: nextChainData.network,
            nativeCurrency: nextChainData.nativeCurrency,
            rpcUrls: nextChainData.rpcUrls,
            blockExplorers: nextChainData.blockExplorers,
          },
        });
      } catch (e) {
        get().setChainSwitchStatusForChain(chainId, ProgressStatus.IS_ERROR);
        return;
      }
    } else {
      console.log("unhandled error when switching chains", { e });
      get().setChainSwitchStatusForChain(chainId, ProgressStatus.IS_ERROR);
      return;
    }
  }
  get().setChainSwitchStatusForChain(chainId, ProgressStatus.IS_SUCCESS);
}
