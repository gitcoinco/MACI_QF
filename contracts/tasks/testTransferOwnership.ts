
import { task } from "hardhat/config";
import { Deployments } from "../scripts/utils/scriptTask";
import { randomInt } from "crypto";

task("testTransferOwnership", "migrate profiles to a new network").setAction(
  async (_, hre) => {
    const { ethers, network } = hre;
    const [signer] = await ethers.getSigners();

    const chainId = Number(network.config.chainId);

    const deployments = new Deployments(chainId, "maci");

    const alloDeployments = new Deployments(chainId, "allo");

    const MACIDeployments = deployments.get(chainId);

    const DeployedContracts = MACIDeployments as any;
    let Allo = DeployedContracts?.Allo?.AlloAddress;
    let Registry = DeployedContracts?.Registry?.RegistryAddress;

    if (!Allo || !Registry) {
      Allo = alloDeployments.getAllo();
      Registry = alloDeployments.getRegistry();
    }

    const RegistryContract = await ethers.getContractAt(
      "Registry",
      Registry,
      signer
    );

    const newMember = "0x600f8D1E47F6972c216c2760B4E1455D4ce8E37e";
    const cid = "bafkreiha4bo4add3h4y6ybx324d5x73au5qwvtomdpeuhw23fw6ktb6piq";
    const createTx = await RegistryContract.createProfile(
      randomInt(1000000),
      "test",
      { protocol: 1, pointer: cid },
      signer.address,
      [newMember]
    );
    const createProfileReceipt = await createTx.wait();
    const profileId = createProfileReceipt?.logs[0].topics[1] || "";
    const transferOwnership = await RegistryContract.updateProfilePendingOwner(
      profileId,
      newMember
    );
    await transferOwnership.wait();
  }
);
