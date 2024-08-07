import {
  IVerifyingKeyStruct,
  deployPoseidonContracts,
  deployVkRegistry,
  deployVerifier,
} from "maci-contracts";
import { MaciParameters } from "../test/utils/maciParameters";
import { Deployments } from "../scripts/utils/scriptTask";
import { BigNumberish } from "ethers";
import { ZuzaluEvents } from "../scripts/constants/ZuzaluEvents";
import { uuidToBigInt, hexToBigInt } from "@pcd/util";
import { task } from "hardhat/config";

task(
  "deploy",
  "deployMACI"
).setAction(async (_, hre) => {
  const { ethers, network, upgrades } = hre;
  const [deployer] = await ethers.getSigners();
  const deployParams = await MaciParameters.getMACIParameters();

    const chainId = Number(network.config.chainId);
    
    console.log(chainId)
  const deployments = new Deployments(chainId, "maci");

  const MACIDeployments = deployments.get(chainId);

  const DeployedContracts = MACIDeployments as any;

  console.log("Deploying contracts with the account:", deployer.address);

  if (!MACIDeployments?.VkRegistry?.vkRegistryContractAddress) {
    const vkRegistryContract = await deployVkRegistry(deployer, true);

    const vkRegistryContractAddress = await vkRegistryContract.getAddress();

    console.log("vkRegistryContract deployed at:", vkRegistryContractAddress);

    const QVMODE = 0n;

    const setKeysTx = await vkRegistryContract.setVerifyingKeys(
      deployParams.stateTreeDepth,
      deployParams.treeDepths.intStateTreeDepth,
      deployParams.treeDepths.messageTreeDepth,
      deployParams.treeDepths.voteOptionTreeDepth,
      deployParams.getMessageBatchSize(),
      QVMODE,
      deployParams.processVk.asContractParam() as IVerifyingKeyStruct,
      deployParams.tallyVk.asContractParam() as IVerifyingKeyStruct,
      {
        gasLimit: 1000000,
      }
    );

    await setKeysTx.wait();

    console.log("Verifying keys set");

    DeployedContracts.VkRegistry = {
      name: "VkRegistry",
      vkRegistryContractAddress: vkRegistryContractAddress,
    };

    deployments.write(DeployedContracts);
    // await verifyContract(vkRegistryContractAddress, []);
  } else {
    console.log(
      "Reusing VkRegistry at :",
      MACIDeployments.VkRegistry.vkRegistryContractAddress
    );
    DeployedContracts.VkRegistry = MACIDeployments.VkRegistry;
  }

  if (!MACIDeployments?.Verifier?.verifierContractAddress) {
    const verifierContract = await deployVerifier(deployer, true);

    const verifierContractAddress = await verifierContract.getAddress();

    console.log("verifierContract deployed at:", verifierContractAddress);

    DeployedContracts.Verifier = {
      name: "Verifier",
      verifierContractAddress: verifierContractAddress,
    };
    deployments.write(DeployedContracts);
    // await verifyContract(verifierContractAddress, []);
  } else {
    console.log(
      "Reusing Verifier at :",
      MACIDeployments.Verifier.verifierContractAddress
    );
    DeployedContracts.Verifier = MACIDeployments.Verifier;
  }

  if (!MACIDeployments?.PosseidonAddresses) {
    const {
      PoseidonT3Contract,
      PoseidonT4Contract,
      PoseidonT5Contract,
      PoseidonT6Contract,
    } = await deployPoseidonContracts(undefined, undefined, true);

    const poseidonAddrs = await Promise.all([
      PoseidonT3Contract.getAddress(),
      PoseidonT4Contract.getAddress(),
      PoseidonT5Contract.getAddress(),
      PoseidonT6Contract.getAddress(),
    ]).then(([poseidonT3, poseidonT4, poseidonT5, poseidonT6]) => ({
      poseidonT3,
      poseidonT4,
      poseidonT5,
      poseidonT6,
    }));

    console.log("Poseidon Contracts deployed at:", poseidonAddrs);

    DeployedContracts.PosseidonAddresses = [
      {
        name: "PoseidonT3",
        address: poseidonAddrs.poseidonT3,
      },
      {
        name: "PoseidonT4",
        address: poseidonAddrs.poseidonT4,
      },
      {
        name: "PoseidonT5",
        address: poseidonAddrs.poseidonT5,
      },
      {
        name: "PoseidonT6",
        address: poseidonAddrs.poseidonT6,
      },
    ];
    deployments.write(DeployedContracts);
    try {
      // await verifyContract(poseidonAddrs.poseidonT3, []);
      // await verifyContract(poseidonAddrs.poseidonT4, []);
      // await verifyContract(poseidonAddrs.poseidonT5, []);
      // await verifyContract(poseidonAddrs.poseidonT6, []);
    } catch (e) {
      console.log("Error verifying Poseidon contracts", e);
    }
  } else {
    const poseidonAddrs = MACIDeployments.PosseidonAddresses.map(
      (poseidon: any) => {
        return {
          name: poseidon.name,
          address: poseidon.address,
        };
      }
    );
    console.log("Reusing Poseidon Contracts at : ", poseidonAddrs);

    DeployedContracts.PosseidonAddresses = poseidonAddrs;
  }

  if (!MACIDeployments?.Groth16Verifier?.Groth16VerifierAddress) {
    const Groth16VerifierFactory = await ethers
      .getContractFactory("Groth16Verifier")
      .then((factory) => factory.deploy());

    const Groth16VerifierAddress = await Groth16VerifierFactory.getAddress();

    console.log("Groth16Verifier deployed at:", Groth16VerifierAddress);

    DeployedContracts.Groth16Verifier = {
      name: "Groth16Verifier",
      Groth16VerifierAddress: Groth16VerifierAddress,
    };

    deployments.write(DeployedContracts);
    // await verifyContract(Groth16VerifierAddress, []);
  } else {
    console.log(
      "Reusing Groth16Verifier:",
      MACIDeployments.Groth16Verifier.Groth16VerifierAddress
    );
    DeployedContracts.Groth16Verifier = MACIDeployments.Groth16Verifier;
  }

  if (!MACIDeployments?.ZuPassRegistry?.ZuPassRegistryAddress) {
    const ZuPassRegistryFactory = await ethers
      .getContractFactory("ZuPassRegistry")
      .then((factory) =>
        factory.deploy(MACIDeployments?.Groth16Verifier?.Groth16VerifierAddress)
      );

    const ZuPassRegistryAddress = await ZuPassRegistryFactory.getAddress();

    console.log("ZuPassRegistry deployed at:", ZuPassRegistryAddress);

    DeployedContracts.ZuPassRegistry = {
      name: "ZuPassRegistry",
      ZuPassRegistryAddress: ZuPassRegistryAddress,
    };

    deployments.write(DeployedContracts);

    // await verifyContract(ZuPassRegistryAddress, [Groth16VerifierAddress]);

    const ZuPassFactory = await ethers.getContractAt(
      "ZuPassRegistry",
      ZuPassRegistryAddress
    );

    type ZUPASS_SIGNERStruct = {
      G1: BigNumberish;
      G2: BigNumberish;
    };

    const eventIDs = ZuzaluEvents.map((event) =>
      uuidToBigInt(event.eventId)
    ) as BigNumberish[];

    const eventsSigners = ZuzaluEvents.map((event) => ({
      G1: hexToBigInt(event.publicKey[0]),
      G2: hexToBigInt(event.publicKey[1]),
    })) as ZUPASS_SIGNERStruct[];

    const setEvents = await ZuPassFactory.setEvents(eventIDs, eventsSigners, {
      gasLimit: 1000000,
    });

    await setEvents.wait();

    console.log("ZuPass Signer&events set");
  } else {
    console.log(
      "Reusing ZuPassRegistry:",
      MACIDeployments.ZuPassRegistry.ZuPassRegistryAddress
    );
    DeployedContracts.ZuPassRegistry = MACIDeployments.ZuPassRegistry;
  }

  const libraries = {
    PoseidonT3: DeployedContracts.PosseidonAddresses[0].address,
    PoseidonT4: DeployedContracts.PosseidonAddresses[1].address,
    PoseidonT5: DeployedContracts.PosseidonAddresses[2].address,
    PoseidonT6: DeployedContracts.PosseidonAddresses[3].address,
  };

  if (!MACIDeployments?.PollFactory?.pollAddress) {
    const pollFactoryContract = await ethers
      .getContractFactory("ClonablePoll", {
        libraries: libraries,
      })
      .then((factory) => factory.deploy());

    const pollAddress = await pollFactoryContract.getAddress();

    console.log("PollFactory deployed at:", pollAddress);

    DeployedContracts.PollFactory = {
      name: "PollFactory",
      pollAddress: pollAddress,
    };
    deployments.write(DeployedContracts);

    // await verifyContract(pollAddress, []);
  } else {
    console.log(
      "Reusing PollFactory:",
      MACIDeployments.PollFactory.pollAddress
    );
    DeployedContracts.PollFactory = MACIDeployments.PollFactory;
  }

  if (!MACIDeployments?.MessageProcessorFactory?.mpAddr) {
    const messageProcessorFactoryContract = await ethers
      .getContractFactory("ClonableMessageProcessor", {
        libraries: libraries,
      })
      .then((factory) => factory.deploy());

    const mpAddr = await messageProcessorFactoryContract.getAddress();

    console.log("MessageProcessorFactory deployed at:", mpAddr);

    DeployedContracts.MessageProcessorFactory = {
      name: "MessageProcessorFactory",
      mpAddr: mpAddr,
    };
    deployments.write(DeployedContracts);

    // await verifyContract(mpAddr, []);
  } else {
    console.log(
      "Reusing MessageProcessorFactory:",
      MACIDeployments.MessageProcessorFactory.mpAddr
    );
    DeployedContracts.MessageProcessorFactory =
      MACIDeployments.MessageProcessorFactory;
  }

  if (!MACIDeployments?.TallyFactory?.tallyAddr) {
    const tallyFactoryContract = await ethers
      .getContractFactory("ClonableTally", {
        libraries: libraries,
      })
      .then((factory) => factory.deploy());

    const tallyAddr = await tallyFactoryContract.getAddress();

    console.log("TallyFactory deployed at:", tallyAddr);

    DeployedContracts.TallyFactory = {
      name: "TallyFactory",
      tallyAddr: tallyAddr,
    };

    deployments.write(DeployedContracts);

    // await verifyContract(tallyAddr, []);
  } else {
    console.log(
      "Reusing TallyFactory:",
      MACIDeployments.TallyFactory.tallyAddr
    );
    DeployedContracts.TallyFactory = MACIDeployments.TallyFactory;
  }

  // --------------------------------------------------  Clonable MACI  --------------------------------------------------

  if (!MACIDeployments?.ClonableMACI?.ClonableMACIAddress) {
    const ClonableMACI = await ethers
      .getContractFactory("ClonableMACI", {
        libraries: libraries,
      })
      .then((factory) => factory.deploy());

    const ClonableMACIAddress = await ClonableMACI.getAddress();

    console.log("ClonableMACI deployed at:", ClonableMACIAddress);

    DeployedContracts.ClonableMACI = {
      name: "ClonableMACI",
      ClonableMACIAddress: ClonableMACIAddress,
    };
    deployments.write(DeployedContracts);

    // await verifyContract(ClonableMACIAddress, []);
  } else {
    console.log(
      "Reusing ClonableMACI:",
      MACIDeployments.ClonableMACI.ClonableMACIAddress
    );
    DeployedContracts.ClonableMACI = MACIDeployments.ClonableMACI;
  }

  // --------------------------------------------------  Clonable MACI Factory  --------------------------------------------------

  if (!MACIDeployments?.ClonableMACIFactory?.ClonableMACIFactoryAddress) {
    const ClonableMACIFactory = await ethers
      .getContractFactory("ClonableMACIFactory")
      .then((factory) =>
        upgrades.deployProxy(factory, [
          DeployedContracts.ClonableMACI.ClonableMACIAddress,
          DeployedContracts.PollFactory.pollAddress,
          DeployedContracts.TallyFactory.tallyAddr,
          DeployedContracts.MessageProcessorFactory.mpAddr,
        ])
      );

    const ClonableMACIFactoryAddress = await ClonableMACIFactory.getAddress();

    console.log("ClonableMACIFactory deployed at:", ClonableMACIFactoryAddress);

    DeployedContracts.ClonableMACIFactory = {
      name: "ClonableMACIFactory",
      ClonableMACIFactoryAddress: ClonableMACIFactoryAddress,
    };
    deployments.write(DeployedContracts);

    // await verifyContract(ClonableMACIFactoryAddress, [
    //   DeployedContracts.ClonableMACI.ClonableMACIAddress,
    //   DeployedContracts.PollFactory.pollAddress,
    //   DeployedContracts.TallyFactory.tallyAddr,
    //   DeployedContracts.MessageProcessorFactory.mpAddr,
    // ]);

    const setMaciParameters = await ClonableMACIFactory.setMaciSettings(
      0,
      [
        deployParams.treeDepths,
        deployParams.stateTreeDepth,
        DeployedContracts.Verifier.verifierContractAddress,
        DeployedContracts.VkRegistry.vkRegistryContractAddress,
        [
          4904028317433377177773123885584230878115556059208431880161186712332781831975n,
          344732312350052944041104345325295111408747975338908491763817872057138864163n,
          19445814455012978799483892811950396383084183210860279923207176682490489907069n,
          10621810780690303482827422143389858049829670222244900617652404672125492013328n,
          17077690379337026179438044602068085690662043464643511544329656140997390498741n,
        ],
      ],
      {
        gasLimit: 1000000,
      }
    );

    await setMaciParameters.wait();

    console.log("MACI settings set");
  } else {
    console.log(
      "Reusing ClonableMACIFactory:",
      MACIDeployments.ClonableMACIFactory.ClonableMACIFactoryAddress
    );

    DeployedContracts.ClonableMACIFactory = MACIDeployments.ClonableMACIFactory;
  }

  // --------------------------------------------------  MACIQFStrategy  --------------------------------------------------

  if (!MACIDeployments?.MACIQFStrategy?.MACIQFStrategyAddress) {
    const MACIQFStrategyFactory = await ethers.getContractFactory("MACIQF");

    const alloDeployments = new Deployments(chainId, "allo");

    let Allo;
    try {
      Allo = alloDeployments.getAllo();
    } catch (e) {
      Allo = "";
    }

    if (Allo == "") {
      if (!MACIDeployments?.Allo?.AlloAddress) {
        const RegistryFactory = await ethers.getContractFactory("Registry");
        // address _owner
        const Registry = await upgrades.deployProxy(RegistryFactory, [
          deployer.address,
        ]);
        const registryAddress = await Registry.getAddress();

        const AlloFactory = await ethers.getContractFactory("Allo");

        const _Allo = await upgrades.deployProxy(AlloFactory, [
          deployer.address,
          registryAddress,
          deployer.address,
          0,
          0,
        ]);

        Allo = await _Allo.getAddress();

        console.log("Allo Proxy deployed to:", Allo);

        DeployedContracts.Allo = {
          name: "Allo",
          AlloAddress: Allo,
        };

        DeployedContracts.Registry = {
          name: "Registry",
          RegistryAddress: registryAddress,
        };
      }
    }

    console.log("Deploying MACIQFStrategy...");
    console.log("Allo address:", Allo);

    const MACIQFStrategy = await MACIQFStrategyFactory.deploy(
      Allo,
      "MACIQFStrategyv1.0"
    );

    const MACIQFStrategyAddress = await MACIQFStrategy.getAddress();

    console.log("MACIQFStrategy deployed at:", MACIQFStrategyAddress);

    DeployedContracts.MACIQFStrategy = {
      name: "MACIQFStrategyv1.0",
      MACIQFStrategyAddress: MACIQFStrategyAddress,
    };
    deployments.write(DeployedContracts);

    // await verifyContract(MACIQFStrategyAddress, [Allo, "MACIQF"]);
  } else {
    console.log(
      "Reusing MACIQFStrategy:",
      MACIDeployments.MACIQFStrategy.MACIQFStrategyAddress
    );

    DeployedContracts.MACIQFStrategy = MACIDeployments.MACIQFStrategy;
  }

  deployments.write(DeployedContracts);

  console.log("MACI contracts deployed successfully");
});
