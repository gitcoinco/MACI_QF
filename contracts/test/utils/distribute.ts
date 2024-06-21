import { Signer, ethers } from "ethers";
import { Allo, MACIQF } from "../../typechain-types";

import { getRecipientClaimData } from "./maci";
import { JSONFile } from "./JSONFile";
import { getTalyFilePath } from "./misc";
import { TallyData } from "maci-cli";

export const distribute = async ({
  outputDir,
  AlloContract,
  MACIQFStrategy,
  distributor,
  recipientTreeDepth,
  recipients,
  roundId,
}: {
  outputDir: string;
  AlloContract: Allo;
  MACIQFStrategy: MACIQF;
  distributor: Signer;
  recipientTreeDepth: any;
  recipients: string[];
  roundId: number;
}) => {
  const tallyFile = getTalyFilePath(outputDir);

  const tally = JSONFile.read(tallyFile) as TallyData;

  const results = tally.results.tally;

  const voteOptionsToDistribute: bigint[] = [];

  for (const [key, value] of Object.entries(results)) {
    if (value !== "0") {
      voteOptionsToDistribute.push(BigInt(key));
      console.log("Vote Option", key, "Votes", value);
    }
  }

  const AbiCoder = new ethers.AbiCoder();

  const bytesArray: string[] = [];

  const provider = distributor.provider!;

  const recipientsBalances: {
    [key: string]: {
      before: bigint;
      after: bigint;
      diff: bigint;
    };
  } = {};
  const poolAmountBeforeDistribution = await provider.getBalance(
    await MACIQFStrategy.getAddress()
  );

  // Temp Fix for testing later on we
  // should get all the RecipientVotingOptionsAdded events
  let option = 0;
  // First pass to gather all required data
  for (const voteIndex of voteOptionsToDistribute) {
    // const recipientIndex = option;
    // option += 1;

    // recipientsBalances[recipientAddress] = {
    //   before: await provider.getBalance(recipientAddress),
    //   after: 0n, // Initialize with 0
    //   diff: 0n,
    // };

    const distributeData = getRecipientClaimData(
      Number(voteIndex),
      recipientTreeDepth,
      tally
    );

    const types = ["(uint256,uint256,uint256[][],uint256,uint256,uint256)"];
    const initStruct = [distributeData];
    const bytes = AbiCoder.encode(types, initStruct);
    bytesArray.push(bytes);
  }

  const bytesArrayTypes = ["bytes[]"];
  const bytesArrayEncoded = AbiCoder.encode(bytesArrayTypes, [bytesArray]);

  const distributeFunds = await AlloContract.connect(distributor).distribute(
    roundId,
    [],
    bytesArrayEncoded
  );
  await distributeFunds.wait();

  let totalAmounts: bigint = 0n;
  // Second pass to update the balances after distribution
  // for (const recipientAddress of recipients) {
  //   recipientsBalances[recipientAddress].after = await provider.getBalance(
  //     recipientAddress
  //   );
  //   recipientsBalances[recipientAddress].diff =
  //     recipientsBalances[recipientAddress].after -
  //     recipientsBalances[recipientAddress].before;
  //   totalAmounts += BigInt(recipientsBalances[recipientAddress].diff);
  // }
  console.log("totalAmounts", totalAmounts);
  console.log("pool balance after", await MACIQFStrategy.getPoolAmount());
  return {
    recipientsBalances: recipientsBalances,
    poolAmountBeforeDistribution: poolAmountBeforeDistribution,
    poolAmountAfterDistribution: await provider.getBalance(
      await MACIQFStrategy.getAddress()
    ),
  };
};
