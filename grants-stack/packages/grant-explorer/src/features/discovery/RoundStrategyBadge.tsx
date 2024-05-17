import {
  ROUND_PAYOUT_DIRECT,
  ROUND_PAYOUT_DIRECT_OLD,
  ROUND_PAYOUT_MERKLE,
  ROUND_PAYOUT_MERKLE_OLD,
  ROUND_PAYOUT_QFMACI,
  RoundPayoutTypeNew,
} from "common";
import { getRoundStrategyTitle } from "common";
import { Badge } from "../common/styles";

type Props = { strategyName: RoundPayoutTypeNew };

const colorOptions = {
  [ROUND_PAYOUT_MERKLE_OLD]: "blue",
  [ROUND_PAYOUT_DIRECT_OLD]: "yellow",
  [ROUND_PAYOUT_MERKLE]: "blue",
  [ROUND_PAYOUT_DIRECT]: "yellow",
  [ROUND_PAYOUT_QFMACI]: "blue",

  ["allov2.DonationVotingMerkleDistributionDirectTransferStrategy"]: "blue",
  ["allov2.MicroGrantsStrategy"]: "yellow",
  ["allov2.MicroGrantsHatsStrategy"]: "yellow",
  ["allov2.SQFSuperFluidStrategy"]: "yellow",
  ["allov2.MicroGrantsGovStrategy"]: "yellow",
  ["allov2.DirectGrantsSimpleStrategy"]: "yellow",
  ["QFMACI"]: "blue",
  [""]: "grey",
} as const;

export function RoundStrategyBadge({ strategyName }: Props) {

  const color = colorOptions[strategyName];
  return (
    <Badge color={color} data-testid="round-badge">
      {getRoundStrategyTitle(strategyName)}
    </Badge>
  );
}
