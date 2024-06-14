import { WalletClient } from "wagmi";


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

  console.log("signatureSeeds after ensuring structure:", signatureSeeds);

  let signature = signatureSeeds.rounds[chainID][roundID][address];
  console.log("signature", signature);
  console.log("signatureSeeds", signatureSeeds);

  if (!signature) {
    signature = await walletClient.signMessage({
      message: `Sign this message to get your public key for MACI voting on Allo for the round with address ${roundID} on chain ${chainID}`,
    });

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

export const signAndStoreSignature = async ({
  pair,
  walletClient,
  address,
}: {
  pair: { chainId: number; roundId: string };
  walletClient: WalletClient;
  address: string;
}) => {
  const { chainId, roundId } = pair;
  await getMACIKeys({
    chainID: chainId,
    roundID: roundId,
    walletAddress: address,
    walletClient: walletClient,
  });
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

  console.log("signatureSeeds after ensuring structure:", signatureSeeds);

  const signature = signatureSeeds.rounds[chainID][roundID][address];
  console.log("signature", signature);
  console.log("signatureSeeds", signatureSeeds);

  if (!signature) {
    return;
  }
  return signature;
};