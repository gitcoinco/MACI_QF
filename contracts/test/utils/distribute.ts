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
  roundId,
  batchSize,
}: {
  outputDir: string;
  AlloContract: Allo;
  MACIQFStrategy: MACIQF;
  distributor: Signer;
  recipientTreeDepth: any;
  roundId: number;
  batchSize: number;
}) => {
  const tallyFile = getTalyFilePath(outputDir);

  const tally = JSONFile.read(tallyFile) as TallyData;

  const results = tally.results.tally

  const indexes = []

  for (const index in results) {
    if (results[index] !== "0") {
      indexes.push(index)
    }
  }
  const AbiCoder = new ethers.AbiCoder();

  const provider = distributor.provider!;

  const poolAmountBeforeDistribution = await provider.getBalance(
    await MACIQFStrategy.getAddress()
  );

  for (let i = 0; i < indexes.length; i += batchSize) {
    const batchIndexes = indexes.slice(i, i + batchSize);
    const bytesArray = []; // Reset bytesArray for each batch

    // Process each index in the current batch
    for (const index of batchIndexes) {
      const distributeData = getRecipientClaimData(
        Number(index),
        recipientTreeDepth,
        tally
      );

      const types = ["(uint256,uint256,uint256[][],uint256,uint256,uint256)"];
      const initStruct = [distributeData];
      const bytes = AbiCoder.encode(types, initStruct);
      bytesArray.push(bytes);
    }

    // Encode the batch for distribution
    const bytesArrayTypes = ["bytes[]"];
    const bytesArrayEncoded = AbiCoder.encode(bytesArrayTypes, [bytesArray]);

    // Send the batch distribution request
    const distributeFunds = await AlloContract.connect(distributor).distribute(
      roundId,
      [],
      bytesArrayEncoded
    );
    await distributeFunds.wait();
  }

  return {
    poolAmountBeforeDistribution: poolAmountBeforeDistribution,
    poolAmountAfterDistribution: await provider.getBalance(
      await MACIQFStrategy.getAddress()
    ),
  };
};


