import { CurrencyAmount, Amber, Percent, Token, TradeType } from 'astra-sdk-core'
import { Route as ClassicRouteSDK, Pair } from 'astra-classic-sdk'
import { Route as CLRouteSDK, FeeAmount } from 'astra-cl-sdk-dev'
import { SwapRouter, Trade } from 'astra-router-sdk'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import deployUniversalRouter, { deployPermit2 } from '../shared/deployUniversalRouter'
import { getPermitBatchSignature } from '../shared/protocolHelpers/permit2'
import {
  makePair,
  expandTo18Decimals,
  encodePath,
  pool_BOND_SAMB,
  pool_BOND_USDC,
  pool_USDC_SAMB,
  pool_USDC_KOS,
  pool_SAMB_KOS,
} from '../shared/swapRouter02Helpers'
import { BigNumber, BigNumberish } from 'ethers'
import { UniversalRouter, Permit2, ISAMB, ERC20, ISAMB__factory, ERC20__factory } from '../../../typechain'
import { approveAndExecuteSwapRouter02, resetFork, SAMB, BOND, USDC, KOS } from '../shared/testnetForkHelpers'
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
} from '../shared/constants'
import { expandTo18DecimalsBN, expandTo6DecimalsBN } from '../shared/helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import { RoutePlanner, CommandType } from '../shared/planner'
const { ethers } = hre

function encodePathExactInput(tokens: string[]) {
  return encodePath(tokens, new Array(tokens.length - 1).fill(FeeAmount.MEDIUM))
}

function encodePathExactOutput(tokens: string[]) {
  return encodePath(tokens.slice().reverse(), new Array(tokens.length - 1).fill(FeeAmount.MEDIUM))
}

describe('Astra Gas Tests', () => {
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let router: UniversalRouter
  let permit2: Permit2
  let sambContract: ISAMB
  let bondContract: ERC20
  let usdcContract: ERC20
  let planner: RoutePlanner

  // 6 pairs for gas tests with high numbers of trades
  let pair_BOND_SAMB: Pair
  let pair_BOND_USDC: Pair
  let pair_USDC_SAMB: Pair

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
    await (await ISAMB__factory.connect(SAMB.address, alice).deposit({ value: expandTo18DecimalsBN(1000) })).wait()
    bondContract = ERC20__factory.connect(BOND.address, bob)
    usdcContract = ERC20__factory.connect(USDC.address, bob)
    sambContract = ISAMB__factory.connect(SAMB.address, bob)
    permit2 = (await deployPermit2()).connect(bob) as Permit2
    router = (await deployUniversalRouter(permit2)).connect(bob) as UniversalRouter
    pair_BOND_SAMB = await makePair(bob, BOND, SAMB)
    pair_BOND_USDC = await makePair(bob, BOND, USDC)
    pair_USDC_SAMB = await makePair(bob, USDC, SAMB)

    // alice gives bob some tokens
    await bondContract.connect(alice).transfer(bob.address, expandTo18DecimalsBN(100000))
    await sambContract.connect(alice).transfer(bob.address, expandTo18DecimalsBN(100))

    // Bob max-approves the permit2 contract to access his BOND and SAMB
    await bondContract.connect(bob).approve(permit2.address, MAX_UINT)
    await sambContract.connect(bob).approve(permit2.address, MAX_UINT)
  })

  describe('Trade on AstraClassic', () => {
    describe('with Router02.', () => {
      const slippageTolerance = new Percent(10, 100)
      const recipient = '0x0000000000000000000000000000000000000003'

      let amountInBOND: CurrencyAmount<Token>
      let amountInAMB: CurrencyAmount<Amber>
      let amountOut: CurrencyAmount<Token>
      let classicTradeExactIn: Trade<Token, Token, TradeType.EXACT_INPUT>
      let classicTradeExactOut: Trade<Token, Token, TradeType.EXACT_OUTPUT>

      beforeEach(async () => {
        amountInBOND = CurrencyAmount.fromRawAmount(BOND, expandTo18Decimals(5))
        amountInAMB = CurrencyAmount.fromRawAmount(Amber.onChain(22040), expandTo18Decimals(5))
        amountOut = CurrencyAmount.fromRawAmount(BOND, expandTo18Decimals(5))
      })

      it('gas: ERC20 --> ERC20 exactIn, one trade, one hop', async () => {
        classicTradeExactIn = await Trade.fromRoute(
          new ClassicRouteSDK([pair_BOND_SAMB], BOND, SAMB),
          amountInBOND,
          TradeType.EXACT_INPUT
        )
        const { calldata } = SwapRouter.swapCallParameters(classicTradeExactIn, {
          slippageTolerance,
          recipient,
          deadlineOrPreviousBlockhash: DEADLINE,
        })

        await snapshotGasCost(approveAndExecuteSwapRouter02({ value: '0', calldata }, BOND, SAMB, bob))
      })

      it('gas: ERC20 --> ERC20 exactIn, one trade, two hops', async () => {
        classicTradeExactIn = await Trade.fromRoute(
          new ClassicRouteSDK([pair_BOND_USDC, pair_USDC_SAMB], BOND, SAMB),
          amountInBOND,
          TradeType.EXACT_INPUT
        )
        const { calldata } = SwapRouter.swapCallParameters(classicTradeExactIn, {
          slippageTolerance,
          recipient,
          deadlineOrPreviousBlockhash: DEADLINE,
        })

        await snapshotGasCost(approveAndExecuteSwapRouter02({ value: '0', calldata }, BOND, SAMB, bob))
      })

      it('gas: AMB --> ERC20 exactIn, one trade, one hop', async () => {
        const trade = await Trade.fromRoute(
          new ClassicRouteSDK([pair_BOND_SAMB], Amber.onChain(22040), BOND),
          amountInAMB,
          TradeType.EXACT_INPUT
        )
        const { calldata, value } = SwapRouter.swapCallParameters(trade, {
          slippageTolerance,
          recipient,
          deadlineOrPreviousBlockhash: DEADLINE,
        })

        await snapshotGasCost(approveAndExecuteSwapRouter02({ value, calldata }, BOND, SAMB, bob))
      })

      it('gas: ERC20 --> ERC20 exactOut, one trade, one hop', async () => {
        classicTradeExactOut = await Trade.fromRoute(
          new ClassicRouteSDK([pair_BOND_SAMB], SAMB, BOND),
          amountOut,
          TradeType.EXACT_OUTPUT
        )
        const { calldata } = SwapRouter.swapCallParameters(classicTradeExactOut, {
          slippageTolerance,
          recipient,
          deadlineOrPreviousBlockhash: DEADLINE,
        })

        await snapshotGasCost(approveAndExecuteSwapRouter02({ value: '0', calldata }, SAMB, BOND, bob))
      })

      it('gas: ERC20 --> AMB exactOut AMB, one trade, one hop', async () => {
        const amountOutAMB = CurrencyAmount.fromRawAmount(Amber.onChain(22040), expandTo18Decimals(5))
        const trade = await Trade.fromRoute(
          new ClassicRouteSDK([pair_BOND_SAMB], BOND, Amber.onChain(22040)),
          amountOutAMB,
          TradeType.EXACT_OUTPUT
        )
        const { calldata, value } = SwapRouter.swapCallParameters(trade, {
          slippageTolerance,
          recipient,
          deadlineOrPreviousBlockhash: DEADLINE,
        })

        await snapshotGasCost(approveAndExecuteSwapRouter02({ value, calldata }, BOND, SAMB, bob))
      })
    })

    describe('with Universal Router.', () => {
      const amountIn: BigNumber = expandTo18DecimalsBN(5)
      let planner: RoutePlanner

      beforeEach(async () => {
        planner = new RoutePlanner()
        // for these tests Bob gives the router max approval on permit2
        await permit2.approve(BOND.address, router.address, MAX_UINT160, DEADLINE)
        await permit2.approve(SAMB.address, router.address, MAX_UINT160, DEADLINE)
      })

      describe('ERC20 --> ERC20', () => {
        const minAmountOut = expandTo18DecimalsBN(0.0001)

        it('gas: exactIn, one trade, one hop', async () => {
          planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [
            MSG_SENDER,
            amountIn,
            minAmountOut,
            [BOND.address, SAMB.address],
            SOURCE_MSG_SENDER,
          ])
          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactIn, one trade, two hops', async () => {
          planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [
            MSG_SENDER,
            amountIn,
            minAmountOut,
            [BOND.address, USDC.address, SAMB.address],
            SOURCE_MSG_SENDER,
          ])
          const { commands, inputs } = planner

          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactIn, one trade, two hops, MSG_SENDER flag', async () => {
          planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [
            MSG_SENDER,
            amountIn,
            minAmountOut,
            [BOND.address, USDC.address, SAMB.address],
            SOURCE_MSG_SENDER,
          ])
          const { commands, inputs } = planner

          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactIn, one trade, three hops', async () => {
          planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [
            MSG_SENDER,
            amountIn,
            minAmountOut,
            [BOND.address, USDC.address, KOS.address, SAMB.address],
            SOURCE_MSG_SENDER,
          ])
          const { commands, inputs } = planner

          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactIn, one trade, three hops, no deadline', async () => {
          planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [
            MSG_SENDER,
            amountIn,
            1,
            [BOND.address, USDC.address, KOS.address, SAMB.address],
            SOURCE_MSG_SENDER,
          ])
          const { commands, inputs } = planner

          await snapshotGasCost(router['execute(bytes,bytes[])'](commands, inputs))
        })

        it('gas: exactIn trade, where an output fee is taken', async () => {
          // back to the router so someone can take a fee
          planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [
            router.address,
            amountIn,
            1,
            [BOND.address, SAMB.address],
            SOURCE_MSG_SENDER,
          ])
          planner.addCommand(CommandType.PAY_PORTION, [SAMB.address, alice.address, ONE_PERCENT_BIPS])
          planner.addCommand(CommandType.SWEEP, [SAMB.address, MSG_SENDER, 1])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactOut, one trade, one hop', async () => {
          planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_OUT, [
            MSG_SENDER,
            expandTo18DecimalsBN(5),
            expandTo18DecimalsBN(100),
            [SAMB.address, BOND.address],
            SOURCE_MSG_SENDER,
          ])
          const { commands, inputs } = planner

          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactOut, one trade, two hops', async () => {
          planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_OUT, [
            MSG_SENDER,
            expandTo18DecimalsBN(5),
            expandTo18DecimalsBN(100),
            [SAMB.address, USDC.address, BOND.address],
            SOURCE_MSG_SENDER,
          ])
          const { commands, inputs } = planner

          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactOut, one trade, three hops', async () => {
          planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_OUT, [
            MSG_SENDER,
            expandTo18DecimalsBN(5),
            expandTo18DecimalsBN(100),
            [SAMB.address, KOS.address, USDC.address, BOND.address],
            SOURCE_MSG_SENDER,
          ])
          const { commands, inputs } = planner

          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })
      })

      describe('ERC20 --> AMB', () => {
        it('gas: exactIn, one trade, one hop', async () => {
          planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [
            router.address,
            amountIn,
            1,
            [BOND.address, SAMB.address],
            SOURCE_MSG_SENDER,
          ])
          planner.addCommand(CommandType.UNWRAP_SAMB, [MSG_SENDER, 0])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactOut, one trade, one hop', async () => {
          const amountOut = expandTo18DecimalsBN(1)
          planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_OUT, [
            router.address,
            amountOut,
            expandTo18DecimalsBN(10000),
            [BOND.address, SAMB.address],
            SOURCE_MSG_SENDER,
          ])
          planner.addCommand(CommandType.UNWRAP_SAMB, [MSG_SENDER, amountOut])
          planner.addCommand(CommandType.SWEEP, [BOND.address, MSG_SENDER, 0])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactOut, with AMB fee', async () => {
          const amountOut = expandTo18DecimalsBN(1)
          planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_OUT, [
            router.address,
            amountOut,
            expandTo18DecimalsBN(10000),
            [BOND.address, SAMB.address],
            SOURCE_MSG_SENDER,
          ])
          planner.addCommand(CommandType.UNWRAP_SAMB, [ADDRESS_THIS, amountOut])
          planner.addCommand(CommandType.PAY_PORTION, [AMB_ADDRESS, MSG_SENDER, 50])
          planner.addCommand(CommandType.SWEEP, [AMB_ADDRESS, alice.address, 0])

          const { commands, inputs } = planner
          await snapshotGasCost(
            router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: amountIn })
          )
        })
      })

      describe('AMB --> ERC20', () => {
        it('gas: exactIn, one trade, one hop', async () => {
          const minAmountOut = expandTo18DecimalsBN(0.001)
          const pairAddress = Pair.getAddress(BOND, SAMB)
          planner.addCommand(CommandType.WRAP_AMB, [pairAddress, amountIn])
          // the money is already in the pair, so amountIn is 0
          planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [
            MSG_SENDER,
            0,
            minAmountOut,
            [SAMB.address, BOND.address],
            SOURCE_MSG_SENDER,
          ])

          const { commands, inputs } = planner
          await snapshotGasCost(
            router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: amountIn })
          )
        })

        it('gas: exactOut, one trade, one hop', async () => {
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

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value }))
        })
      })
    })
  })

  describe('Trade on AstraCL', () => {
    describe('with Router02.', () => {
      const amountIn = CurrencyAmount.fromRawAmount(BOND, expandTo18Decimals(5))
      const amountOut = CurrencyAmount.fromRawAmount(SAMB, expandTo18Decimals(1))
      const slippageTolerance = new Percent(10, 100)

      let clExactIn: Trade<Token, Token, TradeType.EXACT_INPUT>
      let clExactInMultihop: Trade<Token, Token, TradeType.EXACT_INPUT>
      let clExactOut: Trade<Token, Token, TradeType.EXACT_OUTPUT>
      let clExactOutMultihop: Trade<Token, Token, TradeType.EXACT_OUTPUT>

      beforeEach(async () => {
        clExactIn = await Trade.fromRoute(new CLRouteSDK([pool_BOND_SAMB], BOND, SAMB), amountIn, TradeType.EXACT_INPUT)
        clExactOut = await Trade.fromRoute(
          new CLRouteSDK([pool_BOND_SAMB], BOND, SAMB),
          amountOut,
          TradeType.EXACT_OUTPUT
        )
      })

      it('gas: ERC20 --> ERC20 exactIn, one trade, one hop', async () => {
        const { calldata } = SwapRouter.swapCallParameters(clExactIn, {
          slippageTolerance,
          recipient: MSG_SENDER,
          deadlineOrPreviousBlockhash: 2000000000,
        })

        await snapshotGasCost(approveAndExecuteSwapRouter02({ value: '0', calldata }, BOND, SAMB, bob))
      })

      it('gas: ERC20 --> ERC20 exactIn, one trade, two hops', async () => {
        clExactInMultihop = await Trade.fromRoute(
          new CLRouteSDK([pool_BOND_USDC, pool_USDC_SAMB], BOND, SAMB),
          amountIn,
          TradeType.EXACT_INPUT
        )
        const { calldata } = SwapRouter.swapCallParameters(clExactInMultihop, {
          slippageTolerance,
          recipient: MSG_SENDER,
          deadlineOrPreviousBlockhash: 2000000000,
        })

        await snapshotGasCost(approveAndExecuteSwapRouter02({ value: '0', calldata }, BOND, SAMB, bob))
      })

      it('gas: ERC20 --> ERC20 exactIn, one trade, three hops', async () => {
        clExactInMultihop = await Trade.fromRoute(
          new CLRouteSDK([pool_BOND_USDC, pool_USDC_KOS, pool_SAMB_KOS], BOND, SAMB),
          amountIn,
          TradeType.EXACT_INPUT
        )
        const { calldata } = SwapRouter.swapCallParameters(clExactInMultihop, {
          slippageTolerance,
          recipient: MSG_SENDER,
          deadlineOrPreviousBlockhash: 2000000000,
        })

        await snapshotGasCost(approveAndExecuteSwapRouter02({ value: '0', calldata }, BOND, SAMB, bob))
      })

      it('gas: ERC20 --> ERC20 exactOut, one trade, one hop', async () => {
        const { calldata } = SwapRouter.swapCallParameters(clExactOut, {
          slippageTolerance,
          recipient: MSG_SENDER,
          deadlineOrPreviousBlockhash: 2000000000,
        })

        await snapshotGasCost(approveAndExecuteSwapRouter02({ value: '0', calldata }, BOND, SAMB, bob))
      })

      it('gas: ERC20 --> ERC20 exactOut, one trade, two hops', async () => {
        clExactOutMultihop = await Trade.fromRoute(
          new CLRouteSDK([pool_BOND_USDC, pool_USDC_SAMB], BOND, SAMB),
          amountOut,
          TradeType.EXACT_OUTPUT
        )
        const { calldata } = SwapRouter.swapCallParameters(clExactOutMultihop, {
          slippageTolerance,
          recipient: MSG_SENDER,
          deadlineOrPreviousBlockhash: 2000000000,
        })

        await snapshotGasCost(approveAndExecuteSwapRouter02({ value: '0', calldata }, BOND, SAMB, bob))
      })

      it('gas: ERC20 --> ERC20 exactOut, one trade, three hops', async () => {
        clExactOutMultihop = await Trade.fromRoute(
          new CLRouteSDK([pool_BOND_USDC, pool_USDC_KOS, pool_SAMB_KOS], BOND, SAMB),
          amountOut,
          TradeType.EXACT_OUTPUT
        )
        const { calldata } = SwapRouter.swapCallParameters(clExactOutMultihop, {
          slippageTolerance,
          recipient: MSG_SENDER,
          deadlineOrPreviousBlockhash: 2000000000,
        })

        await snapshotGasCost(approveAndExecuteSwapRouter02({ value: '0', calldata }, BOND, SAMB, bob))
      })
    })

    describe('with Universal Router.', () => {
      const amountIn: BigNumber = expandTo18DecimalsBN(500)
      const amountInMax: BigNumber = expandTo18DecimalsBN(2000)
      const amountOut: BigNumber = expandTo18DecimalsBN(1)

      const addCLExactInTrades = (
        planner: RoutePlanner,
        numTrades: BigNumberish,
        amountOutMin: BigNumberish,
        recipient?: string,
        tokens: string[] = [BOND.address, SAMB.address],
        sourceOfTokens: boolean = SOURCE_MSG_SENDER
      ) => {
        const path = encodePathExactInput(tokens)
        for (let i = 0; i < Number(numTrades); i++) {
          planner.addCommand(CommandType.CL_SWAP_EXACT_IN, [
            recipient ?? MSG_SENDER,
            amountIn,
            amountOutMin,
            path,
            sourceOfTokens,
          ])
        }
      }

      beforeEach(async () => {
        planner = new RoutePlanner()

        // for these tests Bob gives the router max approval on permit2
        await permit2.approve(BOND.address, router.address, MAX_UINT160, DEADLINE)
        await permit2.approve(SAMB.address, router.address, MAX_UINT160, DEADLINE)
      })

      describe('ERC20 --> ERC20', () => {
        it('gas: exactIn, one trade, one hop', async () => {
          const amountOutMin: number = 0.0005 * 10 ** 18
          addCLExactInTrades(planner, 1, amountOutMin)
          const { commands, inputs } = planner

          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactIn, one trade, two hops', async () => {
          const amountOutMin: number = 3 * 10 ** 6
          addCLExactInTrades(planner, 1, amountOutMin, MSG_SENDER, [BOND.address, SAMB.address, USDC.address])
          const { commands, inputs } = planner

          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactIn, one trade, three hops', async () => {
          const amountOutMin: number = 3 * 10 ** 6
          addCLExactInTrades(planner, 1, amountOutMin, MSG_SENDER, [
            BOND.address,
            SAMB.address,
            KOS.address,
            USDC.address,
          ])
          const { commands, inputs } = planner

          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactOut, one trade, one hop', async () => {
          const tokens = [BOND.address, SAMB.address]
          const path = encodePathExactOutput(tokens)
          planner.addCommand(CommandType.CL_SWAP_EXACT_OUT, [
            MSG_SENDER,
            amountOut,
            amountInMax,
            path,
            SOURCE_MSG_SENDER,
          ])
          const { commands, inputs } = planner

          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactOut, one trade, two hops', async () => {
          // trade BOND in for SAMB out
          const tokens = [BOND.address, USDC.address, SAMB.address]
          const path = encodePathExactOutput(tokens)

          planner.addCommand(CommandType.CL_SWAP_EXACT_OUT, [
            MSG_SENDER,
            amountOut,
            amountInMax,
            path,
            SOURCE_MSG_SENDER,
          ])
          const { commands, inputs } = planner

          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactOut, one trade, three hops', async () => {
          // trade BOND in for SAMB out
          const tokens = [BOND.address, USDC.address, KOS.address, SAMB.address]
          const path = encodePathExactOutput(tokens)

          planner.addCommand(CommandType.CL_SWAP_EXACT_OUT, [
            MSG_SENDER,
            amountOut,
            amountInMax,
            path,
            SOURCE_MSG_SENDER,
          ])
          const { commands, inputs } = planner

          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })
      })

      describe('ERC20 --> AMB', () => {
        it('gas: exactIn swap', async () => {
          const amountOutMin: BigNumber = expandTo18DecimalsBN(0.0005)
          addCLExactInTrades(planner, 1, amountOutMin, router.address)
          planner.addCommand(CommandType.UNWRAP_SAMB, [MSG_SENDER, 0])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactOut swap', async () => {
          // trade BOND in for SAMB out
          const tokens = [BOND.address, SAMB.address]
          const path = encodePathExactOutput(tokens)
          planner.addCommand(CommandType.CL_SWAP_EXACT_OUT, [
            router.address,
            amountOut,
            amountInMax,
            path,
            SOURCE_MSG_SENDER,
          ])
          planner.addCommand(CommandType.UNWRAP_SAMB, [MSG_SENDER, amountOut])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })
      })

      describe('AMB --> ERC20', () => {
        it('gas: exactIn swap', async () => {
          const tokens = [SAMB.address, BOND.address]
          const amountOutMin: BigNumber = expandTo18DecimalsBN(0.0005)

          planner.addCommand(CommandType.WRAP_AMB, [ADDRESS_THIS, amountIn])
          addCLExactInTrades(planner, 1, amountOutMin, MSG_SENDER, tokens, SOURCE_ROUTER)

          const { commands, inputs } = planner
          await snapshotGasCost(
            router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: amountIn })
          )
        })

        it('gas: exactOut swap', async () => {
          const tokens = [SAMB.address, BOND.address]
          const path = encodePathExactOutput(tokens)

          planner.addCommand(CommandType.WRAP_AMB, [ADDRESS_THIS, amountInMax])
          planner.addCommand(CommandType.CL_SWAP_EXACT_OUT, [MSG_SENDER, amountOut, amountInMax, path, SOURCE_ROUTER])
          planner.addCommand(CommandType.UNWRAP_SAMB, [MSG_SENDER, 0])

          const { commands, inputs } = planner
          await snapshotGasCost(
            router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: amountInMax })
          )
        })
      })
    })
  })

  describe('Mixing Classic and CL', () => {
    describe('with Universal Router.', () => {
      beforeEach(async () => {
        planner = new RoutePlanner()

        // Bob max-approves the permit2 contract to access his BOND and SAMB
        await permit2.approve(BOND.address, router.address, MAX_UINT160, DEADLINE)
        await permit2.approve(SAMB.address, router.address, MAX_UINT160, DEADLINE)
      })

      describe('Interleaving routes', () => {
        it('gas: CL, then Classic', async () => {
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
          // the tokens are already int he classic pair, so amountIn is 0
          planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [
            MSG_SENDER,
            0,
            classicAmountOutMin,
            classicTokens,
            SOURCE_MSG_SENDER,
          ])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: Classic, then CL', async () => {
          const classicTokens = [BOND.address, USDC.address]
          const clTokens = [USDC.address, SAMB.address]
          const classicAmountIn: BigNumber = expandTo18DecimalsBN(5)
          const classicAmountOutMin = 0 // doesnt matter how much USDC it is, what matters is the end of the trade
          const clAmountOutMin = expandTo18DecimalsBN(0.0005)

          planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [
            router.address,
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

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })
      })

      describe('Split routes', () => {
        it('gas: ERC20 --> ERC20 split Classic and Classic different routes, each two hop, with explicit permit', async () => {
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
          planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [
            MSG_SENDER,
            0,
            minAmountOut1,
            route1,
            SOURCE_MSG_SENDER,
          ])
          // 3) trade route2 and return tokens to bob
          planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [
            MSG_SENDER,
            0,
            minAmountOut2,
            route2,
            SOURCE_MSG_SENDER,
          ])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: ERC20 --> ERC20 split Classic and Classic different routes, each two hop, with explicit permit transfer from batch', async () => {
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
          planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [
            MSG_SENDER,
            0,
            minAmountOut1,
            route1,
            SOURCE_MSG_SENDER,
          ])
          // 3) trade route2 and return tokens to bob
          planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [
            MSG_SENDER,
            0,
            minAmountOut2,
            route2,
            SOURCE_MSG_SENDER,
          ])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: ERC20 --> ERC20 split Classic and Classic different routes, each two hop, without explicit permit', async () => {
          // this test is the same as the above test, but instead of a permit permit, separate permits within the 2 trades
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

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: ERC20 --> ERC20 split Classic and Classic different routes, different input tokens, each two hop, with batch permit', async () => {
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

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: ERC20 --> ERC20 split Classic and CL, one hop', async () => {
          const tokens = [BOND.address, SAMB.address]
          const classicAmountIn: BigNumber = expandTo18DecimalsBN(2)
          const clAmountIn: BigNumber = expandTo18DecimalsBN(3)

          // Classic trades BOND for USDC, sending the tokens back to the router for cl trade
          planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [
            router.address,
            classicAmountIn,
            0,
            tokens,
            SOURCE_MSG_SENDER,
          ])
          // CL trades USDC for SAMB, trading the whole balance, with a recipient of Alice
          planner.addCommand(CommandType.CL_SWAP_EXACT_IN, [
            router.address,
            clAmountIn,
            0,
            encodePathExactInput(tokens),
            SOURCE_MSG_SENDER,
          ])
          // aggregate slippate check
          planner.addCommand(CommandType.SWEEP, [SAMB.address, MSG_SENDER, expandTo18DecimalsBN(0.0005)])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: ERC20 --> ERC20 split Classic and CL, one hop, ADDRESS_THIS flag', async () => {
          const tokens = [BOND.address, SAMB.address]
          const classicAmountIn: BigNumber = expandTo18DecimalsBN(2)
          const clAmountIn: BigNumber = expandTo18DecimalsBN(3)

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
            router.address,
            clAmountIn,
            0,
            encodePathExactInput(tokens),
            SOURCE_MSG_SENDER,
          ])
          // aggregate slippate check
          planner.addCommand(CommandType.SWEEP, [SAMB.address, MSG_SENDER, expandTo18DecimalsBN(0.0005)])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: AMB --> ERC20 split Classic and CL, one hop', async () => {
          const tokens = [SAMB.address, USDC.address]
          const classicAmountIn: BigNumber = expandTo18DecimalsBN(2)
          const clAmountIn: BigNumber = expandTo18DecimalsBN(3)
          const value = classicAmountIn.add(clAmountIn)

          planner.addCommand(CommandType.WRAP_AMB, [ADDRESS_THIS, value])
          planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [
            router.address,
            classicAmountIn,
            0,
            tokens,
            SOURCE_ROUTER,
          ])
          planner.addCommand(CommandType.CL_SWAP_EXACT_IN, [
            router.address,
            clAmountIn,
            0,
            encodePathExactInput(tokens),
            SOURCE_ROUTER,
          ])
          // aggregate slippate check
          planner.addCommand(CommandType.SWEEP, [USDC.address, MSG_SENDER, 0.0005 * 10 ** 6])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value }))
        })

        it('gas: ERC20 --> AMB split Classic and CL, one hop', async () => {
          const tokens = [BOND.address, SAMB.address]
          const classicAmountIn: BigNumber = expandTo18DecimalsBN(20)
          const clAmountIn: BigNumber = expandTo18DecimalsBN(30)

          planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_IN, [
            router.address,
            classicAmountIn,
            0,
            tokens,
            SOURCE_MSG_SENDER,
          ])
          planner.addCommand(CommandType.CL_SWAP_EXACT_IN, [
            router.address,
            clAmountIn,
            0,
            encodePathExactInput(tokens),
            SOURCE_MSG_SENDER,
          ])
          // aggregate slippate check
          planner.addCommand(CommandType.UNWRAP_SAMB, [MSG_SENDER, expandTo18DecimalsBN(0.0005)])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: ERC20 --> AMB split Classic and CL, exactOut, one hop', async () => {
          const tokens = [BOND.address, SAMB.address]
          const classicAmountOut: BigNumber = expandTo18DecimalsBN(0.5)
          const clAmountOut: BigNumber = expandTo18DecimalsBN(1)
          const path = encodePathExactOutput(tokens)
          const maxAmountIn = expandTo18DecimalsBN(4000)
          const fullAmountOut = classicAmountOut.add(clAmountOut)

          planner.addCommand(CommandType.CLASSIC_SWAP_EXACT_OUT, [
            router.address,
            classicAmountOut,
            maxAmountIn,
            [BOND.address, SAMB.address],
            SOURCE_MSG_SENDER,
          ])
          planner.addCommand(CommandType.CL_SWAP_EXACT_OUT, [
            router.address,
            clAmountOut,
            maxAmountIn,
            path,
            SOURCE_MSG_SENDER,
          ])
          // aggregate slippate check
          planner.addCommand(CommandType.UNWRAP_SAMB, [MSG_SENDER, fullAmountOut])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })
      })

      describe('Batch reverts', () => {
        let subplan: RoutePlanner
        const planOneTokens = [BOND.address, SAMB.address]
        const planTwoTokens = [USDC.address, SAMB.address]
        const planOneClassicAmountIn: BigNumber = expandTo18DecimalsBN(2)
        const planOneCLAmountIn: BigNumber = expandTo18DecimalsBN(3)
        const planTwoCLAmountIn = expandTo6DecimalsBN(5)

        beforeEach(async () => {
          subplan = new RoutePlanner()
        })

        it('gas: 2 sub-plans, neither fails', async () => {
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

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: 2 sub-plans, the first fails', async () => {
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

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: 2 sub-plans, both fail but the transaction succeeds', async () => {
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

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: 2 sub-plans, second sub plan fails', async () => {
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

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })
      })
    })
  })
})
