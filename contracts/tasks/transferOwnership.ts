// import {
//   scrollProjects,
//   transformScrollProjectData,
//   readMigrationData,
// } from "./constants/scrollMigration";
// import { task } from "hardhat/config";
// import { Deployments } from "../scripts/utils/scriptTask";

// task("migrate", "migrate profiles to a new network").setAction(
//   async (_, hre) => {
//     const { ethers, network } = hre;
//     const [signer] = await ethers.getSigners();

//     transformScrollProjectData(scrollProjects);

//     const chainId = Number(network.config.chainId);

//     console.log(chainId);

//     const deployments = new Deployments(chainId, "maci");

//     const alloDeployments = new Deployments(chainId, "allo");

//     const MACIDeployments = deployments.get(chainId);

//     const DeployedContracts = MACIDeployments as any;
//     let Allo = DeployedContracts?.Allo?.AlloAddress;
//     let Registry = DeployedContracts?.Registry?.RegistryAddress;

//     if (!Allo || !Registry) {
//       Allo = alloDeployments.getAllo();
//       Registry = alloDeployments.getRegistry();
//     }

//     console.log("Deploying contracts with the account:", signer.address);
//     console.log("Allo", Allo);
//     console.log("Registry", Registry);
//     const rounds = await hre.run("deployRounds", {});

//     const RegistryContract = await ethers.getContractAt(
//       "Registry",
//       Registry,
//       signer
//     );
//     console.log("MIGRATE");

//     const scrollProjectData = readMigrationData();

//         for (let i = 0; i < scrollProjectData.length; i++) {
//             const project = scrollProjectData[i];
//             const transferOwnership = await RegistryContract.updateProfilePendingOwner(project.roundId,
                
//     }
//   }
// );
