## Finalizing a Round with MACI QF

This guide walks you through the process of finalizing a round using the MACI QF (Minimal Anti-Collusion Infrastructure Quadratic Funding) framework. The steps include generating a MACI private key, preparing for tallying, finalizing the round, and distributing funds.

### Prerequisites

1. **Clone the Repository**

   ```sh
   git clone https://github.com/gitcoinco/MACI_QF.git
   cd MACI_QF/contracts
   ```

2. **Download ZKeys**

   ```sh
   chmod +x downloadArtifacts.sh
   ./downloadArtifacts.sh
   ```

3. **Install Dependencies**

   ```sh
   yarn install
   ```

4. **Create .env**

   ```sh
   cp .env.example .env
   ```

5. **Compile the Contracts**

   ```sh
   yarn compile
   ```

### Environment Variables

Before running the tasks, ensure you have the following environment variables set up in your `.env` file:

- `COORDINATOR_WALLET_PRIVATE_KEY`: Your Ethereum wallet private key.
- `COORDINATOR_MACI_SECRET_KEY`: Your MACI secret key.
- `DISTRIBUTE_BATCH_SIZE`: Batch size for distributing funds.
- `TALLY_BATCH_SIZE`: Batch size for tallying results.
- `IPFS_JWT Your Pinata JWT.
- `<NETWORK>_API_KEY`: Your <NETWORK>scan API key.
- `<NETWORK>_RPC_URL`: The RPC URL for your network (e.g., `SEPOLIA_RPC_URL` for Sepolia, `SCROLL_RPC_URL` for Scroll).

Make sure to refer to `package.json` for the supported networks.

### Generating a MACI Private Key

To create a MACI private key, you can run the following command. If you do not pass a password, a random key will be generated for you. This can be useful for generating a deterministic key in case you lose them.

```sh
yarn genPrivkey --password yourpassword
```

The generated keypair's private key should be used in the round creation on [MACI Manager](https://manager-maci.gitcoin.co/). Alternatively, you can create a Coordinator MACI-Keypair directly on the MACI Manager UI.

### Finalizing the Round

Once the round has ended, the coordinator should execute the following tasks in order:

1. **Prepare Tally**

   ```sh
   yarn prepareTally:<network> --startingblock <round creation block> --roundid <roundId> --blocks <how many blocks to request ? 10000>
   ```

2. **Finalize the Round**

   ```sh
   yarn finalize:<network> --roundid <roundId> 
   ```

3. **Distribute Funds**

   ```sh
   yarn distributeFunds:<network> --roundid <roundId> 
   ```

**Currently only optimism , scroll and sepolia are supported**

- Replace `<network>` with scroll or sepolia depending on where your round is created

By following these steps and using the provided commands, you can efficiently finalize a round and distribute the funds to the recipients. Ensure all the environment variables are correctly set up to avoid any issues during the process.
