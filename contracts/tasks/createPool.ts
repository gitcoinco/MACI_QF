import { randomInt } from "crypto";
import { Deployments } from "../scripts/utils/scriptTask";
import { ZeroAddress } from "ethers";
import { task } from "hardhat/config";
import { PubKey } from "maci-domainobjs";

task("createPool", "create a new MACI Pool").setAction(async (_, hre) => {
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

    console.log("Creating MACIQFStrategy...");
    console.log("Allo address:", Allo);
    console.log("Registry address:", Registry);

    const MACIQFStrategyAddress =
      MACIDeployments.MACIQFStrategy.MACIQFStrategyAddress;

    const AlloContract = await ethers.getContractAt("Allo", Allo);
    const RegistryContract = await ethers.getContractAt("Registry", Registry);
    const createProfile = await RegistryContract.createProfile(
      randomInt(1000000),
      "Test",
      {
        protocol: 1,
        pointer: "test",
      },
      deployer.address,
      [deployer.address]
    );

    const createProfileReceipt = await createProfile.wait();

    const profileId = createProfileReceipt?.logs[0].topics[1] || "";

    // --------------------------------------------------  Create Strategy  --------------------------------------------------

    const time = BigInt(
      (await ethers.provider.getBlock(await ethers.provider.getBlockNumber()))!
        .timestamp
    );

    let initializeParams = [
      // RegistryGatting
      false,
      // MetadataRequired
      true,
      // RegistrationStartTime
      BigInt(time + BigInt(1)),
      // RegistrationEndTime
      BigInt(time + BigInt(199)),
      // AllocationStartTime
      BigInt(time + BigInt(200)),
      // AllocationEndTime
      BigInt(time + BigInt(500)),
    ];

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

    const addStrategy = await AlloContract.addToCloneableStrategies(
      MACIQFStrategyAddress
    );

    await addStrategy.wait();

    const strategiesToDeployMetadata = {
      tech: "bafkreibezqxtxyphhtrabvzsveq57my5ujtaxreyjfhft4yq5ue6mn37xi",
      short: "bafkreicop26icyq4gwgt7tjkgxi52y77vlfmjhldni2kyimlx4cmhb5c5e",
      long: "bafkreifabravfnimkaaf5wlzakjqe624xuvzapvydejoz2gztpnaxyq2wy",
    };

    // get the values from the strategiesToDeployMetadata object in array format
    const strategiesToDeployMetadataValues = Object.values(
      strategiesToDeployMetadata
    );

    //   Create Pools in a loop for each strategy and pass the cid instead of "test

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
      console.log(poolId);
    }
  }
});
