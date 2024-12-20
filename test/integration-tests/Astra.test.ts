import { TransactionReceipt } from '@ethersproject/abstract-provider'
import { Pair } from '@airdao/astra-classic-sdk'
import { FeeAmount } from '@airdao/astra-cl-sdk'
import { parseEvents, CLASSIC_EVENTS, CL_EVENTS } from './shared/parseEvents'
import { expect } from './shared/expect'
import { encodePath } from './shared/swapRouter02Helpers'
import { BigNumber, BigNumberish, Contract } from 'ethers'
import { ERC20, ERC20__factory, ISAMB, ISAMB__factory, Permit2, UniversalRouter } from '../../typechain'
import { BOND, KOS, resetFork, SAMB, USDC } from './shared/testnetForkHelpers'
import {
  ADDRESS_THIS,
  ALICE_ADDRESS,
  CONTRACT_BALANCE,
  DEADLINE,
  AMB_ADDRESS,
  MAX_UINT,
  MAX_UINT160,
  MSG_SENDER,
  ONE_PERCENT_BIPS,
  SOURCE_MSG_SENDER,
  SOURCE_ROUTER,
  TOKEN_ABI,
} from './shared/constants'
import { expandTo18DecimalsBN, expandTo6DecimalsBN } from './shared/helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import deployUniversalRouter, { deployPermit2 } from './shared/deployUniversalRouter'
import { RoutePlanner, CommandType } from './shared/planner'
import hre from 'hardhat'
import { getPermitSignature, getPermitBatchSignature, PermitSingle } from './shared/protocolHelpers/permit2'
const { ethers } = hre

describe('Astra Classic and CL Tests:', () => {
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let router: UniversalRouter
  let permit2: Permit2
  let bondContract: Contract
  let sambContract: ISAMB
  let usdcContract: ERC20
  let planner: RoutePlanner

  before(async () => {
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
    bondContract = ERC20__factory.connect(BOND.address, bob)
    sambContract = ISAMB__factory.connect(SAMB.address, bob)
    usdcContract = ERC20__factory.connect(USDC.address, bob)
  })

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
    bob = (await ethers.getSigners())[1]
    await ISAMB__factory.connect(SAMB.address, alice)
      .deposit({ value: expandTo18DecimalsBN(1000) })
      .then(async (t) => await t.wait())
    permit2 = (await deployPermit2()).connect(bob) as Permit2
    router = (await deployUniversalRouter(permit2)).connect(bob) as UniversalRouter
    planner = new RoutePlanner()

    // alice gives bob some tokens
    await bondContract.connect(alice).transfer(bob.address, expandTo18DecimalsBN(100000))
    await sambContract.connect(alice).transfer(bob.address, expandTo18DecimalsBN(100))
    await usdcContract.connect(alice).transfer(bob.address, expandTo6DecimalsBN(100000))

    // Bob max-approves the permit2 contract to access his BOND and SAMB
    await bondContract.connect(bob).approve(permit2.address, MAX_UINT)
    await sambContract.connect(bob).approve(permit2.address, MAX_UINT)
    await usdcContract.connect(bob).approve(permit2.address, MAX_UINT)
  })

  describe('Trade on Astra with Permit2, giving approval every time', () => {
    describe('ERC20 --> ERC20', () => {
      let permit: PermitSingle

      it('Classic exactIn, permiting the exact amount', async () => {
        const amountInBOND = expandTo18DecimalsBN(100)
        const minAmountOutSAMB = expandTo18DecimalsBN(0.03)

        // second bob signs a permit to allow the router to access his BOND
        permit = {
          details: {
            token: BOND.address,
            amount: amountInBOND,
            expiration: 0, // expiration of 0 is block.timestamp
            nonce: 0, // this is his first trade
          },
          spender: router.address,
          sigDeadline: DEADLINE,
        }
        const sig = await getPermitSignature(permit, bob, permit2)
        // 1) permit the router to access funds, 2) withdraw the funds into the pair, 3) trade
        planner.addCommand(CommandType.PERMIT2_PERMIT, [permit, sig])
        planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [
          MSG_SENDER,
          amountInBOND,
          minAmountOutSAMB,
          [BOND.address, SAMB.address],
          SOURCE_MSG_SENDER,
        ])
        const { sambBalanceBefore, sambBalanceAfter, bondBalanceAfter, bondBalanceBefore } = await executeRouter(
          planner
        )
        expect(sambBalanceAfter.sub(sambBalanceBefore)).to.be.gte(minAmountOutSAMB)
        expect(bondBalanceBefore.sub(bondBalanceAfter)).to.be.eq(amountInBOND)
      })

      it('Classic exactOut, permiting the maxAmountIn', async () => {
        const maxAmountInBOND = expandTo18DecimalsBN(3000)
        const amountOutSAMB = expandTo18DecimalsBN(1)

        // second bob signs a permit to allow the router to access his BOND
        permit = {
          details: {
            token: BOND.address,
            amount: maxAmountInBOND,
            expiration: 0, // expiration of 0 is block.timestamp
            nonce: 0, // this is his first trade
          },
          spender: router.address,
          sigDeadline: DEADLINE,
        }
        const sig = await getPermitSignature(permit, bob, permit2)

        // 1) permit the router to access funds, 2) trade - the transfer happens within the trade for exactOut
        planner.addCommand(CommandType.PERMIT2_PERMIT, [permit, sig])
        planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_OUT, [
          MSG_SENDER,
          amountOutSAMB,
          maxAmountInBOND,
          [BOND.address, SAMB.address],
          SOURCE_MSG_SENDER,
        ])
        const { sambBalanceBefore, sambBalanceAfter, bondBalanceAfter, bondBalanceBefore } = await executeRouter(
          planner
        )
        expect(sambBalanceAfter.sub(sambBalanceBefore)).to.be.eq(amountOutSAMB)
        expect(bondBalanceBefore.sub(bondBalanceAfter)).to.be.lte(maxAmountInBOND)
      })

      it('Classic exactIn, swapping more than max_uint160 should revert', async () => {
        const max_uint = BigNumber.from(MAX_UINT160)
        const minAmountOutSAMB = expandTo18DecimalsBN(0.03)

        // second bob signs a permit to allow the router to access his BOND
        permit = {
          details: {
            token: BOND.address,
            amount: max_uint,
            expiration: 0, // expiration of 0 is block.timestamp
            nonce: 0, // this is his first trade
          },
          spender: router.address,
          sigDeadline: DEADLINE,
        }
        const sig = await getPermitSignature(permit, bob, permit2)

        // 1) permit the router to access funds, 2) withdraw the funds into the pair, 3) trade
        planner.addCommand(CommandType.PERMIT2_PERMIT, [permit, sig])
        planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [
          MSG_SENDER,
          BigNumber.from(MAX_UINT160).add(1),
          minAmountOutSAMB,
          [BOND.address, SAMB.address],
          SOURCE_MSG_SENDER,
        ])

        const testCustomErrors = await (await ethers.getContractFactory('TestCustomErrors')).deploy()
        await expect(executeRouter(planner)).to.be.revertedWithCustomError(testCustomErrors, 'UnsafeCast')
      })

      it('CL exactIn, permiting the exact amount', async () => {
        const amountInBOND = expandTo18DecimalsBN(100)
        const minAmountOutSAMB = expandTo18DecimalsBN(0.03)

        // first bob approves permit2 to access his BOND
        await bondContract.connect(bob).approve(permit2.address, MAX_UINT)

        // second bob signs a permit to allow the router to access his BOND
        permit = {
          details: {
            token: BOND.address,
            amount: amountInBOND,
            expiration: 0, // expiration of 0 is block.timestamp
            nonce: 0, // this is his first trade
          },
          spender: router.address,
          sigDeadline: DEADLINE,
        }
        const sig = await getPermitSignature(permit, bob, permit2)

        const path = encodePathExactInput([BOND.address, SAMB.address])

        // 1) permit the router to access funds, 2) trade, which takes the funds directly from permit2
        planner.addCommand(CommandType.PERMIT2_PERMIT, [permit, sig])
        planner.addCommand(CommandType.CL_SWAP_EXACT_IN, [
          MSG_SENDER,
          amountInBOND,
          minAmountOutSAMB,
          path,
          SOURCE_MSG_SENDER,
        ])
        const { sambBalanceBefore, sambBalanceAfter, bondBalanceAfter, bondBalanceBefore } = await executeRouter(
          planner
        )
        expect(sambBalanceAfter.sub(sambBalanceBefore)).to.be.gte(minAmountOutSAMB)
        expect(bondBalanceBefore.sub(bondBalanceAfter)).to.be.eq(amountInBOND)
      })

      it('CL exactOut, permiting the exact amount', async () => {
        const maxAmountInBOND = expandTo18DecimalsBN(3000)
        const amountOutSAMB = expandTo18DecimalsBN(1)

        // first bob approves permit2 to access his BOND
        await bondContract.connect(bob).approve(permit2.address, MAX_UINT)

        // second bob signs a permit to allow the router to access his BOND
        permit = {
          details: {
            token: BOND.address,
            amount: maxAmountInBOND,
            expiration: 0, // expiration of 0 is block.timestamp
            nonce: 0, // this is his first trade
          },
          spender: router.address,
          sigDeadline: DEADLINE,
        }
        const sig = await getPermitSignature(permit, bob, permit2)

        const path = encodePathExactOutput([BOND.address, SAMB.address])

        // 1) permit the router to access funds, 2) trade, which takes the funds directly from permit2
        planner.addCommand(CommandType.PERMIT2_PERMIT, [permit, sig])
        planner.addCommand(CommandType.CL_SWAP_EXACT_OUT, [
          MSG_SENDER,
          amountOutSAMB,
          maxAmountInBOND,
          path,
          SOURCE_MSG_SENDER,
        ])
        const { sambBalanceBefore, sambBalanceAfter, bondBalanceAfter, bondBalanceBefore } = await executeRouter(
          planner
        )
        expect(sambBalanceAfter.sub(sambBalanceBefore)).to.be.eq(amountOutSAMB)
        expect(bondBalanceBefore.sub(bondBalanceAfter)).to.be.lte(maxAmountInBOND)
      })
    })
  })

  describe('Trade on AstraClassic', () => {
    const amountIn: BigNumber = expandTo18DecimalsBN(5)
    beforeEach(async () => {
      // for these tests Bob gives the router max approval on permit2
      await permit2.approve(BOND.address, router.address, MAX_UINT160, DEADLINE)
      await permit2.approve(SAMB.address, router.address, MAX_UINT160, DEADLINE)
    })

    describe('ERC20 --> ERC20', () => {
      it('completes a Classic exactIn swap', async () => {
        const minAmountOut = expandTo18DecimalsBN(0.0001)
        planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [
          MSG_SENDER,
          amountIn,
          minAmountOut,
          [BOND.address, SAMB.address],
          SOURCE_MSG_SENDER,
        ])
        const { sambBalanceBefore, sambBalanceAfter } = await executeRouter(planner)
        expect(sambBalanceAfter.sub(sambBalanceBefore)).to.be.gt(minAmountOut)
      })

      it('completes a Classic exactOut swap', async () => {
        const amountOut = expandTo18DecimalsBN(1)
        planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_OUT, [
          MSG_SENDER,
          amountOut,
          expandTo18DecimalsBN(10000),
          [SAMB.address, BOND.address],
          SOURCE_MSG_SENDER,
        ])
        planner.addCommand(CommandType.SWEEP, [SAMB.address, MSG_SENDER, 0])
        const { bondBalanceBefore, bondBalanceAfter } = await executeRouter(planner)
        expect(bondBalanceAfter.sub(bondBalanceBefore)).to.be.gt(amountOut)
      })

      it('exactIn trade, where an output fee is taken', async () => {
        // back to the router so someone can take a fee
        planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [
          ADDRESS_THIS,
          amountIn,
          1,
          [BOND.address, SAMB.address],
          SOURCE_MSG_SENDER,
        ])
        planner.addCommand(CommandType.PAY_PORTION, [SAMB.address, alice.address, ONE_PERCENT_BIPS])
        planner.addCommand(CommandType.SWEEP, [SAMB.address, MSG_SENDER, 1])

        const { commands, inputs } = planner
        const sambBalanceBeforeAlice = await sambContract.balanceOf(alice.address)
        const sambBalanceBeforeBob = await sambContract.balanceOf(bob.address)

        await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)

        const sambBalanceAfterAlice = await sambContract.balanceOf(alice.address)
        const sambBalanceAfterBob = await sambContract.balanceOf(bob.address)

        const aliceFee = sambBalanceAfterAlice.sub(sambBalanceBeforeAlice)
        const bobEarnings = sambBalanceAfterBob.sub(sambBalanceBeforeBob)

        expect(bobEarnings).to.be.gt(0)
        expect(aliceFee).to.be.gt(0)

        // total fee is 1% of bob's output
        expect(aliceFee.add(bobEarnings).mul(ONE_PERCENT_BIPS).div(10_000)).to.eq(aliceFee)
      })

      it('completes a Classic exactIn swap with longer path', async () => {
        const minAmountOut = expandTo18DecimalsBN(0.0001)
        planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [
          MSG_SENDER,
          amountIn,
          minAmountOut,
          [BOND.address, USDC.address, SAMB.address],
          SOURCE_MSG_SENDER,
        ])

        const { sambBalanceBefore, sambBalanceAfter } = await executeRouter(planner)
        expect(sambBalanceAfter.sub(sambBalanceBefore)).to.be.gt(minAmountOut)
      })
    })

    describe('ERC20 --> AMB', () => {
      it('completes a Classic exactIn swap', async () => {
        planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [
          ADDRESS_THIS,
          amountIn,
          1,
          [BOND.address, SAMB.address],
          SOURCE_MSG_SENDER,
        ])
        planner.addCommand(CommandType.UNWRAP_SAMB, [MSG_SENDER, 0])

        const { gasSpent, ambBalanceBefore, ambBalanceAfter, classicSwapEventArgs } = await executeRouter(planner)
        const { amount0Out: sambTraded } = classicSwapEventArgs!

        expect(ambBalanceAfter.sub(ambBalanceBefore)).to.eq(sambTraded.sub(gasSpent))
      })

      it('completes a Classic exactOut swap', async () => {
        const amountOut = expandTo18DecimalsBN(1)
        planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_OUT, [
          ADDRESS_THIS,
          amountOut,
          expandTo18DecimalsBN(10000),
          [BOND.address, SAMB.address],
          SOURCE_MSG_SENDER,
        ])
        planner.addCommand(CommandType.UNWRAP_SAMB, [MSG_SENDER, amountOut])
        planner.addCommand(CommandType.SWEEP, [BOND.address, MSG_SENDER, 0])

        const { gasSpent, ambBalanceBefore, ambBalanceAfter, classicSwapEventArgs } = await executeRouter(planner)
        const { amount0Out: sambTraded } = classicSwapEventArgs!
        expect(ambBalanceAfter.sub(ambBalanceBefore)).to.eq(amountOut.sub(gasSpent))
        expect(sambTraded).to.eq(amountOut)
      })

      it('completes a Classic exactOut swap, with AMB fee', async () => {
        const amountOut = expandTo18DecimalsBN(1)
        const totalPortion = amountOut.mul(ONE_PERCENT_BIPS).div(10000)
        const actualAmountOut = amountOut.sub(totalPortion)

        planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_OUT, [
          ADDRESS_THIS,
          amountOut,
          expandTo18DecimalsBN(10000),
          [BOND.address, SAMB.address],
          SOURCE_MSG_SENDER,
        ])
        planner.addCommand(CommandType.UNWRAP_SAMB, [ADDRESS_THIS, amountOut])
        planner.addCommand(CommandType.PAY_PORTION, [AMB_ADDRESS, alice.address, ONE_PERCENT_BIPS])
        planner.addCommand(CommandType.SWEEP, [AMB_ADDRESS, MSG_SENDER, 0])

        const { commands, inputs } = planner

        await expect(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)).to.changeEtherBalances(
          [alice, bob],
          [totalPortion, actualAmountOut]
        )
      })
    })

    describe('AMB --> ERC20', () => {
      it('completes a Classic exactIn swap', async () => {
        const minAmountOut = expandTo18DecimalsBN(49)
        const pairAddress = Pair.getAddress(BOND, SAMB)
        planner.addCommand(CommandType.WRAP_AMB, [pairAddress, amountIn])
        // amountIn of 0 because the samb is already in the pair
        planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [
          MSG_SENDER,
          0,
          minAmountOut,
          [SAMB.address, BOND.address],
          SOURCE_MSG_SENDER,
        ])

        const { bondBalanceBefore, bondBalanceAfter, classicSwapEventArgs } = await executeRouter(planner, amountIn)
        const { amount1Out: bondTraded } = classicSwapEventArgs!

        expect(bondBalanceAfter.sub(bondBalanceBefore)).to.be.gt(minAmountOut)
        expect(bondBalanceAfter.sub(bondBalanceBefore)).to.equal(bondTraded)
      })

      it('completes a Classic exactOut swap', async () => {
        const amountOut = expandTo18DecimalsBN(100)
        const value = expandTo18DecimalsBN(11)

        planner.addCommand(CommandType.WRAP_AMB, [ADDRESS_THIS, value])
        planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_OUT, [
          MSG_SENDER,
          amountOut,
          expandTo18DecimalsBN(11),
          [SAMB.address, BOND.address],
          SOURCE_ROUTER,
        ])
        planner.addCommand(CommandType.UNWRAP_SAMB, [MSG_SENDER, 0])

        const {
          ambBalanceBefore,
          ambBalanceAfter,
          bondBalanceBefore,
          bondBalanceAfter,
          classicSwapEventArgs,
          gasSpent,
        } = await executeRouter(planner, value)
        const { amount1Out: bondTraded, amount0In: sambTraded } = classicSwapEventArgs!
        expect(bondBalanceAfter.sub(bondBalanceBefore)).gt(amountOut) // rounding
        expect(bondBalanceAfter.sub(bondBalanceBefore)).eq(bondTraded)
        expect(ambBalanceBefore.sub(ambBalanceAfter)).to.eq(sambTraded.add(gasSpent))
      })
    })
  })

  describe('Trade on AstraCL', () => {
    const amountIn: BigNumber = expandTo18DecimalsBN(500)
    const amountInMax: BigNumber = expandTo18DecimalsBN(2000)
    const amountOut: BigNumber = expandTo18DecimalsBN(1)

    beforeEach(async () => {
      // for these tests Bob gives the router max approval on permit2
      await permit2.approve(BOND.address, router.address, MAX_UINT160, DEADLINE)
      await permit2.approve(SAMB.address, router.address, MAX_UINT160, DEADLINE)
    })

    const addCLExactInTrades = (
      planner: RoutePlanner,
      numTrades: BigNumberish,
      amountOutMin: BigNumberish,
      recipient?: string,
      tokens: string[] = [BOND.address, SAMB.address],
      tokenSource: boolean = SOURCE_MSG_SENDER
    ) => {
      const path = encodePathExactInput(tokens)
      for (let i = 0; i < Number(numTrades); i++) {
        planner.addCommand(CommandType.CL_SWAP_EXACT_IN, [
          recipient ?? MSG_SENDER,
          amountIn,
          amountOutMin,
          path,
          tokenSource,
        ])
      }
    }

    describe('ERC20 --> ERC20', () => {
      it('completes a CL exactIn swap', async () => {
        const amountOutMin: BigNumber = expandTo18DecimalsBN(0.0005)
        addCLExactInTrades(planner, 1, amountOutMin)

        const { sambBalanceBefore, sambBalanceAfter, clSwapEventArgs } = await executeRouter(planner)
        const { amount1: sambTraded } = clSwapEventArgs!
        expect(sambBalanceAfter.sub(sambBalanceBefore)).to.be.gte(amountOutMin)
        expect(sambBalanceAfter.sub(sambBalanceBefore)).to.eq(sambTraded.mul(-1))
      })

      it('completes a CL exactIn swap with longer path', async () => {
        const amountOutMin: number = 3 * 10 ** 6
        addCLExactInTrades(
          planner,
          1,
          amountOutMin,
          MSG_SENDER,
          [BOND.address, SAMB.address, USDC.address],
          SOURCE_MSG_SENDER
        )

        const {
          bondBalanceBefore,
          bondBalanceAfter,
          sambBalanceBefore,
          sambBalanceAfter,
          usdcBalanceBefore,
          usdcBalanceAfter,
        } = await executeRouter(planner)

        expect(bondBalanceBefore.sub(amountIn)).to.eq(bondBalanceAfter)
        expect(sambBalanceAfter).to.eq(sambBalanceBefore)
        expect(usdcBalanceAfter.sub(usdcBalanceBefore)).to.be.gte(amountOutMin)
      })

      it('completes a CL exactOut swap', async () => {
        // trade BOND in for SAMB out
        const tokens = [BOND.address, SAMB.address]
        const path = encodePathExactOutput(tokens)

        planner.addCommand(CommandType.CL_SWAP_EXACT_OUT, [MSG_SENDER, amountOut, amountInMax, path, SOURCE_MSG_SENDER])

        const { sambBalanceBefore, sambBalanceAfter, clSwapEventArgs } = await executeRouter(planner)
        const { amount0: bondTraded } = clSwapEventArgs!
        expect(sambBalanceAfter.sub(sambBalanceBefore)).to.eq(amountOut)
        expect(bondTraded).to.be.lt(amountInMax)
      })

      it('completes a CL exactOut swap with longer path', async () => {
        // trade BOND in for SAMB out
        const tokens = [BOND.address, USDC.address, SAMB.address]
        const path = encodePathExactOutput(tokens)
        // for these tests Bob gives the router max approval on permit2
        // await permit2.approve(BOND.address, router.address, MAX_UINT160, DEADLINE)

        planner.addCommand(CommandType.CL_SWAP_EXACT_OUT, [MSG_SENDER, amountOut, amountInMax, path, SOURCE_MSG_SENDER])
        const { commands, inputs } = planner

        const balanceWethBefore = await sambContract.balanceOf(bob.address)
        await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)
        const balanceWethAfter = await sambContract.balanceOf(bob.address)
        expect(balanceWethAfter.sub(balanceWethBefore)).to.eq(amountOut)
      })
    })

    describe('ERC20 --> AMB', () => {
      it('completes a CL exactIn swap', async () => {
        const amountOutMin: BigNumber = expandTo18DecimalsBN(0.0005)
        addCLExactInTrades(planner, 1, amountOutMin, ADDRESS_THIS)
        planner.addCommand(CommandType.UNWRAP_SAMB, [MSG_SENDER, 0])

        const { ambBalanceBefore, ambBalanceAfter, clSwapEventArgs, gasSpent } = await executeRouter(planner)
        const { amount1: sambTraded } = clSwapEventArgs!

        expect(ambBalanceAfter.sub(ambBalanceBefore)).to.be.gte(amountOutMin.sub(gasSpent))
        expect(ambBalanceAfter.sub(ambBalanceBefore)).to.eq(sambTraded.mul(-1).sub(gasSpent))
      })

      it('completes a CL exactOut swap', async () => {
        // trade BOND in for SAMB out
        const tokens = [BOND.address, SAMB.address]
        const path = encodePathExactOutput(tokens)

        planner.addCommand(CommandType.CL_SWAP_EXACT_OUT, [
          ADDRESS_THIS,
          amountOut,
          amountInMax,
          path,
          SOURCE_MSG_SENDER,
        ])
        planner.addCommand(CommandType.UNWRAP_SAMB, [MSG_SENDER, amountOut])

        const { ambBalanceBefore, ambBalanceAfter, gasSpent } = await executeRouter(planner)

        expect(ambBalanceAfter.sub(ambBalanceBefore)).to.eq(amountOut.sub(gasSpent))
      })
    })

    describe('AMB --> ERC20', () => {
      it('completes a CL exactIn swap', async () => {
        const tokens = [SAMB.address, BOND.address]
        const amountOutMin: BigNumber = expandTo18DecimalsBN(0.0005)

        planner.addCommand(CommandType.WRAP_AMB, [ADDRESS_THIS, amountIn])
        addCLExactInTrades(planner, 1, amountOutMin, MSG_SENDER, tokens, SOURCE_ROUTER)

        const { ambBalanceBefore, ambBalanceAfter, bondBalanceBefore, bondBalanceAfter, gasSpent } =
          await executeRouter(planner, amountIn)

        expect(ambBalanceBefore.sub(ambBalanceAfter)).to.eq(amountIn.add(gasSpent))
        expect(bondBalanceAfter.sub(bondBalanceBefore)).to.be.gte(amountOutMin)
      })

      it('completes a CL exactOut swap', async () => {
        const tokens = [SAMB.address, BOND.address]
        const path = encodePathExactOutput(tokens)

        planner.addCommand(CommandType.WRAP_AMB, [ADDRESS_THIS, amountInMax])
        planner.addCommand(CommandType.CL_SWAP_EXACT_OUT, [MSG_SENDER, amountOut, amountInMax, path, SOURCE_ROUTER])
        planner.addCommand(CommandType.UNWRAP_SAMB, [MSG_SENDER, 0])

        const { ambBalanceBefore, ambBalanceAfter, bondBalanceBefore, bondBalanceAfter, gasSpent, clSwapEventArgs } =
          await executeRouter(planner, amountInMax)
        const { amount0: bondTraded, amount1: sambTraded } = clSwapEventArgs!

        expect(bondBalanceBefore.sub(bondBalanceAfter)).to.eq(bondTraded)
        expect(ambBalanceBefore.sub(ambBalanceAfter)).to.eq(sambTraded.add(gasSpent))
      })
    })
  })

  describe('Mixing Classic and CL', () => {
    beforeEach(async () => {
      // for these tests Bob gives the router max approval on permit2
      await permit2.approve(BOND.address, router.address, MAX_UINT160, DEADLINE)
      await permit2.approve(SAMB.address, router.address, MAX_UINT160, DEADLINE)
      await permit2.approve(USDC.address, router.address, MAX_UINT160, DEADLINE)
    })

    describe('Interleaving routes', () => {
      it('CL, then Classic', async () => {
        const clTokens = [BOND.address, USDC.address]
        const classicTokens = [USDC.address, SAMB.address]
        const clAmountIn: BigNumber = expandTo18DecimalsBN(5)
        const clAmountOutMin = 0
        const classicAmountOutMin = expandTo18DecimalsBN(0.0005)

        planner.addCommand(CommandType.CL_SWAP_EXACT_IN, [
          Pair.getAddress(USDC, SAMB),
          clAmountIn,
          clAmountOutMin,
          encodePathExactInput(clTokens),
          SOURCE_MSG_SENDER,
        ])
        // amountIn of 0 because the USDC is already in the pair
        planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [
          MSG_SENDER,
          0,
          classicAmountOutMin,
          classicTokens,
          SOURCE_MSG_SENDER,
        ])

        const { sambBalanceBefore, sambBalanceAfter, classicSwapEventArgs } = await executeRouter(planner)
        const { amount1Out: sambTraded } = classicSwapEventArgs!
        expect(sambBalanceAfter.sub(sambBalanceBefore)).to.eq(sambTraded)
      })

      it('Classic, then CL', async () => {
        const classicTokens = [BOND.address, USDC.address]
        const clTokens = [USDC.address, SAMB.address]
        const classicAmountIn: BigNumber = expandTo18DecimalsBN(5)
        const classicAmountOutMin = 0 // doesnt matter how much USDC it is, what matters is the end of the trade
        const clAmountOutMin = expandTo18DecimalsBN(0.0005)

        planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [
          ADDRESS_THIS,
          classicAmountIn,
          classicAmountOutMin,
          classicTokens,
          SOURCE_MSG_SENDER,
        ])
        planner.addCommand(CommandType.CL_SWAP_EXACT_IN, [
          MSG_SENDER,
          CONTRACT_BALANCE,
          clAmountOutMin,
          encodePathExactInput(clTokens),
          SOURCE_ROUTER,
        ])

        const { sambBalanceBefore, sambBalanceAfter, clSwapEventArgs } = await executeRouter(planner)
        const { amount1: sambTraded } = clSwapEventArgs!
        expect(sambBalanceAfter.sub(sambBalanceBefore)).to.eq(sambTraded.mul(-1))
      })
    })

    describe('Split routes', () => {
      it('ERC20 --> ERC20 split Classic and Classic different routes, each two hop, with explicit permit transfer from', async () => {
        const route1 = [BOND.address, USDC.address, SAMB.address]
        const route2 = [BOND.address, KOS.address, SAMB.address]
        const classicAmountIn1: BigNumber = expandTo18DecimalsBN(20)
        const classicAmountIn2: BigNumber = expandTo18DecimalsBN(30)
        const minAmountOut1 = expandTo18DecimalsBN(0.005)
        const minAmountOut2 = expandTo18DecimalsBN(0.0075)

        // 1) transfer funds into BOND-USDC and BOND-KOS pairs to trade
        planner.addCommand(CommandType.PERMIT2_TRANSFER_FROM, [
          BOND.address,
          Pair.getAddress(BOND, USDC),
          classicAmountIn1,
        ])
        planner.addCommand(CommandType.PERMIT2_TRANSFER_FROM, [
          BOND.address,
          Pair.getAddress(BOND, KOS),
          classicAmountIn2,
        ])

        // 2) trade route1 and return tokens to bob
        planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [MSG_SENDER, 0, minAmountOut1, route1, SOURCE_MSG_SENDER])
        // 3) trade route2 and return tokens to bob
        planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [MSG_SENDER, 0, minAmountOut2, route2, SOURCE_MSG_SENDER])

        const { sambBalanceBefore, sambBalanceAfter } = await executeRouter(planner)
        expect(sambBalanceAfter.sub(sambBalanceBefore)).to.be.gte(minAmountOut1.add(minAmountOut2))
      })

      it('ERC20 --> ERC20 split Classic and Classic different routes, each two hop, with explicit permit transfer from batch', async () => {
        const route1 = [BOND.address, USDC.address, SAMB.address]
        const route2 = [BOND.address, KOS.address, SAMB.address]
        const classicAmountIn1: BigNumber = expandTo18DecimalsBN(20)
        const classicAmountIn2: BigNumber = expandTo18DecimalsBN(30)
        const minAmountOut1 = expandTo18DecimalsBN(0.005)
        const minAmountOut2 = expandTo18DecimalsBN(0.0075)

        const BATCH_TRANSFER = [
          {
            from: bob.address,
            to: Pair.getAddress(BOND, USDC),
            amount: classicAmountIn1,
            token: BOND.address,
          },
          {
            from: bob.address,
            to: Pair.getAddress(BOND, KOS),
            amount: classicAmountIn2,
            token: BOND.address,
          },
        ]

        // 1) transfer funds into BOND-USDC and BOND-KOS pairs to trade
        planner.addCommand(CommandType.PERMIT2_TRANSFER_FROM_BATCH, [BATCH_TRANSFER])

        // 2) trade route1 and return tokens to bob
        planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [MSG_SENDER, 0, minAmountOut1, route1, SOURCE_MSG_SENDER])
        // 3) trade route2 and return tokens to bob
        planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [MSG_SENDER, 0, minAmountOut2, route2, SOURCE_MSG_SENDER])

        const { sambBalanceBefore, sambBalanceAfter } = await executeRouter(planner)
        expect(sambBalanceAfter.sub(sambBalanceBefore)).to.be.gte(minAmountOut1.add(minAmountOut2))
      })

      it('ERC20 --> ERC20 split Classic and Classic different routes, each two hop, without explicit permit', async () => {
        const route1 = [BOND.address, USDC.address, SAMB.address]
        const route2 = [BOND.address, KOS.address, SAMB.address]
        const classicAmountIn1: BigNumber = expandTo18DecimalsBN(20)
        const classicAmountIn2: BigNumber = expandTo18DecimalsBN(30)
        const minAmountOut1 = expandTo18DecimalsBN(0.005)
        const minAmountOut2 = expandTo18DecimalsBN(0.0075)

        // 1) trade route1 and return tokens to bob
        planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [
          MSG_SENDER,
          classicAmountIn1,
          minAmountOut1,
          route1,
          SOURCE_MSG_SENDER,
        ])
        // 2) trade route2 and return tokens to bob
        planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [
          MSG_SENDER,
          classicAmountIn2,
          minAmountOut2,
          route2,
          SOURCE_MSG_SENDER,
        ])

        const { sambBalanceBefore, sambBalanceAfter } = await executeRouter(planner)
        expect(sambBalanceAfter.sub(sambBalanceBefore)).to.be.gte(minAmountOut1.add(minAmountOut2))
      })

      it('ERC20 --> ERC20 split Classic and Classic different routes, different input tokens, each two hop, with batch permit', async () => {
        const route1 = [BOND.address, SAMB.address, USDC.address]
        const route2 = [SAMB.address, BOND.address, USDC.address]
        const classicAmountIn1: BigNumber = expandTo18DecimalsBN(20)
        const classicAmountIn2: BigNumber = expandTo18DecimalsBN(5)
        const minAmountOut1 = BigNumber.from(0.005 * 10 ** 6)
        const minAmountOut2 = BigNumber.from(0.0075 * 10 ** 6)

        const BATCH_PERMIT = {
          details: [
            {
              token: BOND.address,
              amount: classicAmountIn1,
              expiration: 0, // expiration of 0 is block.timestamp
              nonce: 0, // this is his first trade
            },
            {
              token: SAMB.address,
              amount: classicAmountIn2,
              expiration: 0, // expiration of 0 is block.timestamp
              nonce: 0, // this is his first trade
            },
          ],
          spender: router.address,
          sigDeadline: DEADLINE,
        }

        const sig = await getPermitBatchSignature(BATCH_PERMIT, bob, permit2)

        // 1) transfer funds into BOND-USDC and BOND-KOS pairs to trade
        planner.addCommand(CommandType.PERMIT2_PERMIT_BATCH, [BATCH_PERMIT, sig])

        // 2) trade route1 and return tokens to bob
        planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [
          MSG_SENDER,
          classicAmountIn1,
          minAmountOut1,
          route1,
          SOURCE_MSG_SENDER,
        ])
        // 3) trade route2 and return tokens to bob
        planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [
          MSG_SENDER,
          classicAmountIn2,
          minAmountOut2,
          route2,
          SOURCE_MSG_SENDER,
        ])

        const { usdcBalanceBefore, usdcBalanceAfter } = await executeRouter(planner)
        expect(usdcBalanceAfter.sub(usdcBalanceBefore)).to.be.gte(minAmountOut1.add(minAmountOut2))
      })

      it('ERC20 --> ERC20 CL trades with different input tokens with batch permit and batch transfer', async () => {
        const route1 = [BOND.address, SAMB.address]
        const route2 = [SAMB.address, USDC.address]
        const clAmountIn1: BigNumber = expandTo18DecimalsBN(20)
        const clAmountIn2: BigNumber = expandTo18DecimalsBN(5)
        const minAmountOut1SAMB = BigNumber.from(0)
        const minAmountOut1USDC = BigNumber.from(0.005 * 10 ** 6)
        const minAmountOut2USDC = BigNumber.from(0.0075 * 10 ** 6)

        const BATCH_PERMIT = {
          details: [
            {
              token: BOND.address,
              amount: clAmountIn1,
              expiration: 0, // expiration of 0 is block.timestamp
              nonce: 0, // this is his first trade
            },
            {
              token: SAMB.address,
              amount: clAmountIn2,
              expiration: 0, // expiration of 0 is block.timestamp
              nonce: 0, // this is his first trade
            },
          ],
          spender: router.address,
          sigDeadline: DEADLINE,
        }

        const BATCH_TRANSFER = [
          {
            from: bob.address,
            to: router.address,
            amount: clAmountIn1,
            token: BOND.address,
          },
          {
            from: bob.address,
            to: router.address,
            amount: clAmountIn2,
            token: SAMB.address,
          },
        ]

        const sig = await getPermitBatchSignature(BATCH_PERMIT, bob, permit2)

        // 1) permit bond and samb to be spent by router
        planner.addCommand(CommandType.PERMIT2_PERMIT_BATCH, [BATCH_PERMIT, sig])

        // 2) transfer bond and samb into router to use contract balance
        planner.addCommand(CommandType.PERMIT2_TRANSFER_FROM_BATCH, [BATCH_TRANSFER])

        // clSwapExactInput(recipient, amountIn, amountOutMin, path, payer);

        // 2) trade route1 and return tokens to router for the second trade
        planner.addCommand(CommandType.CL_SWAP_EXACT_IN, [
          ADDRESS_THIS,
          CONTRACT_BALANCE,
          minAmountOut1SAMB,
          encodePathExactInput(route1),
          SOURCE_ROUTER,
        ])
        // 3) trade route2 and return tokens to bob
        planner.addCommand(CommandType.CL_SWAP_EXACT_IN, [
          MSG_SENDER,
          CONTRACT_BALANCE,
          minAmountOut1USDC.add(minAmountOut2USDC),
          encodePathExactInput(route2),
          SOURCE_ROUTER,
        ])

        const { usdcBalanceBefore, usdcBalanceAfter } = await executeRouter(planner)
        expect(usdcBalanceAfter.sub(usdcBalanceBefore)).to.be.gte(minAmountOut1USDC.add(minAmountOut2USDC))
      })

      it('ERC20 --> ERC20 split Classic and CL, one hop', async () => {
        const tokens = [BOND.address, SAMB.address]
        const classicAmountIn: BigNumber = expandTo18DecimalsBN(2)
        const clAmountIn: BigNumber = expandTo18DecimalsBN(3)
        const minAmountOut = expandTo18DecimalsBN(0.0005)

        // Classic trades BOND for USDC, sending the tokens back to the router for cl trade
        planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [
          ADDRESS_THIS,
          classicAmountIn,
          0,
          tokens,
          SOURCE_MSG_SENDER,
        ])
        // CL trades USDC for SAMB, trading the whole balance, with a recipient of Alice
        planner.addCommand(CommandType.CL_SWAP_EXACT_IN, [
          ADDRESS_THIS,
          clAmountIn,
          0,
          encodePathExactInput(tokens),
          SOURCE_MSG_SENDER,
        ])
        // aggregate slippage check
        planner.addCommand(CommandType.SWEEP, [SAMB.address, MSG_SENDER, minAmountOut])

        const { sambBalanceBefore, sambBalanceAfter, classicSwapEventArgs, clSwapEventArgs } = await executeRouter(
          planner
        )
        const { amount1Out: sambOutClassic } = classicSwapEventArgs!
        let { amount1: sambOutCL } = clSwapEventArgs!

        // expect(bondBalanceBefore.sub(bondBalanceAfter)).to.eq(classicAmountIn.add(clAmountIn)) // TODO: with permit2 can check from alice's balance
        expect(sambBalanceAfter.sub(sambBalanceBefore)).to.eq(sambOutClassic.sub(sambOutCL))
      })

      it('AMB --> ERC20 split Classic and CL, one hop', async () => {
        const tokens = [SAMB.address, USDC.address]
        const classicAmountIn: BigNumber = expandTo18DecimalsBN(2)
        const clAmountIn: BigNumber = expandTo18DecimalsBN(3)
        const value = classicAmountIn.add(clAmountIn)

        planner.addCommand(CommandType.WRAP_AMB, [ADDRESS_THIS, value])
        planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [ADDRESS_THIS, classicAmountIn, 0, tokens, SOURCE_ROUTER])
        planner.addCommand(CommandType.CL_SWAP_EXACT_IN, [
          ADDRESS_THIS,
          clAmountIn,
          0,
          encodePathExactInput(tokens),
          SOURCE_MSG_SENDER,
        ])
        // aggregate slippage check
        planner.addCommand(CommandType.SWEEP, [USDC.address, MSG_SENDER, 0.0005 * 10 ** 6])

        const { usdcBalanceBefore, usdcBalanceAfter, classicSwapEventArgs, clSwapEventArgs } = await executeRouter(
          planner,
          value
        )
        const { amount0Out: usdcOutClassic } = classicSwapEventArgs!
        let { amount0: usdcOutCL } = clSwapEventArgs!
        usdcOutCL = usdcOutCL.mul(-1)
        expect(usdcBalanceAfter.sub(usdcBalanceBefore)).to.eq(usdcOutClassic.add(usdcOutCL))
      })

      it('ERC20 --> AMB split Classic and CL, one hop', async () => {
        const tokens = [BOND.address, SAMB.address]
        const classicAmountIn: BigNumber = expandTo18DecimalsBN(20)
        const clAmountIn: BigNumber = expandTo18DecimalsBN(30)

        planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [
          ADDRESS_THIS,
          classicAmountIn,
          0,
          tokens,
          SOURCE_MSG_SENDER,
        ])
        planner.addCommand(CommandType.CL_SWAP_EXACT_IN, [
          ADDRESS_THIS,
          clAmountIn,
          0,
          encodePathExactInput(tokens),
          SOURCE_MSG_SENDER,
        ])
        // aggregate slippage check
        planner.addCommand(CommandType.UNWRAP_SAMB, [MSG_SENDER, expandTo18DecimalsBN(0.0005)])

        const { ambBalanceBefore, ambBalanceAfter, gasSpent, classicSwapEventArgs, clSwapEventArgs } =
          await executeRouter(planner)
        const { amount1Out: sambOutClassic } = classicSwapEventArgs!
        let { amount1: sambOutCL } = clSwapEventArgs!
        sambOutCL = sambOutCL.mul(-1)

        expect(ambBalanceAfter.sub(ambBalanceBefore)).to.eq(sambOutClassic.add(sambOutCL).sub(gasSpent))
      })

      it('ERC20 --> AMB split Classic and CL, exactOut, one hop', async () => {
        const tokens = [BOND.address, SAMB.address]
        const classicAmountOut: BigNumber = expandTo18DecimalsBN(0.5)
        const clAmountOut: BigNumber = expandTo18DecimalsBN(1)
        const path = encodePathExactOutput(tokens)
        const maxAmountIn = expandTo18DecimalsBN(4000)
        const fullAmountOut = classicAmountOut.add(clAmountOut)

        planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_OUT, [
          ADDRESS_THIS,
          classicAmountOut,
          maxAmountIn,
          [BOND.address, SAMB.address],
          SOURCE_MSG_SENDER,
        ])
        planner.addCommand(CommandType.CL_SWAP_EXACT_OUT, [
          ADDRESS_THIS,
          clAmountOut,
          maxAmountIn,
          path,
          SOURCE_MSG_SENDER,
        ])
        // aggregate slippage check
        planner.addCommand(CommandType.UNWRAP_SAMB, [MSG_SENDER, fullAmountOut])

        const { ambBalanceBefore, ambBalanceAfter, gasSpent } = await executeRouter(planner)

        // TODO: permit2 test alice doesn't send more than maxAmountIn BOND
        expect(ambBalanceAfter.sub(ambBalanceBefore)).to.eq(fullAmountOut.sub(gasSpent))
      })

      describe('Batch reverts', () => {
        let subplan: RoutePlanner
        let planOneTokens: string[]
        let planTwoTokens: string[]
        const planOneClassicAmountIn: BigNumber = expandTo18DecimalsBN(2)
        const planOneCLAmountIn: BigNumber = expandTo18DecimalsBN(3)
        const planTwoCLAmountIn = expandTo6DecimalsBN(5)

        beforeEach(async () => {
          subplan = new RoutePlanner()
          planOneTokens = [BOND.address, SAMB.address]
          planTwoTokens = [USDC.address, SAMB.address]
        })

        it('2 sub-plans, neither fails', async () => {
          // first split route sub-plan. BOND->SAMB, 2 routes on Classic and CL.
          const planOneWethMinOut = expandTo18DecimalsBN(0.0005)

          // Classic trades BOND for USDC, sending the tokens back to the router for cl trade
          subplan.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [
            ADDRESS_THIS,
            planOneClassicAmountIn,
            0,
            planOneTokens,
            SOURCE_MSG_SENDER,
          ])
          // CL trades USDC for SAMB, trading the whole balance, with a recipient of Alice
          subplan.addCommand(CommandType.CL_SWAP_EXACT_IN, [
            ADDRESS_THIS,
            planOneCLAmountIn,
            0,
            encodePathExactInput(planOneTokens),
            SOURCE_MSG_SENDER,
          ])
          // aggregate slippage check
          subplan.addCommand(CommandType.SWEEP, [SAMB.address, MSG_SENDER, planOneWethMinOut])

          // add the subplan to the main planner
          planner.addSubPlan(subplan)
          subplan = new RoutePlanner()

          // second split route sub-plan. USDC->SAMB, 1 route on CL
          const sambMinAmountOut2 = expandTo18DecimalsBN(0.0005)

          // Add the trade to the sub-plan
          subplan.addCommand(CommandType.CL_SWAP_EXACT_IN, [
            MSG_SENDER,
            planTwoCLAmountIn,
            sambMinAmountOut2,
            encodePathExactInput(planTwoTokens),
            SOURCE_MSG_SENDER,
          ])

          // add the second subplan to the main planner
          planner.addSubPlan(subplan)

          const { usdcBalanceBefore, usdcBalanceAfter, bondBalanceBefore, bondBalanceAfter } = await executeRouter(
            planner
          )

          expect(bondBalanceBefore.sub(bondBalanceAfter)).to.eq(planOneClassicAmountIn.add(planOneCLAmountIn))
          expect(usdcBalanceBefore.sub(usdcBalanceAfter)).to.eq(planTwoCLAmountIn)
        })

        it('2 sub-plans, the first fails', async () => {
          // first split route sub-plan. BOND->SAMB, 2 routes on Classic and CL.
          // FAIL: large samb amount out to cause a failure
          const planOneWethMinOut = expandTo18DecimalsBN(1)

          // Classic trades BOND for USDC, sending the tokens back to the router for cl trade
          subplan.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [
            ADDRESS_THIS,
            planOneClassicAmountIn,
            0,
            planOneTokens,
            SOURCE_MSG_SENDER,
          ])
          // CL trades USDC for SAMB, trading the whole balance, with a recipient of Alice
          subplan.addCommand(CommandType.CL_SWAP_EXACT_IN, [
            ADDRESS_THIS,
            planOneCLAmountIn,
            0,
            encodePathExactInput(planOneTokens),
            SOURCE_MSG_SENDER,
          ])
          // aggregate slippage check
          subplan.addCommand(CommandType.SWEEP, [SAMB.address, MSG_SENDER, planOneWethMinOut])

          // add the subplan to the main planner
          planner.addSubPlan(subplan)
          subplan = new RoutePlanner()

          // second split route sub-plan. USDC->SAMB, 1 route on CL
          const sambMinAmountOut2 = expandTo18DecimalsBN(0.0005)

          // Add the trade to the sub-plan
          subplan.addCommand(CommandType.CL_SWAP_EXACT_IN, [
            MSG_SENDER,
            planTwoCLAmountIn,
            sambMinAmountOut2,
            encodePathExactInput(planTwoTokens),
            SOURCE_MSG_SENDER,
          ])

          // add the second subplan to the main planner
          planner.addSubPlan(subplan)

          const { usdcBalanceBefore, usdcBalanceAfter, bondBalanceBefore, bondBalanceAfter } = await executeRouter(
            planner
          )

          // bond balance should be unchanged as the samb sweep failed
          expect(bondBalanceBefore).to.eq(bondBalanceAfter)

          // usdc is the second trade so the balance has changed
          expect(usdcBalanceBefore.sub(usdcBalanceAfter)).to.eq(planTwoCLAmountIn)
        })

        it('2 sub-plans, both fail but the transaction succeeds', async () => {
          // first split route sub-plan. BOND->SAMB, 2 routes on Classic and CL.
          // FAIL: large amount out to cause the swap to revert
          const planOneWethMinOut = expandTo18DecimalsBN(1)

          // Classic trades BOND for USDC, sending the tokens back to the router for cl trade
          subplan.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [
            ADDRESS_THIS,
            planOneClassicAmountIn,
            0,
            planOneTokens,
            SOURCE_MSG_SENDER,
          ])
          // CL trades USDC for SAMB, trading the whole balance, with a recipient of Alice
          subplan.addCommand(CommandType.CL_SWAP_EXACT_IN, [
            ADDRESS_THIS,
            planOneCLAmountIn,
            0,
            encodePathExactInput(planOneTokens),
            SOURCE_MSG_SENDER,
          ])
          // aggregate slippage check
          subplan.addCommand(CommandType.SWEEP, [SAMB.address, MSG_SENDER, planOneWethMinOut])

          // add the subplan to the main planner
          planner.addSubPlan(subplan)
          subplan = new RoutePlanner()

          // second split route sub-plan. USDC->SAMB, 1 route on CL
          // FAIL: large amount out to cause the swap to revert
          const sambMinAmountOut2 = expandTo18DecimalsBN(1)

          // Add the trade to the sub-plan
          subplan.addCommand(CommandType.CL_SWAP_EXACT_IN, [
            MSG_SENDER,
            planTwoCLAmountIn,
            sambMinAmountOut2,
            encodePathExactInput(planTwoTokens),
            SOURCE_MSG_SENDER,
          ])

          // add the second subplan to the main planner
          planner.addSubPlan(subplan)

          const { usdcBalanceBefore, usdcBalanceAfter, bondBalanceBefore, bondBalanceAfter } = await executeRouter(
            planner
          )

          // bond and usdc balances both unchanged because both trades failed
          expect(bondBalanceBefore).to.eq(bondBalanceAfter)
          expect(usdcBalanceBefore).to.eq(usdcBalanceAfter)
        })

        it('2 sub-plans, second sub plan fails', async () => {
          // first split route sub-plan. BOND->SAMB, 2 routes on Classic and CL.
          const planOneWethMinOut = expandTo18DecimalsBN(0.0005)

          // Classic trades BOND for USDC, sending the tokens back to the router for cl trade
          subplan.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [
            ADDRESS_THIS,
            planOneClassicAmountIn,
            0,
            planOneTokens,
            SOURCE_MSG_SENDER,
          ])
          // CL trades USDC for SAMB, trading the whole balance, with a recipient of Alice
          subplan.addCommand(CommandType.CL_SWAP_EXACT_IN, [
            ADDRESS_THIS,
            planOneCLAmountIn,
            0,
            encodePathExactInput(planOneTokens),
            SOURCE_MSG_SENDER,
          ])
          // aggregate slippage check
          subplan.addCommand(CommandType.SWEEP, [SAMB.address, MSG_SENDER, planOneWethMinOut])

          // add the subplan to the main planner
          planner.addSubPlan(subplan)
          subplan = new RoutePlanner()

          // second split route sub-plan. USDC->SAMB, 1 route on CL
          // FAIL: large amount out to cause the swap to revert
          const sambMinAmountOut2 = expandTo18DecimalsBN(1)

          // Add the trade to the sub-plan
          subplan.addCommand(CommandType.CL_SWAP_EXACT_IN, [
            MSG_SENDER,
            planTwoCLAmountIn,
            sambMinAmountOut2,
            encodePathExactInput(planTwoTokens),
            SOURCE_MSG_SENDER,
          ])

          // add the second subplan to the main planner
          planner.addSubPlan(subplan)

          const { usdcBalanceBefore, usdcBalanceAfter, bondBalanceBefore, bondBalanceAfter } = await executeRouter(
            planner
          )

          // bond balance has changed as this trade should succeed
          expect(bondBalanceBefore.sub(bondBalanceAfter)).to.eq(planOneClassicAmountIn.add(planOneCLAmountIn))

          // usdc is unchanged as the second trade should have failed
          expect(usdcBalanceBefore).to.eq(usdcBalanceAfter)
        })
      })
    })
  })

  type ClassicSwapEventArgs = {
    amount0In: BigNumber
    amount0Out: BigNumber
    amount1In: BigNumber
    amount1Out: BigNumber
  }

  type CLSwapEventArgs = {
    amount0: BigNumber
    amount1: BigNumber
  }

  type ExecutionParams = {
    sambBalanceBefore: BigNumber
    sambBalanceAfter: BigNumber
    bondBalanceBefore: BigNumber
    bondBalanceAfter: BigNumber
    usdcBalanceBefore: BigNumber
    usdcBalanceAfter: BigNumber
    ambBalanceBefore: BigNumber
    ambBalanceAfter: BigNumber
    classicSwapEventArgs: ClassicSwapEventArgs | undefined
    clSwapEventArgs: CLSwapEventArgs | undefined
    receipt: TransactionReceipt
    gasSpent: BigNumber
  }

  async function executeRouter(planner: RoutePlanner, value?: BigNumberish): Promise<ExecutionParams> {
    const ambBalanceBefore: BigNumber = await ethers.provider.getBalance(bob.address)
    const sambBalanceBefore: BigNumber = await sambContract.balanceOf(bob.address)
    const usdcBalanceBefore: BigNumber = await usdcContract.balanceOf(bob.address)
    const bondBalanceBefore: BigNumber = await bondContract.balanceOf(bob.address)

    const { commands, inputs } = planner
    const tx = await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })
    const receipt = await tx.wait()
    const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)
    const classicSwapEventArgs = parseEvents(CLASSIC_EVENTS, receipt)[0]?.args as unknown as ClassicSwapEventArgs
    const clSwapEventArgs = parseEvents(CL_EVENTS, receipt)[0]?.args as unknown as CLSwapEventArgs

    const ambBalanceAfter: BigNumber = await ethers.provider.getBalance(bob.address)
    const sambBalanceAfter: BigNumber = await sambContract.balanceOf(bob.address)
    const bondBalanceAfter: BigNumber = await bondContract.balanceOf(bob.address)
    const usdcBalanceAfter: BigNumber = await usdcContract.balanceOf(bob.address)

    return {
      sambBalanceBefore,
      sambBalanceAfter,
      bondBalanceBefore,
      bondBalanceAfter,
      usdcBalanceBefore,
      usdcBalanceAfter,
      ambBalanceBefore,
      ambBalanceAfter,
      classicSwapEventArgs,
      clSwapEventArgs,
      receipt,
      gasSpent,
    }
  }

  function encodePathExactInput(tokens: string[]) {
    return encodePath(tokens, new Array(tokens.length - 1).fill(FeeAmount.MEDIUM))
  }

  function encodePathExactOutput(tokens: string[]) {
    return encodePath(tokens.slice().reverse(), new Array(tokens.length - 1).fill(FeeAmount.MEDIUM))
  }
})
