import { CommandType, RoutePlanner } from './shared/planner'
import { expect } from './shared/expect'
import { ERC20, ERC20__factory, Permit2, UniversalRouter } from '../../typechain'
import { resetFork, BOND } from './shared/testnetForkHelpers'
import { ALICE_ADDRESS, DEADLINE } from './shared/constants'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import deployUniversalRouter, { deployPermit2 } from './shared/deployUniversalRouter'
import { findCustomErrorSelector } from './shared/parseEvents'
import { BigNumber } from 'ethers'
const { ethers } = hre

describe('Check Ownership', () => {
  let alice: SignerWithAddress
  let router: UniversalRouter
  let permit2: Permit2
  let planner: RoutePlanner

  beforeEach(async () => {
    await resetFork()
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    alice = await ethers.getSigner(ALICE_ADDRESS)
    await hre.network.provider.request({
      method: 'hardhat_setBalance',
      params: [ALICE_ADDRESS, '0x10000000000000000000000'],
    })
    permit2 = (await deployPermit2()).connect(alice) as Permit2
    router = (await deployUniversalRouter(permit2)).connect(alice) as UniversalRouter
    planner = new RoutePlanner()
  })

  describe('checks balance ERC20', () => {
    let aliceTokenBalance: BigNumber
    let tokenContract: ERC20
    const tokenAddress: string = BOND.address

    beforeEach(async () => {
      tokenContract = ERC20__factory.connect(tokenAddress, alice)
      aliceTokenBalance = await tokenContract.balanceOf(ALICE_ADDRESS)
    })

    it('passes with sufficient balance', async () => {
      planner.addCommand(CommandType.BALANCE_CHECK_ERC20, [ALICE_ADDRESS, tokenAddress, aliceTokenBalance])

      const { commands, inputs } = planner
      await expect(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)).to.not.be.reverted
    })

    it('reverts for insufficient balance', async () => {
      planner.addCommand(CommandType.BALANCE_CHECK_ERC20, [ALICE_ADDRESS, tokenAddress, aliceTokenBalance.add(1)])

      const { commands, inputs } = planner
      const customErrorSelector = findCustomErrorSelector(router.interface, 'BalanceTooLow')
      await expect(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        .to.be.revertedWithCustomError(router, 'ExecutionFailed')
        .withArgs(0, customErrorSelector)
    })
  })
})
