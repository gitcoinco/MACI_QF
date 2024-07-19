import { ScrollProjectData, scrollProjects } from "./constants/scrollMigration";
import { task } from "hardhat/config";
import { Deployments } from "../scripts/utils/scriptTask";
import { BigNumberish } from "ethers";
interface ProfileData {
  nonce: BigNumberish;
  name: string;
  metadata: {
    protocol: BigNumberish;
    pointer: string;
  };
  owner: string;
  members: string[];
}
task("migrate", "migrate profiles to a new network").setAction(async (_, hre) => {
  const { ethers, network } = hre;
  const [signer] = await ethers.getSigners();

  const chainId = Number(network.config.chainId);

  console.log(chainId);
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
  console.log("MIGRATE");
  const profileDatas: ProfileData[] = scrollProjects.map(
    ({
      project: { nonce, name, createdByAddress: owner, metadataCid },
    }: ScrollProjectData) => ({
      nonce: Number(nonce),
      name,
      metadata: { protocol: 1, pointer: metadataCid },
      owner: signer.address,
      members: [owner],
    })
  );
  for (let i = 0; i < profileDatas.length; i++) {
    const profile = profileDatas[i];
    console.log("Profile:", profile, i);

    const createTx = await RegistryContract.createProfile(
      profile.nonce,
      profile.name,
      { protocol: 1, pointer: profile.metadata.pointer },
      profile.owner,
      profile.members
    );

    console.log("Txn hash:", createTx.hash);

    const response = await createTx.wait();
    console.log("Response from txn:", response);
  }
});
