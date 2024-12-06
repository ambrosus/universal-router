import hre from 'hardhat'
const { ethers } = hre
import { UniversalRouter, Permit2 } from '../../../typechain'
import {
  CLASSIC_FACTORY_TESTNET,
  CL_FACTORY_TESTNET,
  CLASSIC_INIT_CODE_HASH_TESTNET,
  CL_INIT_CODE_HASH_TESTNET,
  ROUTER_REWARDS_DISTRIBUTOR,
  LOOKSRARE_REWARDS_DISTRIBUTOR,
  LOOKSRARE_TOKEN,
} from './constants'

export async function deployRouter(
  permit2: Permit2,
  mockLooksRareRewardsDistributor?: string,
  mockLooksRareToken?: string,
  mockReentrantProtocol?: string
): Promise<UniversalRouter> {
  const routerParameters = {
    permit2: permit2.address,
    samb: '0x8D3e03889bFCb859B2dBEB65C60a52Ad9523512c',
    seaportV1_5: '0xc3d3a94A6A29FCBC1cf86B8264AAA933B96bb5A7', // need to update to v1.5 for tests once data is available
    seaportV1_4: '0xc3d3a94A6A29FCBC1cf86B8264AAA933B96bb5A7',
    openseaConduit: '0xc3d3a94A6A29FCBC1cf86B8264AAA933B96bb5A7',
    nftxZap: mockReentrantProtocol ?? '0xc3d3a94A6A29FCBC1cf86B8264AAA933B96bb5A7',
    x2y2: '0xc3d3a94A6A29FCBC1cf86B8264AAA933B96bb5A7',
    foundation: '0xc3d3a94A6A29FCBC1cf86B8264AAA933B96bb5A7',
    sudoswap: '0xc3d3a94A6A29FCBC1cf86B8264AAA933B96bb5A7',
    elementMarket: '0xc3d3a94A6A29FCBC1cf86B8264AAA933B96bb5A7',
    nft20Zap: '0xc3d3a94A6A29FCBC1cf86B8264AAA933B96bb5A7',
    cryptopunks: '0xc3d3a94A6A29FCBC1cf86B8264AAA933B96bb5A7',
    looksRareV2: '0xc3d3a94A6A29FCBC1cf86B8264AAA933B96bb5A7',
    routerRewardsDistributor: ROUTER_REWARDS_DISTRIBUTOR,
    looksRareRewardsDistributor: mockLooksRareRewardsDistributor ?? LOOKSRARE_REWARDS_DISTRIBUTOR,
    looksRareToken: mockLooksRareToken ?? LOOKSRARE_TOKEN,
    classicFactory: CLASSIC_FACTORY_TESTNET,
    clFactory: CL_FACTORY_TESTNET,
    pairInitCodeHash: CLASSIC_INIT_CODE_HASH_TESTNET,
    poolInitCodeHash: CL_INIT_CODE_HASH_TESTNET,
  }

  const routerFactory = await ethers.getContractFactory('UniversalRouter')
  const router = (await routerFactory.deploy(routerParameters)) as unknown as UniversalRouter
  return router
}

export default deployRouter

export async function deployPermit2(): Promise<Permit2> {
  const permit2Factory = await ethers.getContractFactory('Permit2')
  const permit2 = (await permit2Factory.deploy()) as unknown as Permit2
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
