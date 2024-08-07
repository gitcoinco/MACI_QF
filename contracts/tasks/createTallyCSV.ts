import { task } from "hardhat/config";
import dotenv from "dotenv";
import { getOutputDir } from "./helpers/utils";
import ContractStates from "./helpers/contractStates";
import { Ipfs } from "../test/utils/ipfs";
import { TallyData } from "maci-cli";
import axios from "axios";
import fs from "fs";
import { MACIQF } from "../typechain-types";
dotenv.config();

task("createTallyCSV", "createTallyCSV")
  .addParam("startingblock", "The starting block number for tallying")
  .addParam("roundid", "The round ID for the MACI strategy")
  .setAction(async ({ startingblock, roundid }, hre) => {
    const { ethers, network } = hre;
    const [Coordinator] = await ethers.getSigners();
    const roundId = Number(roundid);
    const chainId = network.config.chainId!;
    const contractStates = new ContractStates(
      chainId,
      roundId,
      Coordinator,
      hre
    );
    const startBlock = Number(startingblock);
    const outputDir = getOutputDir(roundId, chainId);

    try {
      const MACIQFStrategy = await contractStates.getMACIQFStrategy();

      const tallyData = JSON.parse(
        fs.readFileSync(outputDir + "/tally.json", "utf8")
      ) as TallyData;

      const stateData = JSON.parse(
        fs.readFileSync(outputDir + "/state.json", "utf8")
      );

      async function getVoteOptionIndexToRecipientIdMap(
        MACIQFStrategy: MACIQF,
        startBlock: number
      ) {
        const events = await MACIQFStrategy.queryFilter(
          MACIQFStrategy.filters.RecipientVotingOptionAdded(),
          startBlock
        );
        const voteOptionIndexToRecipientIdMap = [] as {
          index: number;
          recipientId: string;
          payoutAddress: string;
          title: string;
        }[];

        const voteIdToTitleMap = {} as { [key: string]: string };
        for (const event of events) {
          const recipient = await MACIQFStrategy.recipients(event.args[0]);
          const recipientMetadataCID = recipient.metadata[1];

          const recipientMetadata = await Ipfs.fetchJson(recipientMetadataCID);
          const title = recipientMetadata.application.project.title;
          const payoutAddress = recipient.recipientAddress;
          const recipientId = event.args[0];
          const voteOptionIndex = Number(event.args[1]);
          voteOptionIndexToRecipientIdMap.push({
            index: voteOptionIndex,
            recipientId: recipientId,
            payoutAddress: payoutAddress,
            title: title,
          });
          voteIdToTitleMap[voteOptionIndex] = title;
        }
        return { voteOptionIndexToRecipientIdMap, voteIdToTitleMap };
      }

      const { voteOptionIndexToRecipientIdMap, voteIdToTitleMap } =
        await getVoteOptionIndexToRecipientIdMap(MACIQFStrategy, startBlock);

      const alpha = calcAlpha(
        await MACIQFStrategy.getPoolAmount(),
        await MACIQFStrategy.totalVotesSquares(),
        BigInt(tallyData.totalSpentVoiceCredits.spent),
        await MACIQFStrategy.voiceCreditFactor(),
        await MACIQFStrategy.ALPHA_PRECISION()
      );
      const voiceCreditFactor = Number(
        await MACIQFStrategy.voiceCreditFactor()
      );
      const ALPHA_PRECISION = Number(await MACIQFStrategy.ALPHA_PRECISION());

      const csvRows = [
        ["voter", "project_name", "amount"], // Header row
      ];

      const ethPriceInUsd = await getEthPrice();

      for (const cmd of stateData.polls[0].commands) {
        if (cmd.stateIndex === "0") {
          continue;
        }
        const voter = ethers.solidityPackedKeccak256(
          ["string"],
          [cmd.newPubKey]
        );
        const project_name = voteIdToTitleMap[cmd.voteOptionIndex];
        const amount =
          ((cmd.newVoteWeight * cmd.newVoteWeight) / 1e5) * ethPriceInUsd;

        csvRows.push([voter, project_name, amount.toString()]);
      }

      // Convert the rows to CSV format
      const csvContent = csvRows.map((e) => e.join(",")).join("\n");

      // Save to a CSV file
      fs.writeFileSync(outputDir + "/donations.csv", csvContent);

      const csvHeaders = "Recipient ID,Allocated Amount,Title,Payout Address";
      const csvData = voteOptionIndexToRecipientIdMap
        .map((voteOption) => {
          const allocatedAmount = getAllocatedAmount(
            BigInt(tallyData.results.tally[voteOption.index]),
            BigInt(
              tallyData.perVOSpentVoiceCredits?.tally[voteOption.index] ?? 0
            ),
            alpha,
            BigInt(voiceCreditFactor),
            BigInt(ALPHA_PRECISION)
          );
          return `${voteOption.recipientId},${Number(allocatedAmount) / 1e18},${
            voteOption.title
          },${voteOption.payoutAddress}`;
        })
        .join("\n");

      const csv = `${csvHeaders}\n${csvData}`;
      fs.writeFileSync(outputDir + "/tally.csv", csv);
    } catch (error) {
      console.error("Error in creating tally CSV:", error);
      process.exitCode = 1;
    }
  });

function getAllocatedAmount(
  tallyResult: bigint,
  spent: bigint,
  alpha: bigint,
  voiceCreditFactor: bigint,
  ALPHA_PRECISION: bigint
): bigint {
  const quadratic = alpha * voiceCreditFactor * tallyResult * tallyResult;
  const totalSpentCredits = voiceCreditFactor * spent;
  const linearPrecision = ALPHA_PRECISION * totalSpentCredits;
  const linearAlpha = alpha * totalSpentCredits;
  return (quadratic + linearPrecision - linearAlpha) / ALPHA_PRECISION;
}

export function calcAlpha(
  _budget: bigint,
  _totalVotesSquares: bigint,
  _totalSpent: bigint,
  voiceCreditFactor: bigint,
  ALPHA_PRECISION: bigint
): bigint {
  // Ensure contributions = total spent * voice credit factor
  const contributions = _totalSpent * voiceCreditFactor;

  if (_budget < contributions) {
    throw new Error("Budget is less than contributions");
  }

  // guard against division by zero.
  // This happens when no project receives more than one vote
  if (_totalVotesSquares <= _totalSpent) {
    throw new Error("No project has more than one vote");
  }

  // Calculate alpha
  return (
    ((_budget - contributions) * ALPHA_PRECISION) /
    (voiceCreditFactor * (_totalVotesSquares - _totalSpent))
  );
}

async function getEthPrice() {
  try {
    const response = await axios.get(
      "https://api.coingecko.com/api/v3/simple/price",
      {
        params: {
          ids: "ethereum",
          vs_currencies: "usd",
        },
      }
    );

    const ethPriceInUsd = response.data.ethereum.usd;
    return ethPriceInUsd;
  } catch (error) {
    console.error("Error fetching ETH price:", error);
  }
}
