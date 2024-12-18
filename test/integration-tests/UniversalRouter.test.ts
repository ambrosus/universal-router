import {
  UniversalRouter,
  Permit2,
  ERC20,
  ISAMB,
  MockLooksRareRewardsDistributor,
  ERC721,
  MintableERC20__factory,
  ISAMB__factory,
} from '../../typechain'
import { BigNumber, BigNumberish } from 'ethers'
import { Pair } from '@airdao/astra-classic-sdk'
import { expect } from './shared/expect'
import { abi as ROUTER_ABI } from '../../artifacts/contracts/UniversalRouter.sol/UniversalRouter.json'
import { abi as TOKEN_ABI } from '../../artifacts/solmate/src/tokens/ERC20.sol/ERC20.json'
import { abi as SAMB_ABI } from '../../artifacts/contracts/interfaces/external/ISAMB.sol/ISAMB.json'

import deployUniversalRouter, { deployPermit2 } from './shared/deployUniversalRouter'
import {
  ADDRESS_THIS,
  ALICE_ADDRESS,
  DEADLINE,
  ROUTER_REWARDS_DISTRIBUTOR,
  SOURCE_MSG_SENDER,
  MAX_UINT160,
  MAX_UINT,
  AMB_ADDRESS,
} from './shared/constants'

import { resetFork, SAMB, BOND } from './shared/testnetForkHelpers'
import { CommandType, RoutePlanner } from './shared/planner'
import { makePair } from './shared/swapRouter02Helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expandTo18DecimalsBN } from './shared/helpers'
import hre from 'hardhat'
import { findCustomErrorSelector } from './shared/parseEvents'
import { Token } from '@airdao/astra-sdk-core'

const { ethers } = hre
const routerInterface = new ethers.utils.Interface(ROUTER_ABI)

describe('UniversalRouter', () => {
  let alice: SignerWithAddress
  let router: UniversalRouter
  let permit2: Permit2
  let bondContract: ERC20
  let sambContract: ISAMB
  let mockLooksRareToken: ERC20
  let mockLooksRareRewardsDistributor: MockLooksRareRewardsDistributor
  let pair_BOND_SAMB: Pair

  beforeEach(async () => {
    await resetFork()
    alice = await ethers.getSigner(ALICE_ADDRESS)
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    await hre.network.provider.request({
      method: 'hardhat_setBalance',
      params: [ALICE_ADDRESS, BigNumber.from(1_000_000).mul(BigNumber.from(10).pow(18))._hex],
    })

    // mock rewards contracts
    const tokenFactory = await ethers.getContractFactory('MintableERC20')
    const mockDistributorFactory = await ethers.getContractFactory('MockLooksRareRewardsDistributor')
    mockLooksRareToken = (await tokenFactory.connect(alice).deploy("LooksRare", "LR", expandTo18DecimalsBN(5))) as ERC20
    mockLooksRareRewardsDistributor = (await mockDistributorFactory.deploy(
      ROUTER_REWARDS_DISTRIBUTOR,
      mockLooksRareToken.address
    )) as MockLooksRareRewardsDistributor
    await (await ISAMB__factory.connect(SAMB.address, alice).deposit({ value: expandTo18DecimalsBN(1000) })).wait()

    bondContract = new ethers.Contract(BOND.address, TOKEN_ABI, alice) as ERC20
    sambContract = new ethers.Contract(SAMB.address, SAMB_ABI, alice) as ISAMB
    pair_BOND_SAMB = await makePair(alice, BOND, SAMB)
    permit2 = (await deployPermit2()).connect(alice) as Permit2
    router = (
      await deployUniversalRouter(permit2, mockLooksRareRewardsDistributor.address, mockLooksRareToken.address)
    ).connect(alice) as UniversalRouter
  })

  describe('#execute', () => {
    let planner: RoutePlanner
    const invalidCommand: string = '0x3f'

    beforeEach(async () => {
      planner = new RoutePlanner()
      await bondContract.approve(permit2.address, MAX_UINT)
      await sambContract.approve(permit2.address, MAX_UINT)
      await permit2.approve(BOND.address, router.address, MAX_UINT160, DEADLINE)
      await permit2.approve(SAMB.address, router.address, MAX_UINT160, DEADLINE)
    })

    it('reverts if block.timestamp exceeds the deadline', async () => {
      planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [
        alice.address,
        1,
        1,
        [BOND.address, SAMB.address],
        SOURCE_MSG_SENDER,
      ])
      const invalidDeadline = 10

      const { commands, inputs } = planner

      await expect(
        router['execute(bytes,bytes[],uint256)'](commands, inputs, invalidDeadline)
      ).to.be.revertedWithCustomError(router, 'TransactionDeadlinePassed')
    })

    it('reverts for an invalid command at index 0', async () => {
      const inputs: string[] = ['0x12341234']

      await expect(router['execute(bytes,bytes[],uint256)'](invalidCommand, inputs, DEADLINE))
        .to.be.revertedWithCustomError(router, 'InvalidCommandType')
        .withArgs(parseInt(invalidCommand))
    })

    it('reverts for an invalid command at index 1', async () => {
      planner.addCommand(CommandType.PERMIT2_TRANSFER_FROM, [
        BOND.address,
        pair_BOND_SAMB.liquidityToken.address,
        expandTo18DecimalsBN(1),
      ])
      let commands = planner.commands
      let inputs = planner.inputs

      commands = commands.concat(invalidCommand.slice(2))
      inputs.push('0x21341234')

      await expect(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        .to.be.revertedWithCustomError(router, 'InvalidCommandType')
        .withArgs(parseInt(invalidCommand))
    })

    it('reverts if paying a portion over 100% of contract balance', async () => {
      await bondContract.transfer(router.address, expandTo18DecimalsBN(1))
      planner.addCommand(CommandType.PAY_PORTION, [SAMB.address, alice.address, 11_000])
      planner.addCommand(CommandType.SWEEP, [SAMB.address, alice.address, 1])
      const { commands, inputs } = planner
      await expect(router['execute(bytes,bytes[])'](commands, inputs)).to.be.revertedWithCustomError(
        router,
        'InvalidBips'
      )
    })

    it('reverts if a malicious contract tries to reenter', async () => {
      const reentrantProtocol = await (await ethers.getContractFactory('ReenteringProtocol')).deploy()

      router = (
        await deployUniversalRouter(
          permit2,
          mockLooksRareRewardsDistributor.address,
          mockLooksRareToken.address,
          reentrantProtocol.address
        )
      ).connect(alice) as UniversalRouter

      planner.addCommand(CommandType.SWEEP, [AMB_ADDRESS, alice.address, 0])
      let { commands, inputs } = planner

      const sweepCalldata = routerInterface.encodeFunctionData('execute(bytes,bytes[])', [commands, inputs])
      const reentrantCalldata = reentrantProtocol.interface.encodeFunctionData('callAndReenter', [
        router.address,
        sweepCalldata,
      ])

      planner = new RoutePlanner()
      planner.addCommand(CommandType.NFTX, [0, reentrantCalldata])
      ;({ commands, inputs } = planner)

      const customErrorSelector = findCustomErrorSelector(reentrantProtocol.interface, 'NotAllowedReenter')
      await expect(router['execute(bytes,bytes[])'](commands, inputs))
        .to.be.revertedWithCustomError(router, 'ExecutionFailed')
        .withArgs(0, customErrorSelector)
    })
  })

  describe('#collectRewards', () => {
    let amountRewards: BigNumberish
    beforeEach(async () => {
      amountRewards = expandTo18DecimalsBN(0.5)
      mockLooksRareToken.connect(alice).transfer(mockLooksRareRewardsDistributor.address, amountRewards)
    })

    it('transfers owed rewards into the distributor contract', async () => {
      const balanceBefore = await mockLooksRareToken.balanceOf(ROUTER_REWARDS_DISTRIBUTOR)
      await router.collectRewards('0x00')
      const balanceAfter = await mockLooksRareToken.balanceOf(ROUTER_REWARDS_DISTRIBUTOR)
      expect(balanceAfter.sub(balanceBefore)).to.eq(amountRewards)
    })
  })
})

describe('UniversalRouter newer block', () => {
  let alice: SignerWithAddress
  let router: UniversalRouter
  let permit2: Permit2
  let mockLooksRareToken: ERC20
  let mockLooksRareRewardsDistributor: MockLooksRareRewardsDistributor

  beforeEach(async () => {
    // Since new NFTX contract was recently released, we have to fork from a much newer block
    await resetFork(2765037) // 2765038 - 1
    alice = await ethers.getSigner(ALICE_ADDRESS)
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    await hre.network.provider.request({
      method: 'hardhat_setBalance',
      params: [ALICE_ADDRESS, BigNumber.from(1_000_000).mul(BigNumber.from(10).pow(18))._hex],
    })

    // mock rewards contracts
    const tokenFactory = await ethers.getContractFactory('MintableERC20')
    const mockDistributorFactory = await ethers.getContractFactory('MockLooksRareRewardsDistributor')
    mockLooksRareToken = (await tokenFactory.connect(alice).deploy(expandTo18DecimalsBN(5))) as ERC20
    mockLooksRareRewardsDistributor = (await mockDistributorFactory.deploy(
      ROUTER_REWARDS_DISTRIBUTOR,
      mockLooksRareToken.address
    )) as MockLooksRareRewardsDistributor
    permit2 = (await deployPermit2()).connect(alice) as Permit2
    router = (
      await deployUniversalRouter(permit2, mockLooksRareRewardsDistributor.address, mockLooksRareToken.address)
    ).connect(alice) as UniversalRouter
  })
})
