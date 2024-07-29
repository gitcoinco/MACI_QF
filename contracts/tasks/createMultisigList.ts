import { task } from "hardhat/config";
import { readMigrationData } from "./constants/scrollMigration";
task(
  "findMultisigs",
  "checks which migrated projects make use of a multisig needed as migration to a new network requires new multisigs"
).setAction(async (_, hre) => {
  const { ethers } = hre;
  const migratedData = readMigrationData();
  const projectList = [];
    for (const project of migratedData) {
      const codeBytes = await ethers.provider.getCode(project.recipient);
      //   Check if the bytes are not empty
      const isMultisig = codeBytes !== "0x";

      if (isMultisig && project.status === "APPROVED") {
        projectList.push(project);
      }
    }
  
  console.table(
    projectList.map((project) => {
      return {
        name: project.name,
        recipient: project.recipient,
        anchor: project.newAnchor,
        oldAnchor: project.oldAnchor,
      };
    })
  );
});

