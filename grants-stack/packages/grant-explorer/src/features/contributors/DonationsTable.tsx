import { InformationCircleIcon } from "@heroicons/react/24/solid";
import ReactTooltip from "react-tooltip";
import { CHAINS } from "../api/utils";
import { Link } from "react-router-dom";
import { TransactionButton } from "./TransactionButton";
import { ChainId, VotingToken } from "common";
import { formatUnits } from "viem";
import { Contribution } from "data-layer";
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
} from "@chakra-ui/react";
import { useState } from "react";
import moment from "moment";

export function DonationsTable(props: {
  contributions: Contribution[];
  tokens: Record<string, VotingToken>;
  activeRound: boolean;
  price: number;
}) {
  return (
    <>
      <TableHeader />
      <RoundsTableWithAccordian
        activeRound={props.activeRound}
        contributions={props.contributions}
        tokens={props.tokens}
        price={props.price}
      />
      {props.contributions.length === 0 && (
        <div className="text-md mt-2 mb-12">
          {props.activeRound
            ? "Donations made during active rounds will appear here."
            : "Donations made during past rounds will appear here."}
        </div>
      )}
    </>
  );
}

function RoundsTableWithAccordian(props: {
  contributions: Contribution[];
  tokens: Record<string, VotingToken>;
  activeRound: boolean;
  price: number;
}) {
  const nestedContributionsForRound = props.contributions.reduce(
    (acc: Record<string, Contribution[]>, contribution) => {
      const roundId = contribution.roundId;

      if (!acc[roundId]) {
        acc[roundId] = [];
      }
      acc[roundId].push(contribution);
      return acc;
    },
    {}
  );

  const [defaultIndex, setDefaultIndex] = useState<
    number | number[] | undefined
  >(undefined);

  for (const key in nestedContributionsForRound) {
    return (
      <div className="pb-8">
        {Object.entries(nestedContributionsForRound).map(
          ([_roundId, contributionsForRound], _index) => {
            const sortedContributions = contributionsForRound
              .flat()
              .sort(
                (a, b) =>
                  (Number(b.timestamp) || Number.MAX_SAFE_INTEGER) -
                  (Number(a.timestamp) || Number.MAX_SAFE_INTEGER)
              );

            return (
              <Accordion
                className="w-full"
                allowMultiple={true}
                defaultIndex={defaultIndex}
                onChange={(index) => {
                  setDefaultIndex(index);
                }}
              >
                <AccordionItem
                  key={key}
                  isDisabled={sortedContributions.length === 0}
                >
                  <h2>
                    <AccordionButton
                      _expanded={{
                        bg: "white",
                        color: "black",
                      }}
                      _hover={{ bg: "white", color: "black" }}
                      _disabled={{ bg: "white", color: "black" }}
                    >
                      <Table
                        activeRound={props.activeRound}
                        contributions={sortedContributions}
                        tokens={props.tokens}
                        price={props.price}
                      />
                      <AccordionIcon />
                    </AccordionButton>
                  </h2>
                  <AccordionPanel pb={4}>
                    <InnerTable
                      activeRound={props.activeRound}
                      contributions={sortedContributions}
                      tokens={props.tokens}
                      price={props.price}
                    />
                  </AccordionPanel>
                </AccordionItem>
              </Accordion>
            );
          }
        )}
      </div>
    );
  }
}

function TableHeader() {
  return (
    <table className="w-full text-left mx-4">
      <thead className="font-sans text-lg">
        <tr>
          <th className="w-1/4 text-left mx-5">Round</th>
          <th className="w-1/4">
            <div className="flex flex-row ">
              <div className="py-4">Total Donation</div>
              <div className="py-4">
                <InformationCircleIcon
                  data-tip
                  data-background-color="#0E0333"
                  data-for="donation-tooltip"
                  className="inline h-4 w-4 ml-2 mr-3"
                  data-testid={"donation-tooltip"}
                />
                <ReactTooltip
                  id="donation-tooltip"
                  place="bottom"
                  type="dark"
                  effect="solid"
                >
                  <p className="text-xs">
                    The total contribution amount, <br />
                    in each round
                  </p>
                </ReactTooltip>
              </div>
            </div>
          </th>
          <th className="w-1/4 ">
            <div className="flex flex-row ">
              <div className="py-4">Voice Credits</div>
              <div className="py-4">
                <InformationCircleIcon
                  data-tip
                  data-background-color="#0E0333"
                  data-for="voice-credits-tooltip"
                  className="inline h-4 w-4 ml-2 mr-3"
                  data-testid={"voice-credits-tooltip"}
                />
                <ReactTooltip
                  id="voice-credits-tooltip"
                  place="bottom"
                  type="dark"
                  effect="solid"
                >
                  <p className="text-xs">
                    The total voice credits earned, <br />
                    from each contribution
                  </p>
                </ReactTooltip>
              </div>
            </div>
          </th>
          <th className="w-1/4 text-right pr-9">Transaction Information</th>
        </tr>
      </thead>
    </table>
  );
}

function InnerTable(props: {
  contributions: Contribution[];
  tokens: Record<string, VotingToken>;
  activeRound: boolean;
  price: number;
}) {
  return (
    <div className="bg-grey-75 rounded-lg p-2 py-1">
      <div className="mt-4 overflow-hidden">
        <div className="mx-auto">
          <div>
            <table className="w-full text-left">
              <thead className="font-sans text-lg">
                <tr>
                  <th className="w-1/4 text-left mx-5">Project</th>
                  <th className="w-1/4">
                    <div className="py-4">Donation</div>
                  </th>
                  <th className="w-1/4 ">
                    <div className="py-4">Voice Credits</div>
                  </th>
                  <th className="w-1/4"></th>
                </tr>
              </thead>
              <tbody>
                {props.contributions.length > 0 &&
                  props.contributions
                    .flat()
                    .sort(
                      (a, b) =>
                        (Number(b.timestamp) || Number.MAX_SAFE_INTEGER) -
                        (Number(a.timestamp) || Number.MAX_SAFE_INTEGER)
                    )

                    .map((contribution) => {
                      const tokenId =
                        contribution.tokenAddress.toLowerCase() +
                        "-" +
                        contribution.chainId;
                      const token = props.tokens[tokenId];

                      let formattedAmount = "N/A";
                      let amountInUsd = 0;

                      if (token) {
                        formattedAmount = `${Number(
                          Number(contribution.amount) / 1e13
                        )}`;
                        amountInUsd =
                          Number(
                            formatUnits(
                              BigInt(contribution.amount),
                              token.decimal
                            )
                          ) * (props.price ?? 0);
                      }

                      return (
                        <tr key={contribution.id} className="">
                          <td className="py-4 pr-2 colSpan-4">
                            <div className="flex items-center">
                              <div className="flex flex-col sm:flex-row">
                                {/* Link to the project */}
                                <Link
                                  className={`underline inline-block lg:pr-2 lg:max-w-[300px] max-w-[75px] 2xl:max-w-fit truncate`}
                                  title={contribution.application.project.name}
                                  to={`/round/${
                                    contribution.chainId
                                  }/${contribution.roundId
                                    .toString()
                                    .toLowerCase()}/${
                                    contribution.applicationId
                                  }`}
                                  target="_blank"
                                >
                                  {contribution.application.project.name}
                                </Link>
                              </div>
                            </div>
                            {/* Display contribution timestamp */}
                            <div className="text-sm text-gray-500">
                              {timeAgo(Number(contribution.timestamp))}
                            </div>
                          </td>
                          {/* Display donations */}
                          <td className="py-4 truncate ">
                            <div className="flex flex-col ">
                              <span className="text-md">{`${Number(formattedAmount) / 1e5} ${token.name}`}</span>
                              <span className="text-grey-400">
                                ${amountInUsd.toFixed(2)}
                              </span>
                            </div>
                          </td>
                          {/* Display Voice Credits */}
                          <td className="py-4 truncate ">
                            <span className="text-grey-400">
                              {formattedAmount}
                            </span>
                          </td>
                          <td className="w-1/4"></td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function Table(props: {
  contributions: Contribution[];
  tokens: Record<string, VotingToken>;
  activeRound: boolean;
  price: number;
}) {
  const roundInfo = props.contributions[0];
  const chainId = roundInfo.chainId;
  const chainLogo = CHAINS[roundInfo.chainId as ChainId]?.logo;
  const roundName = roundInfo.round.roundMetadata.name;

  const sortedContributions = props.contributions;
  const lastUpdated = sortedContributions[0].timestamp;

  let formattedAmount = "N/A";
  let totalContributionAmountInUsd = 0;
  let totalContributionInMatchingToken = 0;

  // Get the total contribution amount in USD and matching token
  sortedContributions.forEach((contribution) => {
    totalContributionAmountInUsd +=
      (Number(contribution.amount) * props.price) / 10 ** 18;
    totalContributionInMatchingToken += Number(contribution.amount);
  });

  // Get the formatted amount & token name
  sortedContributions.map((contribution) => {
    const tokenId =
      contribution.tokenAddress.toLowerCase() + "-" + contribution.chainId;
    const token = props.tokens[tokenId];

    if (token) {
      formattedAmount = `${totalContributionInMatchingToken / 1e18} ${token.name}`;
    }
  });

  return (
    <table className="w-full text-left">
      <tbody>
        <tr key={roundInfo.id}>
          <td className="w-1/4 text-left mx-5">
            <div className="flex items-center">
              <div className="flex flex-col sm:flex-row">
                <div className="flex items-center">
                  {/* Network Icon */}
                  <img
                    className="w-4 h-4 mr-2"
                    src={chainLogo}
                    alt="Round Chain Logo"
                  />
                  {/* Link to the round */}
                  <Link
                    className={`underline inline-block lg:pr-2 lg:max-w-[200px] max-w-[75px] 2xl:max-w-fit truncate`}
                    title={roundName}
                    to={`/round/${chainId}/${roundInfo.roundId.toLowerCase()}`}
                    target="_blank"
                  >
                    {roundName}
                  </Link>
                </div>
              </div>
            </div>
            {/* Display contribution timestamp */}
            <div className="text-sm text-gray-500">
              {timeAgo(Number(lastUpdated))}
            </div>
          </td>
          {/* Display donations */}
          <td className=" truncate w-1/4 pl-5 text-left">
            <div className="flex flex-col gap-2 ">
              <span className="text-md">{formattedAmount}</span>
              <span className="text-grey-400 text-sm">
                ${totalContributionAmountInUsd.toFixed(2)}
              </span>
            </div>
          </td>
          {/* Voice Credits */}
          <td className=" truncate w-1/4 pl-8 text-left">
            <span className="text-md ">
              {`${totalContributionInMatchingToken / 1e13}`}
            </span>
          </td>
          <td className="truncate w-1/5 pl-48">
            <div>
              <TransactionButton
                chainId={sortedContributions[0].chainId}
                txHash={sortedContributions[0].transactionHash}
              />
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function timeAgo(timestamp: number) {
  return moment(timestamp * 1000).fromNow();
}
