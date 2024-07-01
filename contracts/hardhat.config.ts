import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import dotenv from "dotenv";
dotenv.config();

import { task, subtask } from "hardhat/config";

import path from "path";
import fs from "fs";

/**
 * Allow to copy a directory from source to target
 * @param source - the source directory
 * @param target - the target directory
 */
function copyDirectory(source: string, target: string): void {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }

  if (!fs.existsSync(source)) {
    return;
  }

  const files = fs.readdirSync(source);

  files.forEach((file: string) => {
    const sourcePath = path.join(source, file);
    const targetPath = path.join(target, file);

    if (fs.lstatSync(sourcePath).isDirectory()) {
      copyDirectory(sourcePath, targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  });
}

// Define a subtask to copy artifacts
subtask("copy-maci-artifacts", async (_, { config }) => {
  const sourceDir = path.resolve(
    __dirname,
    "node_modules/maci-contracts/build/artifacts/contracts/",
  );
  const destDir = path.resolve(
    config.paths.artifacts,
    "maci-contracts",
    "contracts",
  );

  copyDirectory(sourceDir, destDir);
});

subtask("copy-maci-build-info", async (_, { config }) => {
  const sourceDir2 = path.resolve(
    __dirname,
    "node_modules/maci-contracts/build/artifacts/@openzeppelin/",
  );
  const destDir2 = path.resolve(
    config.paths.artifacts,
    "maci-contracts",
    "@openzeppelin",
  );

  copyDirectory(sourceDir2, destDir2);

  const sourceDir3 = path.resolve(
    __dirname,
    "node_modules/maci-contracts/build/artifacts/build-info/",
  );
  const destDir3 = path.resolve(
    config.paths.artifacts,
    "maci-contracts",
    "build-info",
  );

  copyDirectory(sourceDir3, destDir3);
});

// Override the existing compile task
task("compile", async (args, hre, runSuper) => {
  // Before compilation move over artifacts
  await hre.run("copy-maci-artifacts");

  // Run the original compile task
  await runSuper(args);

  // After compilation, run the subtask to copy MACI artifacts
  await hre.run("copy-maci-artifacts");

  // After compilation, run the subtask to copy MACI build info
  // await hre.run("copy-maci-build-info");
});

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  gasReporter: {
    currency: "USD",
    enabled: true,
  },
  paths: {
    tests: "./test",
    artifacts: "./artifacts",
  },
  sourcify: {
    enabled: true,
  },
  defaultNetwork: "scrollsepolia",
  networks: {
    scrollsepolia: {
      chainId: 534351,
      url: `https://scroll-sepolia.drpc.org	`,
      accounts: [process.env.SEPOLIA_KEY!],
    },
    sepolia: {
      chainId: 11155111,
      url: `https://eth-sepolia.g.alchemy.com/v2/w07A2I5WCXg65VfLx_lHcVBkh2LN7E7z`,
      accounts: [process.env.SEPOLIA_KEY!],
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      accounts: [process.env.PRIVATE_KEY!],
    },
  },
  etherscan: {
    apiKey: "KNVT7KRT9B15Z5UTXZT8TG8HNMIJXWXRMY",
    // {
    //   scrollsepolia: "QXKSFDZATD75NKPN6VJ7K9EK1FR3ZYB7WN",
    //   sepolia: "KNVT7KRT9B15Z5UTXZT8TG8HNMIJXWXRMY",
    // },
    customChains: [
      {
        network: "scrollsepolia",
        chainId: 534351,
        urls: {
          apiURL: "https://api-sepolia.scrollscan.com/api",
          browserURL: "https://sepolia.scrollscan.com",
        },
      },
    ],
    enabled: true,
  },
};

export default config;
