import 'hardhat-typechain'
import '@nomiclabs/hardhat-ethers'
import '@nomicfoundation/hardhat-chai-matchers'
import dotenv from 'dotenv'
dotenv.config()
const HASH_ZERO = '0x0000000000000000000000000000000000000000000000000000000000000000'

const DEFAULT_COMPILER_SETTINGS = {
  version: '0.8.17',
  settings: {
    viaIR: true,
    evmVersion: 'istanbul',
    optimizer: {
      enabled: true,
      runs: 1_000_000,
    },
    metadata: {
      bytecodeHash: 'none',
    },
  },
}

export default {
  paths: {
    sources: './contracts',
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: false,
      chainId: 1,
      forking: {
        url: `https://network-archive.ambrosus.io`,
        blockNumber: 15360000,
      },
    },
    devnet: {
      url: 'https://network-archive.ambrosus-dev.io',
      hardfork: 'istanbul',
      accounts: [process.env.DEPLOYER_KEY || HASH_ZERO],
    },
    testnet: {
      url: 'https://network-archive.ambrosus-test.io',
      hardfork: 'istanbul',
      accounts: [process.env.DEPLOYER_KEY || HASH_ZERO],
    },
    mainnet: {
      url: 'https://network-archive.ambrosus.io',
      hardfork: 'istanbul',
      accounts: [process.env.DEPLOYER_KEY || HASH_ZERO],
    },
  },
  namedAccounts: {
    deployer: 0,
  },
  solidity: {
    compilers: [DEFAULT_COMPILER_SETTINGS],
  },
  mocha: {
    timeout: 60000,
  },
}
