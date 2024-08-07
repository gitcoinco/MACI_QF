import {
  AlloAbi,
  Allo as AlloV2Contract,
  CreateProfileArgs,
  DirectGrantsStrategy,
  DonationVotingMerkleDistributionDirectTransferStrategyAbi,
  DonationVotingMerkleDistributionStrategy,
  Registry,
  RegistryAbi,
  TransactionData,
} from "@allo-team/allo-v2-sdk";
import MRC_ABI from "../abis/allo-v1/multiRoundCheckout";
import MACIQF from "../abis/allo-v2/MACIQF";
import { MRC_CONTRACTS } from "../addresses/mrc";
import { CreatePoolArgs, NATIVE } from "@allo-team/allo-v2-sdk/dist/types";
import { encodeAbiParameters, parseAbiParameters } from "viem";

import {
  ApplicationStatus,
  DistributionMatch,
  RoundApplicationAnswers,
  RoundCategory,
} from "data-layer";
import { Abi, Address, Hex, PublicClient, getAddress, zeroAddress } from "viem";
import { AnyJson, ChainId } from "../..";
import { UpdateRoundParams, MatchingStatsData, VotingToken } from "../../types";
import { Allo, AlloError, AlloOperation, CreateRoundArguments } from "../allo";
import { Result, dateToEthereumTimestamp, error, success } from "../common";
import { WaitUntilIndexerSynced } from "../indexer";
import { IpfsUploader } from "../ipfs";
import {
  TransactionReceipt,
  TransactionSender,
  decodeEventFromReceipt,
  sendRawTransaction,
  sendTransaction,
} from "../transaction-sender";
import { PermitSignature, getPermitType } from "../voting";
import Erc20ABI from "../abis/erc20";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { buildUpdatedRowsOfApplicationStatuses } from "../application";
import { generateMerkleTree } from "./allo-v1";
import { BigNumber, ethers, utils } from "ethers";
import { PubKey } from "maci-domainobjs";

function getStrategyAddress(strategy: RoundCategory, chainId: ChainId): string {
  let strategyAddresses;
  switch (chainId) {
    case ChainId.SEPOLIA: {
      strategyAddresses = {
        [RoundCategory.QuadraticFunding]:
          "0x000000000000000000000000000000000000000",
        [RoundCategory.Direct]: "0x000000000000000000000000000000000000000",
        [RoundCategory.Maci]: "0xB84be727Ff04B64D5f85e0a669Af0ef8e14f530B",
      };
      break;
    }

    case ChainId.SCROLL: {
      strategyAddresses = {
        [RoundCategory.QuadraticFunding]:
          "0x000000000000000000000000000000000000000",
        [RoundCategory.Direct]: "0x000000000000000000000000000000000000000",
        [RoundCategory.Maci]: "0x0A6fFd2e74FC582C17b3bD10b8102E61D07Cf298",
      };
      break;
    }

    case ChainId.OPTIMISM_MAINNET_CHAIN_ID: {
      strategyAddresses = {
        [RoundCategory.QuadraticFunding]:
          "0x000000000000000000000000000000000000000",
        [RoundCategory.Direct]: "0x000000000000000000000000000000000000000",
        [RoundCategory.Maci]: "0xe398E980D7e3D4700c31DC3280F229Edc63d093B",
      };
      break;
    }

    default:
      throw new Error(`Unsupported chain ID ${chainId}`);
  }
  return strategyAddresses[strategy];
}

export const getClonableMACIFactoryAddress = (chainId: ChainId): Hex => {
  switch (chainId) {
    case ChainId.SEPOLIA:
      return getAddress("0x272DfA1B365E4e72690F834c6e0a2823Fa5120e5");
    case ChainId.SCROLL:
      return getAddress("0x474C223EBBCbBba7E2F932c52fbd80514E9382dB");
    case ChainId.OPTIMISM_MAINNET_CHAIN_ID:
      return getAddress("0xF96c6cDBDd44a67057FE9Ee0B4eeC3285D0152bE");
    default:
      throw new Error(`Unsupported chain ID ${chainId}`);
  }
};

export const getZuPassRegistryAddress = (chainId: ChainId): Hex => {
  switch (chainId) {
    case ChainId.SEPOLIA:
      return getAddress("0x455cC27badb067cb9b7cdE52F153DfebC83B1A99");
    case ChainId.SCROLL:
      return getAddress("0x70FafcC2b1746f017018BE92D3f5856d68246037");
    case ChainId.OPTIMISM_MAINNET_CHAIN_ID:
      return getAddress("0x23d30F882bfD42eDD566e5b5a556d09504ce8a32");
    default:
      throw new Error(`Unsupported chain ID ${chainId}`);
  }
};

const NonAllowlistGatingAddress = getAddress(zeroAddress);

function applicationStatusToNumber(status: ApplicationStatus) {
  switch (status) {
    case "PENDING":
    case "IN_REVIEW":
      return 1n;
    case "APPROVED":
      return 2n;
    case "REJECTED":
      return 3n;
    default:
      throw new Error(`Unknown status ${status}`);
  }
}

export function getAlloAddress(chainId: ChainId) {
  const allo = new AlloV2Contract({
    chain: chainId,
  });
  return allo.address();
}

export class AlloV2 implements Allo {
  private transactionSender: TransactionSender;
  private ipfsUploader: IpfsUploader;
  private waitUntilIndexerSynced: WaitUntilIndexerSynced;
  private chainId: number;
  private registry: Registry;
  private allo: AlloV2Contract;

  constructor(args: {
    chainId: number;
    transactionSender: TransactionSender;
    ipfsUploader: IpfsUploader;
    waitUntilIndexerSynced: WaitUntilIndexerSynced;
  }) {
    this.chainId = args.chainId;
    this.transactionSender = args.transactionSender;
    this.ipfsUploader = args.ipfsUploader;
    this.waitUntilIndexerSynced = args.waitUntilIndexerSynced;

    this.registry = new Registry({
      chain: this.chainId,
    });
    this.allo = new AlloV2Contract({
      chain: this.chainId,
    });
  }

  async donate(
    publicClient: PublicClient,
    chainId: ChainId,
    token: VotingToken,
    groupedVotes: Record<string, Hex[]>,
    groupedAmounts: Record<string, bigint> | bigint[],
    nativeTokenAmount: bigint,
    permit?: {
      sig: PermitSignature;
      deadline: number;
      nonce: bigint;
    }
  ) {
    let tx: Result<Hex>;
    const mrcAddress = MRC_CONTRACTS[chainId];

    const poolIds = Object.keys(groupedVotes).flatMap((key) => {
      const count = groupedVotes[key].length;
      return new Array(count).fill(key);
    });

    const data = Object.values(groupedVotes).flat();

    /* decide which function to use based on whether token is native, permit-compatible or DAI */
    if (token.address === zeroAddress || token.address === NATIVE) {
      tx = await sendTransaction(this.transactionSender, {
        address: mrcAddress,
        abi: MRC_ABI,
        functionName: "allocate",
        args: [poolIds, Object.values(groupedAmounts), data],
        value: nativeTokenAmount,
      });
    } else if (permit) {
      if (getPermitType(token) === "dai") {
        tx = await sendTransaction(this.transactionSender, {
          address: mrcAddress,
          abi: MRC_ABI,
          functionName: "allocateDAIPermit",
          args: [
            data,
            poolIds,
            Object.values(groupedAmounts),
            Object.values(groupedAmounts).reduce((acc, b) => acc + b),
            token.address as Hex,
            BigInt(permit.deadline ?? Number.MAX_SAFE_INTEGER),
            permit.nonce,
            permit.sig.v,
            permit.sig.r as Hex,
            permit.sig.s as Hex,
          ],
        });
      } else {
        tx = await sendTransaction(this.transactionSender, {
          address: mrcAddress,
          abi: MRC_ABI,
          functionName: "allocateERC20Permit",
          args: [
            data,
            poolIds,
            Object.values(groupedAmounts),
            Object.values(groupedAmounts).reduce((acc, b) => acc + b),
            token.address as Hex,
            BigInt(permit.deadline ?? Number.MAX_SAFE_INTEGER),
            permit.sig.v,
            permit.sig.r as Hex,
            permit.sig.s as Hex,
          ],
        });
      }
    } else {
      /* Tried voting using erc-20 but no permit signature provided */
      throw new AlloError(
        "Tried voting using erc-20 but no permit signature provided"
      );
    }

    if (tx.type === "success") {
      const receipt = await this.transactionSender.wait(
        tx.value,
        60_000,
        publicClient
      );
      return receipt;
    } else {
      throw tx.error;
    }
  }

  createProject(args: {
    name: string;
    metadata: AnyJson;
    memberAddresses: Address[];
    nonce?: bigint;
  }): AlloOperation<
    Result<{ projectId: Hex }>,
    {
      ipfs: Result<string>;
      transaction: Result<Hex>;
      transactionStatus: Result<TransactionReceipt>;
      indexingStatus: Result<void>;
    }
  > {
    return new AlloOperation(async ({ emit }) => {
      /** upload metadata to IPFS */
      const ipfsResult = await this.ipfsUploader(args.metadata);

      emit("ipfs", ipfsResult);

      if (ipfsResult.type === "error") {
        return ipfsResult;
      }

      const profileNonce = args.nonce
        ? args.nonce
        : BigInt(Math.floor(Math.random() * 1000000) + 1000000);

      const senderAddress = await this.transactionSender.address();

      const createProfileData: CreateProfileArgs = {
        nonce: BigInt(profileNonce),
        name: args.name,
        metadata: {
          protocol: 1n,
          pointer: ipfsResult.value,
        },
        owner: senderAddress,
        members: args.memberAddresses.filter(
          (address) => address !== senderAddress
        ),
      };

      const txCreateProfile: TransactionData =
        this.registry.createProfile(createProfileData);

      /** send transaction to create project */
      const txResult = await sendRawTransaction(this.transactionSender, {
        to: txCreateProfile.to,
        data: txCreateProfile.data,
        value: BigInt(txCreateProfile.value),
      });

      emit("transaction", txResult);

      if (txResult.type === "error") {
        return txResult;
      }

      /** wait for transaction to be mined */
      let receipt: TransactionReceipt;

      try {
        receipt = await this.transactionSender.wait(txResult.value);

        emit("transactionStatus", success(receipt));
      } catch (err) {
        const result = new AlloError("Failed to create project");
        emit("transactionStatus", error(result));
        return error(result);
      }

      await this.waitUntilIndexerSynced({
        chainId: this.chainId,
        blockNumber: receipt.blockNumber,
      });

      emit("indexingStatus", success(void 0));

      const projectCreatedEvent = decodeEventFromReceipt({
        abi: RegistryAbi as Abi,
        receipt,
        event: "ProfileCreated",
      }) as { profileId: Hex };

      return success({
        projectId: projectCreatedEvent.profileId,
      });
    });
  }

  createProgram(args: {
    name: string;
    memberAddresses: Address[];
  }): AlloOperation<
    Result<{ programId: Hex }>,
    {
      ipfs: Result<string>;
      transaction: Result<Hex>;
      transactionStatus: Result<TransactionReceipt>;
      indexingStatus: Result<void>;
    }
  > {
    return this.createProject({
      name: args.name,
      metadata: {
        type: "program",
        name: args.name,
      },
      memberAddresses: args.memberAddresses,
    }).map((result) => {
      if (result.type === "success") {
        return success({
          programId: result.value.projectId,
        });
      }

      return result;
    });
  }

  updateProjectMetadata(args: {
    projectId: Hex;
    metadata: AnyJson;
  }): AlloOperation<
    Result<{ projectId: Hex }>,
    {
      ipfs: Result<string>;
      transaction: Result<Hex>;
      transactionStatus: Result<TransactionReceipt>;
      indexingStatus: Result<void>;
    }
  > {
    return new AlloOperation(async ({ emit }) => {
      const projectId = args.projectId;

      /** upload metadata to IPFS */
      const ipfsResult = await this.ipfsUploader(args.metadata);

      emit("ipfs", ipfsResult);

      if (ipfsResult.type === "error") {
        return ipfsResult;
      }

      const data = {
        profileId: projectId,
        metadata: {
          protocol: 1n,
          pointer: ipfsResult.value,
        },
      };

      const txUpdateProfile: TransactionData =
        this.registry.updateProfileMetadata(data);

      /** send transaction to create project */
      const txResult = await sendRawTransaction(this.transactionSender, {
        to: txUpdateProfile.to,
        data: txUpdateProfile.data,
        value: BigInt(txUpdateProfile.value),
      });

      emit("transaction", txResult);

      if (txResult.type === "error") {
        return txResult;
      }

      /** wait for transaction to be mined */
      let receipt: TransactionReceipt;

      try {
        receipt = await this.transactionSender.wait(txResult.value);

        emit("transactionStatus", success(receipt));
      } catch (err) {
        const result = new AlloError("Failed to update project metadata");
        emit("transactionStatus", error(result));
        return error(result);
      }

      await this.waitUntilIndexerSynced({
        chainId: this.chainId,
        blockNumber: receipt.blockNumber,
      });

      emit("indexingStatus", success(void 0));

      return success({
        projectId: projectId,
      });
    });
  }

  acceptProjectOwnership(args: { projectId: Hex }): AlloOperation<
    Result<{ projectId: Hex }>,
    {
      ipfs: Result<string>;
      transaction: Result<Hex>;
      transactionStatus: Result<TransactionReceipt>;
      indexingStatus: Result<void>;
    }
  > {
    return new AlloOperation(async ({ emit }) => {
      const projectId = args.projectId;

      const txUpdateProfile: TransactionData =
        this.registry.acceptProfileOwnership(projectId);

      /** send transaction to create project */
      const txResult = await sendRawTransaction(this.transactionSender, {
        to: txUpdateProfile.to,
        data: txUpdateProfile.data,
        value: BigInt(0),
      });

      emit("transaction", txResult);

      if (txResult.type === "error") {
        return txResult;
      }

      /** wait for transaction to be mined */
      let receipt: TransactionReceipt;

      try {
        receipt = await this.transactionSender.wait(txResult.value);

        emit("transactionStatus", success(receipt));
      } catch (err) {
        const result = new AlloError("Failed to update project metadata");
        emit("transactionStatus", error(result));
        return error(result);
      }

      await this.waitUntilIndexerSynced({
        chainId: this.chainId,
        blockNumber: receipt.blockNumber,
      });

      emit("indexingStatus", success(void 0));

      return success({
        projectId: projectId,
      });
    });
  }

  createRound(args: CreateRoundArguments): AlloOperation<
    Result<{ roundId: Hex }>,
    {
      ipfsStatus: Result<string>;
      transaction: Result<Hex>;
      transactionStatus: Result<TransactionReceipt>;
      indexingStatus: Result<void>;
    }
  > {
    return new AlloOperation(async ({ emit }) => {
      const roundIpfsResult = await this.ipfsUploader({
        round: args.roundData.roundMetadataWithProgramContractAddress,
        application: args.roundData.applicationQuestions,
      });

      emit("ipfsStatus", roundIpfsResult);

      if (roundIpfsResult.type === "error") {
        return roundIpfsResult;
      }

      const token: Address = getAddress(NATIVE);

      const initStrategyData = [
        true,
        true,
        dateToEthereumTimestamp(args.roundData.applicationsStartTime), // in seconds, must be in future
        dateToEthereumTimestamp(args.roundData.applicationsEndTime), // in seconds, must be after registrationStartTime
        dateToEthereumTimestamp(args.roundData.roundStartTime), // in seconds, must be after registrationStartTime
        dateToEthereumTimestamp(args.roundData.roundEndTime), // in seconds, must be after allocationStartTime
      ];

      const CoordinatorKeypair =
        args.roundData.roundMetadataWithProgramContractAddress?.maciParameters
          ?.coordinatorKeyPair;

      const pubk = PubKey.deserialize(CoordinatorKeypair as string);

      const coordinator = getAddress(
        args.roundData.roundMetadataWithProgramContractAddress?.maciParameters
          ?.coordinatorAddress as string
      ) as Address;

      const validObjEventIDs =
        args.roundData.roundMetadataWithProgramContractAddress?.maciParameters
          ?.validEventIDs;

      const maxContributionAmountAllowlisted = BigInt(
        Number(
          args.roundData.roundMetadataWithProgramContractAddress?.maciParameters
            ?.maxContributionAmountAllowlisted
        ) *
          10 ** 18
      );

      const maxContributionAmountNonAllowlisted = BigInt(
        Number(
          args.roundData.roundMetadataWithProgramContractAddress?.maciParameters
            ?.maxContributionAmountNonAllowlisted
        ) *
          10 ** 18
      );

      const array = validObjEventIDs
        ? validObjEventIDs.map((eventId) => BigInt(eventId.eventID))
        : [];

      // Choose only the unique event IDs create a map and then convert it to an array again
      const eventIDs = Array.from(new Set(array));

      const allowlistGatingContractInitData =
        new ethers.utils.AbiCoder().encode(["uint256[]"], [eventIDs]);

      // In the future we might support more than one MACI instance
      const maciID = 0n;

      const MaciParams = [
        // coordinator:
        coordinator,
        // coordinatorPubKey:
        [BigInt(pubk.asContractParam().x), BigInt(pubk.asContractParam().y)],
        getClonableMACIFactoryAddress(this.chainId),
        // Allowlist gating verifier address
        getZuPassRegistryAddress(this.chainId),
        // Non-allowlist gating verifier address
        NonAllowlistGatingAddress,
        // maci_id
        maciID,
        // AllowlistGatingContractInitData
        allowlistGatingContractInitData,
        // NonAllowlistGatingContractInitData
        "0x00",
        // maxContributionAmountForZupass
        maxContributionAmountAllowlisted,
        // maxContributionAmountForNonZupass
        maxContributionAmountNonAllowlisted,
      ];

      const initStruct = [initStrategyData, MaciParams];

      const types = parseAbiParameters(
        "((bool,bool,uint256,uint256,uint256,uint256),(address,(uint256,uint256),address,address,address,uint8,bytes,bytes,uint256,uint256))"
      );

      const encoded: `0x${string}` = encodeAbiParameters(types, [
        initStruct,
      ] as any);

      const initStrategyDataEncoded = encoded ?? "0x";

      const profileId = args.roundData.roundMetadataWithProgramContractAddress
        ?.programContractAddress as `0x${string}`;

      if (!profileId || !profileId.startsWith("0x")) {
        throw new Error("Program contract address is required");
      }

      const managersSet = new Set(
        args.roundData.roundOperators.map((address) => getAddress(address))
      );
      managersSet.add(coordinator);

      const managers = Array.from(managersSet);

      const createPoolArgs: CreatePoolArgs = {
        profileId: profileId as Hex,
        strategy: getStrategyAddress(
          args.roundData.roundCategory,
          this.chainId
        ),
        initStrategyData: initStrategyDataEncoded,
        token,
        amount: 0n, // we send 0 tokens to the pool, we fund it later
        metadata: { protocol: 1n, pointer: roundIpfsResult.value },
        managers: managers as Address[],
      };

      const txData = this.allo.createPool(createPoolArgs);

      let txResult;
      try {
        txResult = await sendRawTransaction(this.transactionSender, {
          to: txData.to,
          data: txData.data,
          value: BigInt(txData.value),
        });

        emit("transaction", txResult);

        if (txResult.type === "error") {
          return txResult;
        }
      } catch (err) {
        const result = new AlloError("Failed to create Pool", err);
        emit("transaction", error(result));
        return error(result);
      }

      // --- wait for transaction to be mined
      let receipt: TransactionReceipt;
      let poolCreatedEvent;

      try {
        receipt = await this.transactionSender.wait(txResult.value);

        poolCreatedEvent = decodeEventFromReceipt({
          abi: AlloAbi as Abi,
          receipt,
          event: "PoolCreated",
        }) as { poolId: Hex };

        emit("transactionStatus", success(receipt));
      } catch (err) {
        const result = new AlloError("Failed to create Pool", err);
        emit("transactionStatus", error(result));
        return error(result);
      }

      await this.waitUntilIndexerSynced({
        chainId: this.chainId,
        blockNumber: receipt.blockNumber,
      });

      emit("indexingStatus", success(void 0));

      return success({
        roundId: poolCreatedEvent.poolId,
      });
    });
  }

  /**
   * Applies to a round for Allo v2
   *
   * @param args
   *
   * @public
   *
   * @returns AllotOperation<Result<Hex>, { ipfs: Result<string>; transaction: Result<Hex>; transactionStatus: Result<TransactionReceipt> }>
   */
  applyToRound(args: {
    projectId: Hex;
    roundId: Hex | number;
    metadata: AnyJson;
    strategy?: RoundCategory;
  }): AlloOperation<
    Result<Hex>,
    {
      ipfs: Result<string>;
      transaction: Result<Hex>;
      transactionStatus: Result<TransactionReceipt>;
      indexingStatus: Result<null>;
    }
  > {
    return new AlloOperation(async ({ emit }) => {
      if (typeof args.roundId != "number") {
        return error(new AlloError("roundId must be number"));
      }

      const ipfsResult = await this.ipfsUploader(args.metadata);

      emit("ipfs", ipfsResult);

      if (ipfsResult.type === "error") {
        return ipfsResult;
      }

      const metadata = args.metadata as unknown as {
        application: { recipient: Hex; answers: RoundApplicationAnswers[] };
      };

      let registerRecipientTx: TransactionData;

      switch (args.strategy) {
        case RoundCategory.QuadraticFunding: {
          const strategyInstance = new DonationVotingMerkleDistributionStrategy(
            {
              chain: this.chainId,
              poolId: BigInt(args.roundId),
            }
          );

          registerRecipientTx = strategyInstance.getRegisterRecipientData({
            registryAnchor: args.projectId,
            recipientAddress: metadata.application.recipient,
            metadata: {
              protocol: 1n,
              pointer: ipfsResult.value,
            },
          });
          break;
        }

        case RoundCategory.Direct: {
          const strategyInstance = new DirectGrantsStrategy({
            chain: this.chainId,
            poolId: BigInt(args.roundId),
          });

          const answers = metadata.application.answers;
          const amountAnswer = answers.find(
            (a) => a.question === "Amount requested"
          );

          registerRecipientTx = strategyInstance.getRegisterRecipientData({
            registryAnchor: args.projectId,
            recipientAddress: metadata.application.recipient,
            grantAmount: BigInt((amountAnswer?.answer as string) ?? 0),
            metadata: {
              protocol: 1n,
              pointer: ipfsResult.value,
            },
          });
          break;
        }

        default:
          throw new AlloError("Unsupported strategy");
      }

      const txResult = await sendRawTransaction(this.transactionSender, {
        to: registerRecipientTx.to,
        data: registerRecipientTx.data,
        value: BigInt(registerRecipientTx.value),
      });

      emit("transaction", txResult);

      if (txResult.type === "error") {
        return txResult;
      }

      let receipt: TransactionReceipt;

      try {
        receipt = await this.transactionSender.wait(txResult.value);
        emit("transactionStatus", success(receipt));
      } catch (err) {
        const result = new AlloError("Failed to apply to round");
        emit("transactionStatus", error(result));
        return error(result);
      }

      await this.waitUntilIndexerSynced({
        chainId: this.chainId,
        blockNumber: receipt.blockNumber,
      });

      emit("indexingStatus", success(null));

      return success(args.projectId);
    });
  }

  bulkUpdateApplicationStatus(args: {
    roundId: string;
    strategyAddress: Address;
    applicationsToUpdate: {
      index: number;
      status: ApplicationStatus;
    }[];
    currentApplications: {
      index: number;
      status: ApplicationStatus;
    }[];
  }): AlloOperation<
    Result<void>,
    {
      transaction: Result<Hex>;
      transactionStatus: Result<TransactionReceipt>;
      indexingStatus: Result<void>;
    }
  > {
    return new AlloOperation(async ({ emit }) => {
      if (args.applicationsToUpdate.some((app) => app.status === "IN_REVIEW")) {
        throw new AlloError("DirectGrants is not supported yet!");
      }

      const strategyInstance = new DonationVotingMerkleDistributionStrategy({
        chain: this.chainId,
        poolId: BigInt(args.roundId),
        address: args.strategyAddress,
      });

      const totalApplications = await strategyInstance.recipientsCounter();

      const rows = buildUpdatedRowsOfApplicationStatuses({
        applicationsToUpdate: args.applicationsToUpdate,
        currentApplications: args.currentApplications,
        statusToNumber: applicationStatusToNumber,
        bitsPerStatus: 4,
      });

      const txResult = await sendTransaction(this.transactionSender, {
        address: args.strategyAddress,
        abi: DonationVotingMerkleDistributionDirectTransferStrategyAbi as Abi,
        functionName: "reviewRecipients",
        args: [rows, totalApplications],
      });

      emit("transaction", txResult);

      if (txResult.type === "error") {
        return txResult;
      }

      let receipt: TransactionReceipt;
      try {
        receipt = await this.transactionSender.wait(txResult.value);
        emit("transactionStatus", success(receipt));
      } catch (err) {
        const result = new AlloError("Failed to update application status");
        emit("transactionStatus", error(result));
        return error(result);
      }

      await this.waitUntilIndexerSynced({
        chainId: this.chainId,
        blockNumber: receipt.blockNumber,
      });

      emit("indexingStatus", success(undefined));

      return success(undefined);
    });
  }

  // NEW CODE
  bulkMACIUpdateApplicationStatus(args: {
    roundId: string;
    strategyAddress: Address;
    applicationsToUpdate: {
      address: string;
      status: ApplicationStatus;
      statusSnapshots: {
        updatedAt: Date;
      }[];
    }[];
  }): AlloOperation<
    Result<void>,
    {
      transaction: Result<Hex>;
      transactionStatus: Result<TransactionReceipt>;
      indexingStatus: Result<void>;
    }
  > {
    return new AlloOperation(async ({ emit }) => {
      if (args.applicationsToUpdate.some((app) => app.status === "IN_REVIEW")) {
        throw new AlloError("DirectGrants is not supported yet!");
      }

      const recipients: string[] = [];
      const latestUpdateTimes: bigint[] = [];
      const statuses: bigint[] = [];

      // Process the applicationsToUpdate array
      args.applicationsToUpdate.reduce(
        (acc, app) => {
          acc.recipients.push(app.address);
          acc.statuses.push(applicationStatusToNumber(app.status));
          acc.latestUpdateTimes.push(
            !app.statusSnapshots || app.statusSnapshots.length <= 1
              ? 0n
              : BigInt(
                  app.statusSnapshots[
                    app.statusSnapshots.length - 1
                  ].updatedAt.getTime() / 1000
                )
          );
          return acc;
        },
        {
          recipients: recipients,
          statuses: statuses,
          latestUpdateTimes: latestUpdateTimes,
        }
      );
      const txResult = await sendTransaction(this.transactionSender, {
        address: args.strategyAddress,
        abi: MACIQF as Abi,
        functionName: "reviewRecipients",
        args: [recipients, latestUpdateTimes, statuses],
      });

      emit("transaction", txResult);

      if (txResult.type === "error") {
        return txResult;
      }

      let receipt: TransactionReceipt;
      try {
        receipt = await this.transactionSender.wait(txResult.value);
        emit("transactionStatus", success(receipt));
      } catch (err) {
        const result = new AlloError("Failed to update application status");
        emit("transactionStatus", error(result));
        return error(result);
      }

      await this.waitUntilIndexerSynced({
        chainId: this.chainId,
        blockNumber: receipt.blockNumber,
      });

      emit("indexingStatus", success(undefined));

      return success(undefined);
    });
  }

  fundRound(args: {
    tokenAddress: Address;
    roundId: string;
    amount: bigint;
  }): AlloOperation<
    Result<null>,
    {
      tokenApprovalStatus: Result<TransactionReceipt | null>;
      transaction: Result<Hex>;
      transactionStatus: Result<TransactionReceipt>;
      indexingStatus: Result<null>;
    }
  > {
    return new AlloOperation(async ({ emit }) => {
      if (isNaN(Number(args.roundId))) {
        return error(new AlloError("Round ID is not a valid Allo V2 pool ID"));
      }

      const poolId = BigInt(args.roundId);

      if (args.tokenAddress === zeroAddress) {
        emit("tokenApprovalStatus", success(null));
      } else {
        const approvalTx = await sendTransaction(this.transactionSender, {
          address: args.tokenAddress,
          abi: Erc20ABI,
          functionName: "approve",
          args: [this.allo.address(), args.amount],
        });

        if (approvalTx.type === "error") {
          return approvalTx;
        }

        try {
          const receipt = await this.transactionSender.wait(approvalTx.value);
          emit("tokenApprovalStatus", success(receipt));
        } catch (err) {
          const result = new AlloError("Failed to approve token transfer", err);
          emit("tokenApprovalStatus", error(result));
          return error(result);
        }
      }

      const tx = await sendTransaction(this.transactionSender, {
        address: this.allo.address(),
        abi: AlloAbi,
        functionName: "fundPool",
        args: [poolId, args.amount],
        value: args.tokenAddress === zeroAddress ? args.amount : 0n,
      });

      emit("transaction", tx);

      if (tx.type === "error") {
        return tx;
      }

      let receipt: TransactionReceipt;

      try {
        receipt = await this.transactionSender.wait(tx.value);
        emit("transactionStatus", success(receipt));
      } catch (err) {
        const result = new AlloError("Failed to fund round", err);
        emit("transactionStatus", error(result));
        return error(result);
      }

      await this.waitUntilIndexerSynced({
        chainId: this.chainId,
        blockNumber: receipt.blockNumber,
      });

      emit("indexingStatus", success(null));

      return success(null);
    });
  }

  withdrawFundsFromStrategy(args: {
    payoutStrategyAddress: Address;
    tokenAddress: Address;
    recipientAddress: Address;
  }): AlloOperation<
    Result<null>,
    {
      tokenApprovalStatus: Result<TransactionReceipt | null>;
      transaction: Result<Hex>;
      transactionStatus: Result<TransactionReceipt>;
      indexingStatus: Result<null>;
    }
  > {
    let token = args.tokenAddress;
    if (token === zeroAddress) {
      token = getAddress(NATIVE);
    }

    return new AlloOperation(async ({ emit }) => {
      const tx = await sendTransaction(this.transactionSender, {
        address: args.payoutStrategyAddress,
        abi: DonationVotingMerkleDistributionDirectTransferStrategyAbi,
        functionName: "withdraw",
        args: [token],
      });

      emit("transaction", tx);

      if (tx.type === "error") {
        return tx;
      }

      let receipt: TransactionReceipt;

      try {
        receipt = await this.transactionSender.wait(tx.value);
        emit("transactionStatus", success(receipt));
      } catch (err) {
        const result = new AlloError("Failed to withdraw from strategy");
        emit("transactionStatus", error(result));
        return error(result);
      }

      await this.waitUntilIndexerSynced({
        chainId: this.chainId,
        blockNumber: receipt.blockNumber,
      });

      emit("indexingStatus", success(null));

      return success(null);
    });
  }

  finalizeRound(args: {
    roundId: string;
    strategyAddress: Address;
    matchingDistribution: DistributionMatch[];
  }): AlloOperation<
    Result<null>,
    {
      ipfs: Result<string>;
      transaction: Result<Hex>;
      transactionStatus: Result<TransactionReceipt>;
      indexingStatus: Result<null>;
    }
  > {
    return new AlloOperation(async ({ emit }) => {
      const ipfsResult = await this.ipfsUploader({
        matchingDistribution: args.matchingDistribution,
      });

      emit("ipfs", ipfsResult);

      if (ipfsResult.type === "error") {
        return ipfsResult;
      }

      const distribution = args.matchingDistribution.map((d, index) => [
        index,
        d.anchorAddress,
        d.projectPayoutAddress,
        d.matchAmountInToken,
      ]);

      const tree = StandardMerkleTree.of(distribution, [
        "uint256",
        "address",
        "address",
        "uint256",
      ]);

      const merkleRoot = tree.root as Hex;

      {
        const txResult = await sendTransaction(this.transactionSender, {
          address: args.strategyAddress,
          abi: DonationVotingMerkleDistributionDirectTransferStrategyAbi,
          functionName: "updateDistribution",
          args: [merkleRoot, { protocol: 1n, pointer: ipfsResult.value }],
        });

        emit("transaction", txResult);

        if (txResult.type === "error") {
          return txResult;
        }

        let receipt: TransactionReceipt;
        try {
          receipt = await this.transactionSender.wait(txResult.value);
          emit("transactionStatus", success(receipt));
        } catch (err) {
          const result = new AlloError("Failed to update application status");
          emit("transactionStatus", error(result));
          return error(result);
        }

        await this.waitUntilIndexerSynced({
          chainId: this.chainId,
          blockNumber: receipt.blockNumber,
        });

        emit("indexingStatus", success(null));
      }

      return success(null);
    });
  }

  editRound(args: {
    roundId: Hex | number;
    roundAddress?: Hex;
    data: UpdateRoundParams;
    strategy?: RoundCategory;
  }): AlloOperation<
    Result<Hex | number>,
    {
      ipfs: Result<string>;
      transaction: Result<Hex>;
      transactionStatus: Result<TransactionReceipt>;
      indexingStatus: Result<void>;
    }
  > {
    return new AlloOperation(async ({ emit }) => {
      let receipt: TransactionReceipt | null = null;

      const data = args.data;

      if (typeof args.roundId != "number") {
        return error(new AlloError("roundId must be number"));
      }

      if (!args.roundAddress) {
        return error(new AlloError("roundAddress must be provided"));
      }

      /** Upload roundMetadata ( includes applicationMetadata ) to IPFS */
      if (data.roundMetadata && data.applicationMetadata) {
        const ipfsResult = await this.ipfsUploader({
          round: data.roundMetadata,
          application: data.applicationMetadata,
        });

        emit("ipfs", ipfsResult);

        if (ipfsResult.type === "error") {
          return ipfsResult;
        }

        /** Note: the pool metadata always calls `this.allo.updatePoolMetadata` and not the strategy */
        const txUpdateMetadata = this.allo.updatePoolMetadata({
          poolId: BigInt(args.roundId),
          metadata: {
            protocol: 1n,
            pointer: ipfsResult.value,
          },
        });

        const txResult = await sendRawTransaction(this.transactionSender, {
          to: txUpdateMetadata.to,
          data: txUpdateMetadata.data,
          value: BigInt(txUpdateMetadata.value),
        });

        if (txResult.type === "error") {
          return error(txResult.error);
        }

        try {
          // wait for 1st transaction to be mined
          receipt = await this.transactionSender.wait(txResult.value);
        } catch (err) {
          const result = new AlloError("Failed to update metadata");
          emit("transactionStatus", error(result));
          return error(result);
        }
      }

      let updateTimestampTxn: TransactionData | null = null;

      /** Note: timestamps updates happen by calling the strategy contract directly `this.strategy.updatePoolTimestamps` */
      switch (args.strategy) {
        case RoundCategory.QuadraticFunding: {
          const strategyInstance = new DonationVotingMerkleDistributionStrategy(
            {
              chain: this.chainId,
              poolId: BigInt(args.roundId),
              address: args.roundAddress,
            }
          );

          if (
            data.roundStartTime &&
            data.roundEndTime &&
            data.applicationsStartTime &&
            data.applicationsEndTime
          ) {
            updateTimestampTxn = strategyInstance.updatePoolTimestamps(
              dateToEthereumTimestamp(data.applicationsStartTime),
              dateToEthereumTimestamp(data.applicationsEndTime),
              dateToEthereumTimestamp(data.roundStartTime),
              dateToEthereumTimestamp(data.roundEndTime)
            );
          }

          break;
        }
        case RoundCategory.Direct: {
          // NOTE: TEST AFTER CREATION WORKS ON UI

          const strategyInstance = new DirectGrantsStrategy({
            chain: this.chainId,
            poolId: BigInt(args.roundId),
            address: args.roundAddress,
          });

          if (data.applicationsStartTime && data.applicationsEndTime) {
            updateTimestampTxn = strategyInstance.getUpdatePoolTimestampsData(
              dateToEthereumTimestamp(data.applicationsStartTime),
              dateToEthereumTimestamp(data.applicationsEndTime)
            );
          }

          break;
        }

        default:
          throw new AlloError("Unsupported strategy");
      }

      if (updateTimestampTxn) {
        const timestampTxResult = await sendRawTransaction(
          this.transactionSender,
          {
            to: updateTimestampTxn.to,
            data: updateTimestampTxn.data,
            value: BigInt(updateTimestampTxn.value),
          }
        );

        if (timestampTxResult.type === "error") {
          return error(timestampTxResult.error);
        }

        try {
          // wait for 2nd transaction to be mined
          receipt = await this.transactionSender.wait(timestampTxResult.value);
        } catch (err) {
          const result = new AlloError("Failed to update timestamps");
          emit("transactionStatus", error(result));
          return error(result);
        }
      }

      if (!receipt) return error(new AlloError("No receipt found"));

      // note: we have 2 txns, allo.updatePoolMetadata and strategy.timestamp
      // handle the case where only 1 happens or both
      emit("transactionStatus", success(receipt));

      await this.waitUntilIndexerSynced({
        chainId: this.chainId,
        blockNumber: receipt.blockNumber,
      });

      emit("indexingStatus", success(void 0));

      return success(args.roundId);
    });
  }

  batchDistributeFunds(args: {
    payoutStrategy: Address;
    allProjects: MatchingStatsData[];
    projectIdsToBePaid: string[];
  }): AlloOperation<
    Result<null>,
    {
      transaction: Result<Hex>;
      transactionStatus: Result<TransactionReceipt>;
      indexingStatus: Result<null>;
    }
  > {
    return new AlloOperation(async ({ emit }) => {
      const poolId = BigInt(args.payoutStrategy);
      const recipientIds: Address[] = args.projectIdsToBePaid.map((id) =>
        getAddress(id)
      );

      // Generate merkle tree
      const { tree, matchingResults } = generateMerkleTree(args.allProjects);

      // Filter projects to be paid from matching results
      const projectsToBePaid = matchingResults.filter((project) =>
        args.projectIdsToBePaid.includes(project.projectId)
      );

      const projectsWithMerkleProof: ProjectWithMerkleProof[] = [];

      projectsToBePaid.forEach((project) => {
        if (!project.index) {
          throw new AlloError("Project index is required");
        }
        const distribution: [number, string, BigNumber, string] = [
          project.index,
          project.applicationId,
          project.matchAmountInToken,
          project.projectId,
        ];

        // Generate merkle proof
        const validMerkleProof = tree.getProof(distribution);

        projectsWithMerkleProof.push({
          index: distribution[0],
          recipientId: distribution[1],
          amount: distribution[2],
          merkleProof: validMerkleProof,
        });
      });

      const projectsWithMerkleProofBytes = serializeProjects(
        projectsWithMerkleProof
      );

      const txResult = await sendTransaction(this.transactionSender, {
        address: this.allo.address(),
        abi: AlloAbi,
        functionName: "distribute",
        args: [poolId, recipientIds, projectsWithMerkleProofBytes],
      });

      emit("transaction", txResult);

      if (txResult.type === "error") {
        return txResult;
      }

      let receipt: TransactionReceipt;
      try {
        receipt = await this.transactionSender.wait(txResult.value);
        emit("transactionStatus", success(receipt));
      } catch (err) {
        const result = new AlloError("Failed to distribute funds");
        emit("transactionStatus", error(result));
        return error(result);
      }

      await this.waitUntilIndexerSynced({
        chainId: this.chainId,
        blockNumber: receipt.blockNumber,
      });

      emit("indexingStatus", success(null));

      return success(null);
    });
  }
}

export function serializeProject(project: ProjectWithMerkleProof) {
  return utils.defaultAbiCoder.encode(
    ["uint256", "address", "uint256", "bytes32[]"],
    [
      project.index,
      project.recipientId,
      project.amount,
      project.merkleProof.map(utils.formatBytes32String),
    ]
  );
}

export function serializeProjects(projects: ProjectWithMerkleProof[]): Hex {
  const serializedProjects = projects.map(serializeProject);
  return utils.defaultAbiCoder.encode(["bytes[]"], [serializedProjects]) as Hex;
}

export type ProjectWithMerkleProof = {
  index: number;
  recipientId: string;
  amount: BigNumber;
  merkleProof: string[];
};
