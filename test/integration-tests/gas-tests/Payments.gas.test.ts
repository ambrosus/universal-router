import type { Contract } from '@ethersproject/contracts'
import {
  UniversalRouter,
  Permit2,
  ISAMB,
  ERC20,
  MintableERC20__factory,
  ISAMB__factory,
  ERC20__factory,
} from '../../../typechain'
import { resetFork, BOND, SAMB } from '../shared/testnetForkHelpers'
import { ALICE_ADDRESS, DEADLINE, AMB_ADDRESS, ONE_PERCENT_BIPS } from '../shared/constants'
import { expandTo18DecimalsBN } from '../shared/helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import deployUniversalRouter, { deployPermit2 } from '../shared/deployUniversalRouter'
import { RoutePlanner, CommandType } from '../shared/planner'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
const { ethers } = hre
import { BigNumber } from 'ethers'
import { ADDRESS_THIS } from '@airdao/astra-router-sdk'

describe('Payments Gas Tests', () => {
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let router: UniversalRouter
  let permit2: Permit2
  let bondContract: ERC20
  let sambContract: ISAMB
  let planner: RoutePlanner

  beforeEach(async () => {
    await resetFork()
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    await hre.network.provider.request({
      method: 'hardhat_setBalance',
      params: [ALICE_ADDRESS, '0x10000000000000000000000'],
    })
    alice = await ethers.getSigner(ALICE_ADDRESS)
    bob = (await ethers.getSigners())[1]
    await (
      await MintableERC20__factory.connect(BOND.address, alice).transfer(bob.address, expandTo18DecimalsBN(100000000))
    ).wait()
    await (await ISAMB__factory.connect(SAMB.address, alice).deposit({ value: expandTo18DecimalsBN(1000) })).wait()
    await (await ISAMB__factory.connect(SAMB.address, bob).deposit({ value: expandTo18DecimalsBN(1000) })).wait()

    bondContract = ERC20__factory.connect(BOND.address, bob)
    sambContract = ISAMB__factory.connect(SAMB.address, bob)

    permit2 = (await deployPermit2()).connect(alice) as Permit2
    router = (await deployUniversalRouter(permit2)).connect(alice) as UniversalRouter
    planner = new RoutePlanner()
  })

  describe('Individual Command Tests', () => {
    // These tests are not representative of actual situations - but allow us to monitor the cost of the commands

    it('gas: TRANSFER with ERC20', async () => {
      // seed router with tokens
      const amountOfBOND: BigNumber = expandTo18DecimalsBN(3)
      await bondContract.transfer(router.address, amountOfBOND)

      planner.addCommand(CommandType.TRANSFER, [BOND.address, ALICE_ADDRESS, amountOfBOND])
      const { commands, inputs } = planner

      await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
    })

    it('gas: UNWRAP_SAMB', async () => {
      // seed router with SAMB
      const amount: BigNumber = expandTo18DecimalsBN(3)
      await sambContract.transfer(router.address, amount)

      planner.addCommand(CommandType.UNWRAP_SAMB, [alice.address, amount])
      const { commands, inputs } = planner

      await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
    })

    it('gas: TRANSFER with AMB', async () => {
      // seed router with SAMB and unwrap it into the router
      const amount: BigNumber = expandTo18DecimalsBN(3)
      await sambContract.transfer(router.address, amount)
      planner.addCommand(CommandType.UNWRAP_SAMB, [ADDRESS_THIS, amount])
      let { commands, inputs } = planner
      await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)

      // now do a transfer of those AMB as the command
      planner = new RoutePlanner()
      planner.addCommand(CommandType.TRANSFER, [AMB_ADDRESS, ALICE_ADDRESS, amount])
      ;({ commands, inputs } = planner)

      await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
    })

    it('gas: SWEEP with ERC20', async () => {
      // seed router with tokens
      const amountOfBOND: BigNumber = expandTo18DecimalsBN(3)
      await bondContract.transfer(router.address, amountOfBOND)

      planner.addCommand(CommandType.SWEEP, [BOND.address, ALICE_ADDRESS, amountOfBOND])
      const { commands, inputs } = planner

      await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
    })

    it('gas: WRAP_AMB', async () => {
      // seed router with SAMB and unwrap it into the router
      const amount: BigNumber = expandTo18DecimalsBN(3)
      await sambContract.transfer(router.address, amount)
      planner.addCommand(CommandType.UNWRAP_SAMB, [ADDRESS_THIS, amount])
      let { commands, inputs } = planner
      await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)

      // now wrap those AMB as the command
      planner = new RoutePlanner()
      planner.addCommand(CommandType.WRAP_AMB, [ALICE_ADDRESS, amount])
      ;({ commands, inputs } = planner)

      await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
    })

    it('gas: UNWRAP_SAMB_WITH_FEE', async () => {
      // seed router with SAMB
      const amount: BigNumber = expandTo18DecimalsBN(3)
      await sambContract.transfer(router.address, amount)

      planner.addCommand(CommandType.UNWRAP_SAMB, [alice.address, amount])
      planner.addCommand(CommandType.PAY_PORTION, [AMB_ADDRESS, bob.address, 50])
      planner.addCommand(CommandType.SWEEP, [AMB_ADDRESS, alice.address, 0])
      const { commands, inputs } = planner

      await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
    })

    it('gas: SWEEP_WITH_FEE', async () => {
      // seed router with tokens
      const amountOfBOND: BigNumber = expandTo18DecimalsBN(3)
      await bondContract.transfer(router.address, amountOfBOND)

      planner.addCommand(CommandType.PAY_PORTION, [BOND.address, bob.address, ONE_PERCENT_BIPS])
      planner.addCommand(CommandType.SWEEP, [BOND.address, alice.address, 1])
      const { commands, inputs } = planner

      await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
    })

    it('gas: APPROVE_ERC20', async () => {
      const SEAPORT_V2_ID: number = 1
      planner.addCommand(CommandType.APPROVE_ERC20, [BOND.address, SEAPORT_V2_ID])

      const { commands, inputs } = planner
      await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
    })
  })
})
