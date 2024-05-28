# Allo x MACI QF

A QF implementation written using MACI v1.2.0.
integrated into Allo protocol QF mechanism

> WIP - this is just a rough draft for testing purposes.

## Credits

### This takes inspiration from :

- clr.fund code (https://github.com/clrfund/monorepo)
- [ctrlc03](https://github.com/ctrlc03) minimalQF code https://github.com/ctrlc03/minimalQF

## How to run it

- Download ZKeys

  - `chmod +x download_artifacts.sh`
  - `./download_artifacts.sh`

- `yarn install`
- `npx hardhat node`
  - `copy 4 private-keys and paste them into .env.example`
  - `rename .env.example to .env`
- `open a new terminal`
- `yarn test:live`
