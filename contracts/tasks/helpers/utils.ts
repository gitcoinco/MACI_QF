import { existsSync, mkdirSync } from "fs";
import path from "path";
import { Ipfs, getTalyFilePath } from "../../test/utils";
import { isBytesLike, keccak256 } from "ethers";
import {
  Keypair as MaciKeypair,
  PrivKey,
  PubKey,
  Keypair,
} from "maci-domainobjs";
import { encodeAbiParameters, parseAbiParameters } from "viem";
export const getOutputDir = (roundId: number, chainId: number) => {
  const proofOutputDirectory = "./proof_output";

  const outputDir = path.join(
    proofOutputDirectory,
    `roundId_${roundId}_chainId_${chainId}`
  );
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  return outputDir;
};

export const getCircuitsDir = () => {
  let circuitDirectory = "./zkeys/zkeys";
  if (!existsSync(circuitDirectory)) {
    circuitDirectory = "../../zkeys/zkeys";
  }
  if (!existsSync(circuitDirectory)) {
    throw new Error("Circuit directory not found");
  }
  return circuitDirectory;
};

export const uploadToIpfs = async (
  outputDir: string
) => {
  const tallyFile = getTalyFilePath(outputDir);
  const tallyHash = await Ipfs.pinFile(tallyFile);
  return tallyHash;
};

export const generatePubKeyWithSeed = (seed: string) => {
  const getUserPubKey = GenKeyPair.createFromSeed(seed);
  return getUserPubKey;
};

/**
 * Derives the MACI private key from the users signature hash
 * @param hash - user's signature hash
 * @return The MACI private key
 */
function genPrivKey(hash: string): PrivKey {
  if (!isBytesLike(hash)) {
    throw new Error(`genPrivKey() error. Hash must be a hex string: ${hash}`);
  }

  let rawPrivKey = BigInt(hash);
  let pubKey: PubKey | null = null;

  for (let counter = 1; pubKey === null; counter++) {
    try {
      const privKey = new PrivKey(rawPrivKey);
      // this will throw 'Invalid public key' if key is not on the Baby Jubjub elliptic curve
      const keypair = new Keypair(privKey);
      pubKey = keypair.pubKey;
    } catch {
      const data = encodeAbiParameters(parseAbiParameters("uint256, uint256"), [
        rawPrivKey,
        BigInt(counter),
      ]);
      rawPrivKey = BigInt(keccak256(data));
    }
  }

  return new PrivKey(rawPrivKey);
}

export class GenKeyPair extends MaciKeypair {
  /**
   * generate a key pair from a seed
   * @param seed The sha256 hash of signature
   * @returns key pair
   */
  static createFromSeed(seed: string): Keypair {
    if (!seed) {
      throw new Error("Keypair seed cannot be empty");
    }
    const sanitizedSeed = seed.startsWith("0x") ? seed : "0x" + seed;
    const privKey = genPrivKey(sanitizedSeed);
    return new Keypair(privKey);
  }
}
