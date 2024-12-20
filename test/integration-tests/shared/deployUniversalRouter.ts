import hre from 'hardhat'
const { ethers } = hre
import { UniversalRouter, Permit2 } from '../../../typechain'
import {
  CLASSIC_FACTORY_TESTNET,
  CL_FACTORY_TESTNET,
  CLASSIC_INIT_CODE_HASH_TESTNET,
  CL_INIT_CODE_HASH_TESTNET,
  ROUTER_REWARDS_DISTRIBUTOR,
  UNSUPPORTED_PROTOCOL,
} from './constants'

export async function deployRouter(
  permit2: Permit2,
  mockLooksRareRewardsDistributor?: string,
  mockLooksRareToken?: string,
  mockReentrantProtocol?: string
): Promise<UniversalRouter> {
  const routerParameters = {
    permit2: permit2.address,
    samb: '0x2Cf845b49e1c4E5D657fbBF36E97B7B5B7B7b74b',
    seaportV1_5: UNSUPPORTED_PROTOCOL, // need to update to v1.5 for tests once data is available
    seaportV1_4: UNSUPPORTED_PROTOCOL,
    openseaConduit: UNSUPPORTED_PROTOCOL,
    nftxZap: mockReentrantProtocol ?? UNSUPPORTED_PROTOCOL,
    x2y2: UNSUPPORTED_PROTOCOL,
    foundation: UNSUPPORTED_PROTOCOL,
    sudoswap: UNSUPPORTED_PROTOCOL,
    elementMarket: UNSUPPORTED_PROTOCOL,
    nft20Zap: UNSUPPORTED_PROTOCOL,
    cryptopunks: UNSUPPORTED_PROTOCOL,
    looksRareV2: UNSUPPORTED_PROTOCOL,
    routerRewardsDistributor: ROUTER_REWARDS_DISTRIBUTOR,
    looksRareRewardsDistributor: mockLooksRareRewardsDistributor ?? UNSUPPORTED_PROTOCOL,
    looksRareToken: mockLooksRareToken ?? UNSUPPORTED_PROTOCOL,
    classicFactory: CLASSIC_FACTORY_TESTNET,
    clFactory: CL_FACTORY_TESTNET,
    pairInitCodeHash: CLASSIC_INIT_CODE_HASH_TESTNET,
    poolInitCodeHash: CL_INIT_CODE_HASH_TESTNET,
  }

  const routerFactory = await ethers.getContractFactory('UniversalRouter')
  const router = (await routerFactory.deploy(routerParameters).then(async (instance) => {
    await instance.deployed()
    return instance
  })) as unknown as UniversalRouter
  return router
}

export default deployRouter

export async function deployPermit2(): Promise<Permit2> {
  const permit2Factory = await ethers.getContractFactory('Permit2')
  const permit2 = (await permit2Factory.deploy().then(async (instance) => {
    await instance.deployed()
    return instance
  })) as unknown as Permit2
  return permit2
}

export async function deployRouterAndPermit2(
  mockLooksRareRewardsDistributor?: string,
  mockLooksRareToken?: string
): Promise<[UniversalRouter, Permit2]> {
  const permit2 = await deployPermit2()
  const router = await deployRouter(permit2, mockLooksRareRewardsDistributor, mockLooksRareToken)
  return [router, permit2]
}
