import { ERC721, ERC1155, ERC20, ERC20__factory } from '../../../typechain'
import { abi as ERC721_ABI } from '../../../artifacts/solmate/src/tokens/ERC721.sol/ERC721.json'
import { abi as ERC1155_ABI } from '../../../artifacts/solmate/src/tokens/ERC1155.sol/ERC1155.json'
import CRYPTOPUNKS_ABI from './abis/Cryptopunks.json'
import {
  ALPHABETTIES_ADDRESS,
  CAMEO_ADDRESS,
  COVEN_ADDRESS,
  ENS_NFT_ADDRESS,
  MENTAL_WORLDS_ADDRESS,
  TWERKY_ADDRESS,
  CRYPTOPUNKS_MARKET_ADDRESS,
  DECENTRA_DRAGON_ADDRESS,
  TOWNSTAR_ADDRESS,
  MILADY_ADDRESS,
} from './constants'
// TODO: use imports from @airdao scoped contracts
import { abi as CLASSIC_PAIR_ABI } from '@airdao/astra-contracts/artifacts/contracts/core/interfaces/IAstraPair.sol/IAstraPair.json'
import { Currency, Token, WETH9 } from '@uniswap/sdk-core'
import { TransactionResponse } from '@ethersproject/abstract-provider'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { BigNumber, constants } from 'ethers'
import hre from 'hardhat'
import { MethodParameters } from '@uniswap/v3-sdk'
import { Pair } from '@uniswap/v2-sdk'
const { ethers } = hre

const SAMBList = {
  16718: new Token(16718, '0x2b2d892C3fe2b4113dd7aC0D2c1882AF202FB28F', 18, 'SAMB', 'SAMB'),
}

export const SAMB = SAMBList[16718]
export const BOND = new Token(16718, '0x096B5914C95C34Df19500DAff77470C845EC749D', 18, 'BOND', 'Bond coin')
export const USDC = new Token(16718, '0xFF9F502976E7bD2b4901aD7Dd1131Bb81E5567de', 18, 'USDC', 'USD//C')
export const AST = new Token(16718, '0xE874AeD7D9827b7d886FB19719730c7F87204153', 18, 'AST', 'Astra Token')
export const KOS = new Token(16718, '0xC15891E4dE2793726c20F53EcA6FB6319968E5F3', 18, 'KOS', 'Kosmos Token')
export const SWAP_ROUTER_CLASSIC = '0xf7237C595425b49Eaeb3Dc930644de6DCa09c3C4'
export const CLASSIC_FACTORY = 0x2b6852cedef193ece9814ee99be4a4df7f463557

export const approveSwapRouter02 = async (
  alice: SignerWithAddress,
  currency: Currency,
  overrideSwapRouter02Address?: string
) => {
  if (currency.isToken) {
    const aliceTokenIn: ERC20 = ERC20__factory.connect(currency.address, alice)

    if (currency.symbol == 'USDT') {
      await(await aliceTokenIn.approve(overrideSwapRouter02Address ?? SWAP_ROUTER_CLASSIC, 0)).wait()
    }

    return await(
      await aliceTokenIn.approve(overrideSwapRouter02Address ?? SWAP_ROUTER_CLASSIC, constants.MaxUint256)
    ).wait()
  }
}

type Reserves = {
  reserve0: BigNumber
  reserve1: BigNumber
}

export const getV2PoolReserves = async (alice: SignerWithAddress, tokenA: Token, tokenB: Token): Promise<Reserves> => {
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
    gasPrice: BigNumber.from(2000000000000),
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
    gasPrice: BigNumber.from(2000000000000),
    type: 1,
  }

  const transactionResponse = await alice.sendTransaction(transaction)
  return transactionResponse
}

export const resetFork = async (block: number = 15360000) => {
  await hre.network.provider.request({
    method: 'hardhat_reset',
    params: [
      {
        forking: {
          jsonRpcUrl: `https://network-archive.ambrosus.io`,
          blockNumber: block,
        },
      },
    ],
  })
}

export const COVEN_721 = new ethers.Contract(COVEN_ADDRESS, ERC721_ABI) as ERC721
export const DRAGON_721 = new ethers.Contract(DECENTRA_DRAGON_ADDRESS, ERC721_ABI) as ERC721
export const MILADY_721 = new ethers.Contract(MILADY_ADDRESS, ERC721_ABI) as ERC721
export const ENS_721 = new ethers.Contract(ENS_NFT_ADDRESS, ERC721_ABI) as ERC721
export const MENTAL_WORLDS_721 = new ethers.Contract(MENTAL_WORLDS_ADDRESS, ERC721_ABI) as ERC721
export const ALPHABETTIES_721 = new ethers.Contract(ALPHABETTIES_ADDRESS, ERC721_ABI) as ERC721
export const TWERKY_1155 = new ethers.Contract(TWERKY_ADDRESS, ERC1155_ABI) as ERC1155
export const CAMEO_1155 = new ethers.Contract(CAMEO_ADDRESS, ERC1155_ABI) as ERC1155
export const TOWNSTAR_1155 = new ethers.Contract(TOWNSTAR_ADDRESS, ERC1155_ABI) as ERC1155
export const CRYPTOPUNKS_MARKET = new ethers.Contract(CRYPTOPUNKS_MARKET_ADDRESS, CRYPTOPUNKS_ABI)
