import {
  scrollProjects,
  transformScrollProjectData,
  readMigrationData,
} from "./constants/scrollMigration";
import { task } from "hardhat/config";
import { Deployments } from "../scripts/utils/scriptTask";

task("transferOwnership", "migrate profiles to a new network").setAction(
  async (_, hre) => {
    const { ethers, network } = hre;
    const [signer] = await ethers.getSigners();

    transformScrollProjectData(scrollProjects);

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
    const scrollProjectData = readMigrationData();

    for (let i = 0; i < scrollProjectData.length; i++) {
      const project = scrollProjectData[i];
      const profileId = (
        await RegistryContract.getProfileByAnchor(project.newAnchor)
      ).id;

      const pendingOwner = await RegistryContract.profileIdToPendingOwner(
        profileId
      );
      if (pendingOwner.toLowerCase() === project.members[0].toLowerCase()) {
        console.log("Already transferred", i);
      } else {
        const transferOwnership =
          await RegistryContract.updateProfilePendingOwner(
            profileId,
            project.members[0]
          );
        await transferOwnership.wait();
        console.log("updateProfilePendingOwner for profile: ", i);
      }
      const isMember = await RegistryContract.isMemberOfProfile(
        profileId,
        signer.address
      );

      if (isMember) {
        const removeMember = await RegistryContract.removeMembers(profileId, [
          signer.address,
        ]);
        await removeMember.wait();
        console.log("Removed migration member from profile: ", i);
      } else {
        console.log("Migration member already removed from profile: ", i);
      }
    }
  }
);
