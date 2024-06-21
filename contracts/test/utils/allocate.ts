import { AbiCoder, BytesLike, Signer } from "ethers";
import { Allo, ClonableMACI } from "../../typechain-types";

import { Keypair } from "maci-domainobjs";
import { prepareAllocationData } from "./maci";

export const allocate = async ({
  AlloContract,
  allocator,
  keypair,
  contributionAmount,
}: {
  keypair: Keypair;
  AlloContract: Allo;
  allocator: Signer;
  contributionAmount: BigInt;
}) => {
  // Donate to the pool without proof
  let dt = {
    _pa: new Array(2).fill(0n),
    _pb: [new Array(2).fill(0n), new Array(2).fill(0n)],
    _pc: new Array(2).fill(0n),
    _pubSignals: new Array(38).fill("0"),
  };

  const emptyProof = {
    pA: dt._pa,
    pB: dt._pb,
    pC: dt._pc,
    pubSignals: dt._pubSignals.map((x) => BigInt(x)),
  };

  const contributeEncodedData = (await prepareAllocationData({
    publicKey: keypair.pubKey.serialize(),
    amount: contributionAmount,
    proof: emptyProof,
  })) as string;

  const SignUpTx = await AlloContract.connect(allocator).allocate(
    1n,
    contributeEncodedData,
    { value: contributionAmount.toString() }
  );
  await SignUpTx.wait();
};
