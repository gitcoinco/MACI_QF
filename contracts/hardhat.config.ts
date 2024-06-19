import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import dotenv from "dotenv";
dotenv.config();

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
    apiKey: {
      scrollsepolia: process.env.SCROLL_API_KEY!,
      sepolia: process.env.ETHERSCAN_API_KEY!,
    },
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
