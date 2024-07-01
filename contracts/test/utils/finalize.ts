import { JSONFile } from "./JSONFile";
import { getTalyFilePath } from "./misc";
import { genTreeCommitment as genTallyResultCommitment } from "maci-crypto";

import { Signer } from "ethers";
import { MACIQF } from "../../typechain-types";

export const finalize = async ({
  MACIQFStrategy,
  Coordinator,
  voteOptionTreeDepth,
  outputDir,
}: {
  MACIQFStrategy: MACIQF;
  Coordinator: Signer;
  voteOptionTreeDepth: number;
  outputDir: string;
}) => {
  const tallyFile = getTalyFilePath(outputDir);

  const tally = JSONFile.read(tallyFile) as any;

  const recipientTreeDepth = voteOptionTreeDepth;

  const newResultCommitment = genTallyResultCommitment(
    tally.results.tally.map((x: string) => BigInt(x)),
    BigInt(tally.results.salt),
    recipientTreeDepth
  );

  const perVOSpentVoiceCreditsCommitment = genTallyResultCommitment(
    tally.perVOSpentVoiceCredits.tally.map((x: string) => BigInt(x)),
    BigInt(tally.perVOSpentVoiceCredits.salt),
    recipientTreeDepth
  );

  // Finalize round
  let finalize = await MACIQFStrategy.connect(Coordinator).finalize(
    tally.totalSpentVoiceCredits.spent,
    tally.totalSpentVoiceCredits.salt,
    newResultCommitment.toString(),
    perVOSpentVoiceCreditsCommitment.toString()
  );

  await finalize.wait();

  let isFinalized = await MACIQFStrategy.isFinalized();

  return isFinalized;
};
