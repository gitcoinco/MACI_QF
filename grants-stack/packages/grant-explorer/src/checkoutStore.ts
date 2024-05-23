/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { CartProject, ProgressStatus } from "./features/api/types";
import { Allo, ChainId } from "common";
import { useCartStorage } from "./store";
import {
  Hex,
  InternalRpcError,
  parseAbi,
  parseUnits,
  SwitchChainError,
  UserRejectedRequestError,
  zeroAddress,
} from "viem";
import {
  encodeQFVotes,
  encodedQFAllocation,
  signPermit2612,
  signPermitDai,
  Keypair as GenKeyPair,
  prepareAllocationData,
  bnSqrt,
} from "./features/api/voting";
import { groupBy, round, uniq } from "lodash-es";
import { getEnabledChains } from "./app/chainConfig";
import { WalletClient, PublicClient } from "wagmi";
import { getContract, getPublicClient } from "@wagmi/core";
import { getPermitType } from "common/dist/allo/voting";
import { MRC_CONTRACTS } from "common/dist/allo/addresses/mrc";
import { getConfig } from "common/src/config";
import { DataLayer } from "data-layer";

// NEW CODE
import { Keypair, PCommand, PubKey, PrivKey } from "maci-domainobjs";
import { genRandomSalt } from "maci-crypto";

type ChainMap<T> = Record<ChainId, T>;

const isV2 = getConfig().allo.version === "allo-v2";
interface CheckoutState {
  permitStatus: ChainMap<ProgressStatus>;
  setPermitStatusForChain: (
    chain: ChainId,
    permitStatus: ProgressStatus
  ) => void;
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
    chainsToCheckout: { chainId: ChainId; permitDeadline: number }[],
    walletClient: WalletClient,
    pcd?: string
  ) => Promise<void>;
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

export const useCheckoutStore = create<CheckoutState>()(
  devtools((set, get) => ({
    permitStatus: defaultProgressStatusForAllChains,
    setPermitStatusForChain: (chain: ChainId, permitStatus: ProgressStatus) =>
      set((oldState) => ({
        permitStatus: { ...oldState.permitStatus, [chain]: permitStatus },
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
    /** Checkout the given chains
     * this has the side effect of adding the chains to the wallet if they are not yet present
     * We get the data necessary to construct the votes from the cart store */
    checkoutMaci: async (
      chainsToCheckout: { chainId: ChainId; permitDeadline: number }[],
      walletClient: WalletClient,
      pcd?: string
    ) => {
      const chainIdsToCheckOut = chainsToCheckout.map((chain) => chain.chainId);
      get().setChainsToCheckout(
        uniq([...get().chainsToCheckout, ...chainIdsToCheckOut])
      );
      const projectsToCheckOut = useCartStorage
        .getState()
        .projects.filter((project) =>
          chainIdsToCheckOut.includes(project.chainId)
        );

      const projectsByChain = groupBy(projectsToCheckOut, "chainId") as {
        [chain: number]: CartProject[];
      };

      const getVotingTokenForChain =
        useCartStorage.getState().getVotingTokenForChain;

      const totalDonationPerChain = Object.fromEntries(
        Object.entries(projectsByChain).map(([key, value]) => [
          Number(key) as ChainId,
          value
            .map((project) => project.amount)
            .reduce(
              (acc, amount) =>
                acc +
                parseUnits(
                  amount ? amount : "0",
                  getVotingTokenForChain(Number(key) as ChainId).decimal
                ),
              0n
            ),
        ])
      );

      /* Main chain loop */
      for (const currentChain of chainsToCheckout) {
        const chainId = currentChain.chainId;
        const deadline = currentChain.permitDeadline;
        const donations = projectsByChain[chainId];

        set({
          currentChainBeingCheckedOut: chainId,
        });

        /* Switch to the current chain */
        await switchToChain(chainId, walletClient, get);

        const token = getVotingTokenForChain(chainId);

        let sig;
        let nonce;

        if (token.address !== zeroAddress) {
          /* Need permit */
          try {
            get().setPermitStatusForChain(chainId, ProgressStatus.IN_PROGRESS);

            const owner = walletClient.account.address;
            /* Get nonce and name from erc20 contract */
            const erc20Contract = getContract({
              address: token.address as Hex,
              abi: parseAbi([
                "function nonces(address) public view returns (uint256)",
                "function name() public view returns (string)",
              ]),
              walletClient,
              chainId,
            });
            nonce = await erc20Contract.read.nonces([owner]);
            const tokenName = await erc20Contract.read.name();
            if (getPermitType(token) === "dai") {
              sig = await signPermitDai({
                walletClient: walletClient,
                spenderAddress: MRC_CONTRACTS[chainId],
                chainId,
                deadline: BigInt(deadline),
                contractAddress: token.address,
                erc20Name: tokenName,
                ownerAddress: owner,
                nonce,
                permitVersion: token.permitVersion ?? "1",
              });
            } else {
              sig = await signPermit2612({
                walletClient: walletClient,
                value: totalDonationPerChain[chainId],
                spenderAddress: MRC_CONTRACTS[chainId],
                nonce,
                chainId,
                deadline: BigInt(deadline),
                contractAddress: token.address,
                erc20Name: tokenName,
                ownerAddress: owner,
                permitVersion: token.permitVersion ?? "1",
              });
            }

            get().setPermitStatusForChain(chainId, ProgressStatus.IS_SUCCESS);
          } catch (e) {
            if (!(e instanceof UserRejectedRequestError)) {
              console.error("permit error", e, {
                donations,
                chainId,
                tokenAddress: token.address,
              });
            }
            get().setPermitStatusForChain(chainId, ProgressStatus.IS_ERROR);
            return;
          }

          if (!sig) {
            get().setPermitStatusForChain(chainId, ProgressStatus.IS_ERROR);
            return;
          }
        } else {
          /** When voting via native token, we just set the permit status to success */
          get().setPermitStatusForChain(chainId, ProgressStatus.IS_SUCCESS);
        }

        try {
          get().setVoteStatusForChain(chainId, ProgressStatus.IN_PROGRESS);

          /* Group donations by round */
          const groupedDonations = groupBy(
            donations.map((d) => ({
              ...d,
              roundId: d.roundId,
            })),
            "roundId"
          );

          const groupedKeyPairs: Record<string, GenKeyPair> = {};

          for (const roundId in groupedDonations) {
            groupedKeyPairs[roundId] = await generatePubKey(
              walletClient,
              "maciParams",
              chainId.toString()
            );
          }

          const groupedEncodedVotes: Record<string, Hex> = {};

          const groupedAmounts: Record<string, bigint> = {};
          for (const roundId in groupedDonations) {
            groupedDonations[roundId].map((donation) => {
              groupedAmounts[roundId] = groupedDonations[roundId].reduce(
                (acc, donation) =>
                  acc + BigInt(Number(donation.amount) * 1000) * BigInt(10) ** BigInt(15),
                0n
              );
            });
          }

          // Calculate for each round the allocated percentage in each donation

          const DonationVotesEachRound: Record<
            string,
            Record<string, bigint>
          > = {};

          console.log("groupedDonations", groupedAmounts);
          const SINGLEVOTE = 10n ** 5n;

          for (const roundId in groupedDonations) {
            groupedDonations[roundId].map((donation) => {
              DonationVotesEachRound[donation.roundId] = {
                [donation.applicationIndex]:
                  (BigInt(Number(donation.amount) *1000) * 10n ** 15n * SINGLEVOTE) /
                  groupedAmounts[roundId],
              };
            });
            console.log("DonationVotesEachRound", DonationVotesEachRound);
          }

          const messagesPerRound: Record<string, IPublishMessage[]> = {};
          for (const roundId in groupedDonations) {
            let nonce = 0;

            groupedEncodedVotes[roundId] = await prepareAllocationData({
              publicKey: groupedKeyPairs[roundId].pubKey,
              amount: (1n * 10n ** 18n) / 100n,
              proof: pcd,
            });

            console.log(
              "groupedEncodedVotes[roundId]",
              groupedEncodedVotes[roundId]
            );
            const messages: IPublishMessage[] = [];
            groupedDonations[roundId].map((donation) => {
              const message = {
                // must be fixed this need to be taken from the events
                stateIndex: 1n,
                voteOptionIndex: BigInt(donation.applicationIndex),
                nonce: BigInt(0),
                newVoteWeight: bnSqrt(SINGLEVOTE / 200n),
              };
              const message2 = {
                // must be fixed this need to be taken from the events
                stateIndex: 2n,
                voteOptionIndex: BigInt(donation.applicationIndex + 1),
                nonce: BigInt(1),
                newVoteWeight: bnSqrt(SINGLEVOTE / 200n),
              };
              messages.push(message);
              messages.push(message2);

              nonce++;
            });
            messagesPerRound[roundId] = messages;
          }

          const amountArray: bigint[] = [];
          for (const roundId in groupedDonations) {
            groupedDonations[roundId].map((donation) => {
              amountArray.push(parseUnits(donation.amount, token.decimal));
            });
          }

          for (const roundId in groupedDonations) {
            const messages = messagesPerRound[roundId];
            console.log(
              "groupedKeyPairs[roundId].pubKey",
              groupedKeyPairs[roundId].pubKey.asContractParam()
            );
            await allocate({
              messages,
              walletClient,
              roundId,
              chainId,
              bytes: groupedEncodedVotes[roundId],
              pubKey: groupedKeyPairs[roundId].pubKey,
              privateKey: groupedKeyPairs[roundId].privKey,
            });
          }

          // if (receipt.status === "reverted") {
          //   throw new Error("donate transaction reverted", {
          //     cause: { receipt },
          //   });
          // }

          /* Remove checked out projects from cart */
          donations.forEach((donation) => {
            useCartStorage.getState().remove(donation);
          });
          set((oldState) => ({
            voteStatus: {
              ...oldState.voteStatus,
              [chainId]: ProgressStatus.IS_SUCCESS,
            },
          }));
          set({
            checkedOutProjects: [...get().checkedOutProjects, ...donations],
          });
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

          // do not log user rejections
          if (!(error instanceof UserRejectedRequestError)) {
            console.error("donation error", error, context);
          }

          get().setVoteStatusForChain(chainId, ProgressStatus.IS_ERROR);
          throw error;
        }
      }
      /* End main chain loop*/
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

// NEW CODE

/**
 * Interface that represents user publish message
 */
export interface IPublishMessage {
  /**
   * The index of the state leaf
   */
  stateIndex: bigint;

  /**
   * The index of the vote option
   */
  voteOptionIndex: bigint;

  /**
   * The nonce of the message
   */
  nonce: bigint;

  /**
   * The new vote weight
   */
  newVoteWeight: bigint;
}

/**
 * Interface for the arguments to the batch publish command
 */
export interface IPublishBatchArgs {
  /**
   * User messages
   */
  messages: IPublishMessage[];

  /**
   * The address of the MACI contract
   */
  Poll: string;

  /**
   * The public key of the user
   */
  publicKey: PubKey;

  /**
   * The private key of the user
   */

  privateKey: PrivKey;

  /**
   * A signer object
   */
  walletClient: WalletClient;

  /**
   * The chain id
   */
  chainId: ChainId;
}

export const generatePubKey = async (
  walletClient: WalletClient,
  Poll: string,
  chainID: string
) => {
  const signature = await walletClient.signMessage({
    message: `Sign this message to get your public key for MACI voting on Allo for the round with address ${Poll} on chain ${chainID}`,
  });

  const getUserPubKey = GenKeyPair.createFromSeed(signature);

  return getUserPubKey;
};

const allocate = async ({
  messages,
  walletClient,
  roundId,
  chainId,
  bytes,
  pubKey,
  privateKey,
  witness,
}: {
  messages: IPublishMessage[];
  walletClient: WalletClient;
  roundId: string;
  chainId: ChainId;
  bytes: Hex;
  pubKey: PubKey;
  privateKey: PrivKey;
  witness?: {
    _pA: string[];
    _pB: string[][];
    _pC: string[];
    _pubSignals: bigint[];
  };
}) => {
  const publicClient = getPublicClient({
    chainId,
  });

  //   struct Pool {
  //     bytes32 profileId;
  //     IStrategy strategy;
  //     address token;
  //     Metadata metadata;
  //     bytes32 managerRole;
  //     bytes32 adminRole;
  // }

  const abi = parseAbi([
    "function getPool(uint256) view returns ((bytes32 profileId, address strategy, address token, (uint256,string) metadata, bytes32 managerRole, bytes32 adminRole))",
    "function _pollContracts() view returns ((address poll, address messageProcessor,address tally,address subsidy))",
    "function coordinatorPubKey() view returns (uint256 x, uint256 y)",
    "function allocate(uint256, bytes) external payable",
  ]);

  const alloContractAddress = "0x1133ea7af70876e64665ecd07c0a0476d09465a1";

  const [Pool] = await Promise.all([
    publicClient.readContract({
      abi: abi,
      address: alloContractAddress as Hex,
      functionName: "getPool",
      args: [BigInt(roundId)],
    }),
  ]);

  const pool = Pool as {
    profileId: string;
    strategy: string;
    token: string;
    metadata: [bigint, string];
    managerRole: string;
    adminRole: string;
  };
  console.log("pool", pool.strategy);

  const pollContracts = await publicClient.readContract({
    abi: abi,
    address: pool.strategy as Hex,
    functionName: "_pollContracts",
  });

  const poll = pollContracts as {
    poll: string;
    messageProcessor: string;
    tally: string;
    subsidy: string;
  };
  console.log("poll", roundId, poll.poll);

  console.log("bytes", bytes);

  const value = (1n * 10n ** 18n) / 100n;
  const allocate = await walletClient.writeContract({
    address: alloContractAddress as Hex,
    abi: abi,
    functionName: "allocate",
    args: [BigInt(roundId), bytes],
    value: value as bigint,
    // gasLimit: 1000000,
  });

  console.log("Transaction Sent");
  // const transaction = await publicClient.waitForTransactionReceipt({
  //   hash: allocate,
  // });

  console.log("Transaction Mined");

  // Publish the batch of messages
  await publishBatch({
    messages,
    Poll: poll.poll,
    publicKey: pubKey,
    privateKey: privateKey,
    walletClient,
    chainId,
  });
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

  //   function publishMessageBatch(
  //     Message[] calldata _messages,
  //     PubKey[] calldata _encPubKeys
  // )

  // uint8 public constant MESSAGE_DATA_LENGTH = 10;

  // /// @title Message
  // /// @notice this struct represents a MACI message
  // /// @dev msgType: 1 for vote message, 2 for topup message (size 2)
  // struct Message {
  //   uint256 msgType;
  //   uint256[MESSAGE_DATA_LENGTH] data;
  // }

  const abi = parseAbi([
    "function publishMessageBatch((uint256 msgType,uint256[10] data)[] _messages,(uint256 x,uint256 y)[] _pubKeys)",
    "function publishMessageBatch((uint256,uint256[10])[] _messages,(uint256,uint256 )[])",

    "function maxValues() view returns (uint256 maxVoteOptions)",
    "function coordinatorPubKey() view returns ((uint256 x, uint256 y))",
  ]);

  const [maxValues, coordinatorPubKeyResult] = await Promise.all([
    publicClient.readContract({
      abi: abi,
      address: Poll as Hex,
      functionName: "maxValues",
    }),
    publicClient.readContract({
      abi: abi,
      address: Poll as Hex,
      functionName: "coordinatorPubKey",
    }),
  ]);

  const maxoptions = maxValues as bigint;

  const maxVoteOptions = Number(maxoptions);

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

  const pubKey = coordinatorPubKeyResult as { x: bigint; y: bigint };
  const coordinatorPubKey = new PubKey([
    BigInt(pubKey?.x.toString()),
    BigInt(pubKey?.y.toString()),
  ]);

  const encryptionKeypair = new Keypair();
  const sharedKey = Keypair.genEcdhSharedKey(
    encryptionKeypair.privKey,
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
        key: encryptionKeypair.pubKey.asContractParam(),
      };
    }
  );
  interface IPubKey {
    x: bigint;
    y: bigint;
  }

  interface IMessageContractParams {
    msgType: bigint;
    data: readonly [
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
    ];
  }
  const preparedMessages = payload
    .map((obj) => obj.message)
    .reverse() as unknown as IMessageContractParams[];
  const preparedKeys = payload
    .map((obj) => obj.key)
    .reverse() as unknown as IPubKey[];

  console.log("preparedMessages", preparedMessages);
  console.log("preparedKeys", preparedKeys);

  if (!walletClient) {
    console.log("Wallet client not found");
    return;
  }
  console.log("Poll", Poll);

  const hash = await walletClient.writeContract({
    address: Poll as Hex,
    abi: abi,
    functionName: "publishMessageBatch",
    args: [preparedMessages, preparedKeys],
  });
  console.log("Transaction Sent");
  const transaction = await publicClient.waitForTransactionReceipt({
    hash: hash,
  });
};
