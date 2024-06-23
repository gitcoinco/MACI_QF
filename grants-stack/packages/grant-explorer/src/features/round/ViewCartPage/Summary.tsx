import { ChainId, useTokenPrice, VotingToken } from "common";
import { CHAINS } from "../../api/utils";
import { zeroAddress, formatEther } from "viem";
import { useAccount, useBalance } from "wagmi";
import { InformationCircleIcon } from "@heroicons/react/24/solid";
import { Tooltip } from "@chakra-ui/react";
import { formatAmount } from "../../api/formatAmount";

type SummaryProps = {
  totalDonation: bigint;
  selectedPayoutToken: VotingToken;
  chainId: ChainId;
  alreadyContributed: boolean;
  roundName: string;
};

export function Summary({
  selectedPayoutToken,
  totalDonation,
  chainId,
  alreadyContributed,
  roundName,
}: SummaryProps) {
  const { data: payoutTokenPrice } = useTokenPrice(
    selectedPayoutToken.redstoneTokenId
  );

  const amount = alreadyContributed
    ? formatAmount(totalDonation, selectedPayoutToken.decimal)
    : formatEther(totalDonation);
  const totalDonationInUSD =
    payoutTokenPrice && Number(amount) * Number(payoutTokenPrice);

  const { address } = useAccount();

  const { data: balance } = useBalance({
    address,
    token:
      selectedPayoutToken.address === zeroAddress
        ? undefined
        : selectedPayoutToken.address,
    chainId,
  });
  /*TODO: make this an explicit cehck of `balance !== undefined && totaldonation > balance.value ` */
  const insufficientFunds = balance ? totalDonation > balance.value : false;

  return (
    <div>
      <div className="flex flex-row justify-between mt-2 mb-5">
        <div className="flex flex-col">
          <p className="mb-2">Your donations amount on</p>
          <div className="flex items-center">
            <img
              className={"inline max-w-[32px] mr-2"}
              alt={CHAINS[chainId].name}
              src={CHAINS[chainId].logo}
            />
            <p>{roundName}</p>
            <Tooltip
              label="The total donation amount & percentages may slightly differ due to rounding during MACI vote calculations."
              aria-label="Tooltip explaining rounding differences"
              placement="top"
              hasArrow
              bg="gray.600"
              color="white"
              fontSize="sm"
            >
              <InformationCircleIcon className="w-4 h-4 ml-2 cursor-pointer text-gray-500" />
            </Tooltip>
          </div>
        </div>
        <div className="flex flex-col">
          <p className="text-right">
            <span data-testid={"totalDonation"} className="mr-2">
              {formatAmount(totalDonation, selectedPayoutToken.decimal)}
            </span>
            <span data-testid={"summaryPayoutToken"}>
              {selectedPayoutToken.name}
            </span>
          </p>
          {payoutTokenPrice && (
            <div className="flex justify-end mt-2">
              <p className="text-[14px] text-[#979998] font-bold">
                ${totalDonationInUSD?.toFixed(2)}
              </p>
            </div>
          )}
        </div>
      </div>
      {insufficientFunds && !alreadyContributed && (
        <p
          data-testid="insufficientBalance"
          className="rounded-md bg-red-50 font-medium p-2 text-pink-500 flex justify-start items-center mt-2 mb-6 text-sm"
        >
          <InformationCircleIcon className="w-4 h-4 mr-1" />
          <span>Insufficient funds to donate on this network</span>
        </p>
      )}
    </div>
  );
}
