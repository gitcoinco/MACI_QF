import { WalletClient } from "wagmi";
import { Keypair as GenKeyPair } from "../../features/api/voting";

function getMessageToSign(chainID: number, roundID: string) {
  return `Sign this message to get your public key for MACI voting on Allo for the round with address ${roundID} on chain ${chainID}`;
}
export const getMACIKeys = async ({
  chainID,
  roundID,
  walletAddress,
  walletClient,
}: {
  chainID: number;
  roundID: string;
  walletAddress: string;
  walletClient: WalletClient;
}) => {
  const MACIKeys = localStorage.getItem("MACIKeys");
  const address = walletAddress.toLowerCase() as string;

  let signatureSeeds;

  try {
    signatureSeeds = JSON.parse(MACIKeys ? MACIKeys : "{}");
  } catch (e) {
    console.error("Failed to parse MACIKeys from localStorage:", e);
    signatureSeeds = {};
  }

  // Ensure the structure exists
  if (
    typeof signatureSeeds.rounds !== "object" ||
    signatureSeeds.rounds === null
  ) {
    signatureSeeds.rounds = {};
  }

  if (
    typeof signatureSeeds.rounds[chainID] !== "object" ||
    signatureSeeds.rounds[chainID] === null
  ) {
    signatureSeeds.rounds[chainID] = {};
  }

  if (
    typeof signatureSeeds.rounds[chainID][roundID] !== "object" ||
    signatureSeeds.rounds[chainID][roundID] === null
  ) {
    signatureSeeds.rounds[chainID][roundID] = {};
  }

  let signature = signatureSeeds.rounds[chainID][roundID][address];

  if (!signature) {
    try {
      signature = await walletClient.signMessage({
        message: getMessageToSign(chainID, roundID),
      });
    } catch (e) {
      console.error("Failed to sign message:", e);
    }

    // Ensure the nested structure exists before assigning the new signature
    if (!signatureSeeds.rounds[chainID][roundID]) {
      signatureSeeds.rounds[chainID][roundID] = {};
    }

    signatureSeeds.rounds[chainID][roundID][address] = signature;
    localStorage.setItem("MACIKeys", JSON.stringify(signatureSeeds));
  }
  return signature;
};

export const signAndStoreSignatures = async ({
  pairs,
  walletClient,
  address,
}: {
  pairs: { chainId: number; roundId: string }[];
  walletClient: WalletClient;
  address: string;
}) => {
  for (const pair of pairs) {
    const { chainId, roundId } = pair;
    await getMACIKeys({
      chainID: chainId,
      roundID: roundId,
      walletAddress: address,
      walletClient: walletClient,
    });
  }
};

export const getMACIKey = ({
  chainID,
  roundID,
  walletAddress,
}: {
  chainID: number;
  roundID: string;
  walletAddress: string;
}) => {
  const MACIKeys = localStorage.getItem("MACIKeys");
  const address = walletAddress.toLowerCase() as string;

  let signatureSeeds;

  try {
    signatureSeeds = JSON.parse(MACIKeys ? MACIKeys : "{}");
  } catch (e) {
    console.error("Failed to parse MACIKeys from localStorage:", e);
    signatureSeeds = {};
  }

  // Ensure the structure exists
  if (
    typeof signatureSeeds.rounds !== "object" ||
    signatureSeeds.rounds === null
  ) {
    signatureSeeds.rounds = {};
  }

  if (
    typeof signatureSeeds.rounds[chainID] !== "object" ||
    signatureSeeds.rounds[chainID] === null
  ) {
    signatureSeeds.rounds[chainID] = {};
  }

  if (
    typeof signatureSeeds.rounds[chainID][roundID] !== "object" ||
    signatureSeeds.rounds[chainID][roundID] === null
  ) {
    signatureSeeds.rounds[chainID][roundID] = {};
  }

  const signature = signatureSeeds.rounds[chainID][roundID][address];

  if (!signature) {
    return;
  }
  return signature;
};

export const generatePubKey = async (
  walletClient: WalletClient,
  roundID: string,
  chainID: string
) => {
  const MACIKeys = localStorage.getItem("MACIKeys");

  const address = walletClient.account.address.toLowerCase();

  let signatureSeeds;

  try {
    signatureSeeds = JSON.parse(MACIKeys ? MACIKeys : "{}");
  } catch (e) {
    signatureSeeds = {};
  }

  // Ensure the structure exists
  if (
    typeof signatureSeeds.rounds !== "object" ||
    signatureSeeds.rounds === null
  ) {
    signatureSeeds.rounds = {};
  }

  if (
    typeof signatureSeeds.rounds[chainID] !== "object" ||
    signatureSeeds.rounds[chainID] === null
  ) {
    signatureSeeds.rounds[chainID] = {};
  }

  if (
    typeof signatureSeeds.rounds[chainID][roundID] !== "object" ||
    signatureSeeds.rounds[chainID][roundID] === null
  ) {
    signatureSeeds.rounds[chainID][roundID] = {};
  }

  let signature = signatureSeeds.rounds[chainID][roundID][address];

  if (!signature) {
    signature = await walletClient.signMessage({
      message: getMessageToSign(Number(chainID), roundID),
    });

    // Ensure the nested structure exists before assigning the new signature
    if (!signatureSeeds.rounds[chainID][roundID]) {
      signatureSeeds.rounds[chainID][roundID] = {};
    }

    signatureSeeds.rounds[chainID][roundID][address] = signature;
    localStorage.setItem("MACIKeys", JSON.stringify(signatureSeeds));
  }

  const getUserPubKey = GenKeyPair.createFromSeed(signature);

  return getUserPubKey;
};

export const generatePubKeyWithSeed = (seed: string) => {
  const getUserPubKey = GenKeyPair.createFromSeed(seed);
  return getUserPubKey;
};
