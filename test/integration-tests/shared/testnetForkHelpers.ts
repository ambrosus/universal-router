import { ERC20, ERC20__factory } from '../../../typechain'
// TODO: use imports from @airdao scoped contracts
import { abi as CLASSIC_PAIR_ABI } from '@airdao/astra-contracts/artifacts/contracts/core/interfaces/IAstraPair.sol/IAstraPair.json'
import { Currency, Token, SAMB as SAMBT } from 'astra-sdk-core'
import { TransactionResponse } from '@ethersproject/abstract-provider'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { BigNumber, constants } from 'ethers'
import hre from 'hardhat'
import { MethodParameters } from 'astra-cl-sdk-dev'
import { Pair } from 'astra-classic-sdk'
const { ethers } = hre

export const SAMB = SAMBT[22040]
export const BOND = new Token(22040, '0xf2d8C5D1a7B4fAaf5Fd81e4CE14DbD3d0fEb70a9', 18, 'BOND', 'Bond coin')
export const USDC = new Token(22040, '0x561f21226fAA48224336Da90A500b6abA9D73694', 18, 'USDC', 'USD//C')
export const KOS = new Token(22040, '0x51647f3659638e9458cE934C666DAd3ede59cb5E', 18, 'KOS', 'Kosmos Token')
export const SWAP_ROUTER_CLASSIC = '0xA3E524dFc9deA66aE32e81a5E2B4DF24F56e2CBc '
export const CLASSIC_FACTORY = 0x7bf4227edfaa6823ad577dc198dbcadecccbeb07

export const approveSwapRouter02 = async (
  alice: SignerWithAddress,
  currency: Currency,
  overrideSwapRouter02Address?: string
) => {
  if (currency.isToken) {
    const aliceTokenIn: ERC20 = ERC20__factory.connect(currency.address, alice)

    if (currency.symbol == 'KOS') {
      await (await aliceTokenIn.approve(overrideSwapRouter02Address ?? SWAP_ROUTER_CLASSIC, 0)).wait()
    }

    return await (
      await aliceTokenIn.approve(overrideSwapRouter02Address ?? SWAP_ROUTER_CLASSIC, constants.MaxUint256)
    ).wait()
  }
}

type Reserves = {
  reserve0: BigNumber
  reserve1: BigNumber
}

export const getClassicPoolReserves = async (
  alice: SignerWithAddress,
  tokenA: Token,
  tokenB: Token
): Promise<Reserves> => {
  const contractAddress = Pair.getAddress(tokenA, tokenB)
  const contract = new ethers.Contract(contractAddress, CLASSIC_PAIR_ABI, alice)

  const { reserve0, reserve1 } = await contract.getReserves()
  return { reserve0, reserve1 }
}

export const approveAndExecuteSwapRouter02 = async (
  methodParameters: MethodParameters,
  tokenIn: Currency,
  tokenOut: Currency,
  alice: SignerWithAddress
): Promise<TransactionResponse> => {
  if (tokenIn.symbol == tokenOut.symbol) throw 'Cannot trade token for itself'
  await approveSwapRouter02(alice, tokenIn)

  const transaction = {
    data: methodParameters.calldata,
    to: SWAP_ROUTER_CLASSIC,
    value: BigNumber.from(methodParameters.value),
    from: alice.address,
    gasPrice: 0, //BigNumber.from(2000000000000),
    type: 1,
  }

  const transactionResponse = await alice.sendTransaction(transaction)
  return transactionResponse
}

export const executeSwapRouter02Swap = async (
  methodParameters: MethodParameters,
  alice: SignerWithAddress
): Promise<TransactionResponse> => {
  const transaction = {
    data: methodParameters.calldata,
    to: SWAP_ROUTER_CLASSIC,
    value: BigNumber.from(methodParameters.value),
    from: alice.address,
    gasPrice: 0, // BigNumber.from(2000000000000),
    type: 1,
  }

  const transactionResponse = await alice.sendTransaction(transaction)
  return transactionResponse
}

export const resetFork = async (block: number = 2811484) => {
  await hre.network.provider.request({
    method: 'hardhat_reset',
    params: [
      {
        gasMultiplier: 2,
        gasPrice: 0,
        initialBaseFeePerGas: 0,
        forking: {
          jsonRpcUrl: `https://network-archive.ambrosus-test.io`,
          blockNumber: block,
          chains: {
            22040: {
              istanbul: 2760000,
            },
          },
        },
      },
    ],
  })
}
