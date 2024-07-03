import { task } from "hardhat/config";
import { Keypair } from "maci-domainobjs";
import { isBytesLike, keccak256 } from "ethers";
import { GenKeyPair } from "./helpers/utils";

task("genKeypair", "Create a new MACI keyPair")
  .addOptionalParam(
    "password",
    "Optional password for generating the key pair",
    "string"
  )
  .setAction(async (taskArgs) => {
    try {
      let newMaciKey;
      if (taskArgs.password) {
        let seed;
        if (isBytesLike(taskArgs.password)) {
          seed = taskArgs.password;
        } else {
          seed = keccak256(Buffer.from(taskArgs.password));
        }
        newMaciKey = GenKeyPair.createFromSeed(seed);
      } else {
        newMaciKey = new Keypair();
      }
      console.table({
        privateKey: newMaciKey.privKey.serialize(),
        publicKey: newMaciKey.pubKey.serialize(),
      });
    } catch (error) {
      console.error("Error in genKeypair:", error);
      process.exitCode = 1;
    }
  });
