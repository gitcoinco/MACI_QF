import { AbiCoder, Signer, ZeroAddress } from "ethers";
import { Allo } from "../../typechain-types";

export const register = async ({
  AlloContract,
  registree,
}: {
  AlloContract: Allo;
  registree: Signer;
}) => {
  // Register recipient
  let data = AbiCoder.defaultAbiCoder().encode(
    ["address", "address", "(uint256,string)"],
    [ZeroAddress, await registree.getAddress(), [1n, "Project 1"]]
  );

  const RecipientRegistrationTx = await AlloContract.connect(
    registree
  ).registerRecipient(1n, data);

  await RecipientRegistrationTx.wait();
};
