import {
  readScrollProjects,
  scrollProjects,
  ScrollProjectDataAfterEdit,
  transformScrollProjectData,
  strategiesToDeployMetadata,
  getRoundID,
  transformToProfileData,
  readMigrationData,
} from "./constants/scrollMigration";
import { subtask, task } from "hardhat/config";
import { Deployments } from "../scripts/utils/scriptTask";
import fs from "fs";
import { ZeroAddress } from "ethers";
import { PubKey } from "maci-domainobjs";
import { randomInt } from "crypto";

task("migrate", "migrate profiles to a new network").setAction(
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

    console.log("Deploying contracts with the account:", signer.address);
    console.log("Allo", Allo);
    console.log("Registry", Registry);
    // const rounds = await hre.run("deployRounds", {});
    const rounds = [51, 52, 53];
    
    const RegistryContract = await ethers.getContractAt(
      "Registry",
      Registry,
      signer
    );
    console.log("MIGRATE");

    const scrollProjectData = readScrollProjects("scrollProjects.json");

    // const profileDatas = transformToProfileData(
    //   scrollProjectData,
    //   signer.address
    // );
    const profileDatas = readMigrationData();

    const migratedProjectsData = profileDatas;

    const resApproved = scrollProjectData.map((data) =>
      data.applications
        .map((app) => ({
          projectName: app.project.name,
          status: app.application.status,
        }))
        .filter((app) => app.status === "APPROVED")
    );

    console.table(resApproved[0].map((app) => ({ ...app, roundType: "Tech" })));

    console.table(
      resApproved[1].map((app) => ({ ...app, roundType: "Short Events" }))
    );

    console.table(
      resApproved[2].map((app) => ({ ...app, roundType: "Long Events" }))
    );

    const resRejected = scrollProjectData.map((data) =>
      data.applications
        .map((app) => ({
          projectName: app.project.name,
          status: app.application.status,
        }))
        .filter((app) => app.status !== "APPROVED")
        .map((app) => {
          return { name: app.projectName, status: "REJECTED" };
        })
    );

    console.table(resRejected[0].map((app) => ({ ...app, roundType: "Tech" })));

    console.table(
      resRejected[1].map((app) => ({ ...app, roundType: "Short Events" }))
    );

    console.table(
      resRejected[2].map((app) => ({ ...app, roundType: "Long Events" }))
    );

    const trackDuplicates: Record<string, number> = {};
    for (let i = 0; i < profileDatas.length; i++) {
      const profile = profileDatas[i];

      const duplicateIndex = trackDuplicates[profile.name];
      if (duplicateIndex > 0) {
        migratedProjectsData[i].newAnchor =
          migratedProjectsData[duplicateIndex].newAnchor;
        continue;
      }
      trackDuplicates[profile.name] = duplicateIndex;

      if (profile.profileCreated) {
        continue;
      }

      const createTx = await RegistryContract.createProfile(
        profile.nonce,
        profile.name,
        { protocol: 1, pointer: profile.metadata.pointer },
        signer.address,
        [profile.owner]
      );
      console.log("Creating profile for", profile.name, "with i = ", i);
      const createProfileReceipt = await createTx.wait();
      const profileId = createProfileReceipt?.logs[0].topics[1] || "";

      const anchorAddress = (await RegistryContract.getProfileById(profileId))
        .anchor;

      migratedProjectsData[i].newAnchor = anchorAddress;
      migratedProjectsData[i].profileCreated = true;

      fs.writeFileSync(
        "migratedProjects.json",
        JSON.stringify(migratedProjectsData, null, 2)
      );
    }

    const batchSize = 20;
    const batchMap: Record<
      number,
      {
        rounds: number[];
        bytes: string[];
      }
    > = {};

    const AlloContract = await ethers.getContractAt("Allo", Allo, signer);

    const registreesLength = migratedProjectsData.length;
    let registrationCount = 0;

    for (let i = 0; i < registreesLength; i++) {
      const profile = migratedProjectsData[i];

      const initStruct = [
        profile.newAnchor,
        profile.recipient,
        [1, profile.applicationMetadataCID],
      ];

      const types = ["address", "address", "(uint256, string)"];
      const AbiCoder = new ethers.AbiCoder();
      const roundId = getRoundID(profile.roundId, rounds ?? []);

      const bytes = AbiCoder.encode(types, initStruct);

      if (!batchMap[registrationCount]) {
        batchMap[registrationCount] = {
          rounds: [],
          bytes: [],
        };
      }

      batchMap[registrationCount].rounds.push(roundId);
      batchMap[registrationCount].bytes.push(bytes);

      if (batchMap[registrationCount].bytes.length >= batchSize) {
        const batch = batchMap[registrationCount];

        const batchRegisterTx = await AlloContract.batchRegisterRecipient(
          batch.rounds,
          batch.bytes
        );
        await batchRegisterTx.wait();

        console.log("Batch registered", batch.bytes.length, "projects");

        // Mark the projects as registered
        for (let j = 0; j < batch.bytes.length; j++) {
          migratedProjectsData[i - j].registered = true;
        }

        registrationCount++;
        batchMap[registrationCount] = {
          rounds: [],
          bytes: [],
        };
      }

      migratedProjectsData[i].roundId = roundId;

      fs.writeFileSync(
        "migratedProjects.json",
        JSON.stringify(migratedProjectsData, null, 2)
      );
    }

    // Process any remaining entries that didn't fill the last batch
    if (batchMap[registrationCount]?.bytes.length) {
      const batch = batchMap[registrationCount];

      const batchRegisterTx = await AlloContract.batchRegisterRecipient(
        batch.rounds,
        batch.bytes
      );
      await batchRegisterTx.wait();

      console.log("Batch registered", batch.bytes.length, " projects");

      // Mark the remainder projects as registered after the last batch
      for (let j = 0; j < batch.bytes.length; j++) {
        migratedProjectsData[registreesLength - j - 1].registered = true;
      }
    }

    const reviewDataByRound: Record<
      number,
      {
        anchors: string[];
        lastUpdatedTimes: number[];
        statuses: number[];
      }
    > = {};

    for (let i = 0; i < migratedProjectsData.length; i++) {
      const profile = migratedProjectsData[i];
      const roundId = profile.roundId;
      if (!reviewDataByRound[roundId]) {
        reviewDataByRound[roundId] = {
          anchors: [],
          lastUpdatedTimes: [],
          statuses: [],
        };
      }

      reviewDataByRound[roundId].anchors.push(profile.newAnchor);
      reviewDataByRound[roundId].lastUpdatedTimes.push(0);
      const status = profile.status === "APPROVED" ? 2 : 3;
      migratedProjectsData[i].status = status === 2 ? "APPROVED" : "REJECTED";
      reviewDataByRound[roundId].statuses.push(status);
    }

    fs.writeFileSync(
      "migratedProjects.json",
      JSON.stringify(migratedProjectsData, null, 2)
    );

    for (const roundId in reviewDataByRound) {
      const roundData = reviewDataByRound[roundId];
      const AlloContract = await ethers.getContractAt("Allo", Allo, signer);

      const strategy = (await AlloContract.getPool(roundId)).strategy;

      const MACIQFStrategy = await ethers.getContractAt(
        "MACIQF",
        strategy,
        signer
      );
      const reviewRecipientsTx = await MACIQFStrategy.reviewRecipients(
        roundData.anchors,
        roundData.lastUpdatedTimes,
        roundData.statuses
      );
      await reviewRecipientsTx.wait();

      console.log("Reviewed round", roundId);
    }
    let numberOfErrorStates = 0;
    for (let i = 0; i < migratedProjectsData.length; i++) {
      const profile = migratedProjectsData[i];
      const roundId = profile.roundId;
      const AlloContract = await ethers.getContractAt("Allo", Allo, signer);

      const strategy = (await AlloContract.getPool(roundId)).strategy;

      const MACIQFStrategy = await ethers.getContractAt(
        "MACIQF",
        strategy,
        signer
      );

      const recipientStatus = (
        await MACIQFStrategy.getRecipient(profile.newAnchor)
      ).status;

      const expectedRecipientStatus =
        profile.status === "APPROVED"
          ? 2
          : profile.status === "REJECTED"
          ? 3
          : 5;
      if (Number(recipientStatus) !== expectedRecipientStatus) {
        numberOfErrorStates++;
        migratedProjectsData[i].reviewed = false;
      } else {
        migratedProjectsData[i].reviewed = true;
      }
    }
    fs.writeFileSync(
      "migratedProjects.json",
      JSON.stringify(migratedProjectsData, null, 2)
    );
    console.log("Number of error states", numberOfErrorStates);
  }
);

subtask("deployRounds", async (_, hre) => {
  const { ethers, network } = hre;
  const [deployer] = await ethers.getSigners();

  const chainId = Number(network.config.chainId);

  const deployments = new Deployments(chainId, "maci");

  const alloDeployments = new Deployments(chainId, "allo");

  const MACIDeployments = deployments.get(chainId);

  const DeployedContracts = MACIDeployments as any;

  console.log("Deploying contracts with the account:", deployer.address);

  if (MACIDeployments?.MACIQFStrategy?.MACIQFStrategyAddress) {
    let Allo = DeployedContracts?.Allo?.AlloAddress;
    let Registry = DeployedContracts?.Registry?.RegistryAddress;

    if (!Allo || !Registry) {
      Allo = alloDeployments.getAllo();
      Registry = alloDeployments.getRegistry();
    }

    const MACIQFStrategyAddress =
      MACIDeployments.MACIQFStrategy.MACIQFStrategyAddress;

    const AlloContract = await ethers.getContractAt("Allo", Allo);
    const RegistryContract = await ethers.getContractAt("Registry", Registry);
    const rand = randomInt(100000000);
    // const createProfile = await RegistryContract.createProfile(
    //   randomInt(100000000),
    //   `Script Migration Profile ${rand}`,
    //   {
    //     protocol: 1,
    //     pointer: "bafkreif5dm6t23dmsleppvuq2c24bjwdsvbs6hhy4phjk3u2memmdk4pni",
    //   },
    //   deployer.address,
    //   [deployer.address]
    // );

    // const createProfileReceipt = await createProfile.wait();

    // const profileId = createProfileReceipt?.logs[0].topics[1] || "";

    // const optimismZuzaluProgramId =
    //   "0xd790e184c952f7227cb87063f858aaa486aa9722f34998282cfecd6d52e2ee9c";
    const profileId =
      "0xd790e184c952f7227cb87063f858aaa486aa9722f34998282cfecd6d52e2ee9c";
    // --------------------------------------------------  Create Strategy  --------------------------------------------------

    const time = BigInt(
      (await ethers.provider.getBlock(await ethers.provider.getBlockNumber()))!
        .timestamp
    );
    // July 23th, 23:59 UTC
    const startdate = new Date(Date.UTC(2024, 6, 23, 23, 59, 0));
    const startepochTime = startdate.getTime();
    const startTime = BigInt(startepochTime / 1000);

    const enddate = new Date(Date.UTC(2024, 7, 6, 23, 59, 0));
    const endepochTime = enddate.getTime();
    const endTime = BigInt(endepochTime / 1000);

    let initializeParams = [
      // RegistryGatting
      true,
      // MetadataRequired
      true,
      // RegistrationStartTime
      BigInt(time),
      // RegistrationEndTime
      BigInt(time + BigInt(5500)),
      // AllocationStartTime
      startTime,
      // AllocationEndTime
      endTime,
    ];
    // Aug 6th, 23:59 UTC

    const pubk = PubKey.deserialize(
      "macipk.106b0fefdab3dccf449a720a8d00e066ebe65907e49a5146dc788d231f2856eb"
    );

    let CoordinatorPublicKey = [
      BigInt(pubk.asContractParam().x),
      BigInt(pubk.asContractParam().y),
    ];
    const coordinatorAddress = "0x00De4B13153673BCAE2616b67bf822500d325Fc3";

    const maxContributionAmountAllowlisted = 10n ** 18n / 10n;
    const maxContributionAmountNonAllowlisted = 0n;

    let AbiCoder = new ethers.AbiCoder();

    // ZUZALU MONTENEGRO + ZUCONNECT INSTABUL
    const eventIDs = [
      "124828273171201652176662279377030868875",
      "192993346581360151154216832563903227660",
    ];

    let encodedEventIDs = AbiCoder.encode(["uint256[]"], [eventIDs]);

    let MaciParams = [
      // coordinator:
      coordinatorAddress,
      // coordinatorPubKey:
      CoordinatorPublicKey,
      MACIDeployments.ClonableMACIFactory.ClonableMACIFactoryAddress,
      //   Allowlisted Registry
      MACIDeployments.ZuPassRegistry.ZuPassRegistryAddress,
      //   Non Allowlisted Registry
      ZeroAddress,
      // maci_id
      0,
      // VALID_EVENT_IDS
      encodedEventIDs,
      "0x",
      // maxContributionAmountForZupass
      maxContributionAmountAllowlisted,
      // maxContributionAmountForNonZupass
      maxContributionAmountNonAllowlisted,
    ];

    let initStruct = [initializeParams, MaciParams];

    let types = [
      "((bool,bool,uint256,uint256,uint256,uint256),(address,(uint256,uint256),address,address,address,uint8,bytes,bytes,uint256,uint256))",
    ];

    let bytes = AbiCoder.encode(types, [initStruct]);

    // const addStrategy = await AlloContract.addToCloneableStrategies(
    //   MACIQFStrategyAddress
    // );

    // await addStrategy.wait();

    // get the values from the strategiesToDeployMetadata object in array format
    const strategiesToDeployMetadataValues = Object.values(
      strategiesToDeployMetadata
    );

    //   Create Pools in a loop for each strategy and pass the cid instead of "test
    //   create a mapping from roundId to poolId
    const pools: number[] = [];

    for (let i = 0; i < strategiesToDeployMetadataValues.length; i++) {
      let createPool = await AlloContract.createPool(
        profileId,
        MACIQFStrategyAddress,
        bytes,
        "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        0n,
        {
          protocol: 1,
          pointer: strategiesToDeployMetadataValues[i],
        },
        [deployer.address],
        { value: 0n }
      );

      const createPoolReceipt = await createPool.wait();
      const hexPoolId = createPoolReceipt?.logs[21].topics[1];
      const poolId = ethers.toBigInt(hexPoolId ?? "0x0");
      pools.push(Number(poolId));
    }
    return pools ?? [];
  }
});
