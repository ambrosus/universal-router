import JSBI from 'jsbi'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { BigintIsh, CurrencyAmount, Token } from 'astra-sdk-core'
import { Pair } from 'astra-classic-sdk'
import { encodeSqrtRatioX96, FeeAmount, nearestUsableTick, Pool, TickMath, TICK_SPACINGS } from 'astra-cl-sdk-dev'
import { getClassicPoolReserves, SAMB, KOS, USDC, BOND } from './testnetForkHelpers'
import { BigNumber } from 'ethers'

const feeAmount = FeeAmount.MEDIUM
const sqrtRatioX96 = encodeSqrtRatioX96(1, 1)
const liquidity = 1_000_000

// cl
export const makePool = (token0: Token, token1: Token, liquidity: number) => {
  return new Pool(token0, token1, feeAmount, sqrtRatioX96, liquidity, TickMath.getTickAtSqrtRatio(sqrtRatioX96), [
    {
      index: nearestUsableTick(TickMath.MIN_TICK, TICK_SPACINGS[feeAmount]),
      liquidityNet: liquidity,
      liquidityGross: liquidity,
    },
    {
      index: nearestUsableTick(TickMath.MAX_TICK, TICK_SPACINGS[feeAmount]),
      liquidityNet: -liquidity,
      liquidityGross: liquidity,
    },
  ])
}

export const pool_BOND_SAMB = makePool(BOND, SAMB, liquidity)
export const pool_BOND_USDC = makePool(USDC, BOND, liquidity)
export const pool_USDC_SAMB = makePool(USDC, SAMB, liquidity)
export const pool_USDC_KOS = makePool(USDC, KOS, liquidity)
export const pool_SAMB_KOS = makePool(KOS, SAMB, liquidity)

// classic
export const makePair = async (alice: SignerWithAddress, token0: Token, token1: Token) => {
  const reserves = await getClassicPoolReserves(alice, token0, token1)
  let reserve0: CurrencyAmount<Token> = CurrencyAmount.fromRawAmount(token0, JSBI.BigInt(reserves.reserve0))
  let reserve1: CurrencyAmount<Token> = CurrencyAmount.fromRawAmount(token1, JSBI.BigInt(reserves.reserve1))

  return new Pair(reserve0, reserve1)
}

const FEE_SIZE = 3

// cl
export function encodePath(path: string[], fees: FeeAmount[]): string {
  if (path.length != fees.length + 1) {
    throw new Error('path/fee lengths do not match')
  }

  let encoded = '0x'
  for (let i = 0; i < fees.length; i++) {
    // 20 byte encoding of the address
    encoded += path[i].slice(2)
    // 3 byte encoding of the fee
    encoded += fees[i].toString(16).padStart(2 * FEE_SIZE, '0')
  }
  // encode the final token
  encoded += path[path.length - 1].slice(2)

  return encoded.toLowerCase()
}

export function expandTo18Decimals(n: number): BigintIsh {
  return JSBI.BigInt(BigNumber.from(n).mul(BigNumber.from(10).pow(18)).toString())
}
