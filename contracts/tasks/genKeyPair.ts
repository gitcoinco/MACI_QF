import { task } from "hardhat/config";
import { Keypair } from "maci-domainobjs";

task("genKeypair", "Create a new MACI keyPair").setAction(async (_, hre) => {
  try {
    const newMaciKey = new Keypair();
    console.table({
      privateKey: newMaciKey.privKey.serialize(),
      publicKey: newMaciKey.pubKey.serialize(),
    });
  } catch (error) {
    console.error("Error in distributeFunds:", error);
    process.exitCode = 1;
  }
});

export default {};
