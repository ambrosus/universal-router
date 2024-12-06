import { ERC721, ERC1155, ERC20, ERC20__factory, MintableERC20__factory } from '../../../typechain'
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
import { Currency, Token, SAMB as SAMBT } from '@airdao/astra-sdk-core'
import { TransactionResponse } from '@ethersproject/abstract-provider'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { BigNumber, constants } from 'ethers'
import hre from 'hardhat'
import { MethodParameters } from '@airdao/astra-cl-sdk'
import { Pair } from '@airdao/astra-classic-sdk'
const { ethers } = hre

export const SAMB = SAMBT[22040]
export const BOND = new Token(22040, '0x765e3e03f8dfca312EfdAb378e386E1EA60ee93F', 18, 'BOND', 'Bond coin')
export const USDC = new Token(22040, '0xdd82283Fc93Aa4373B6B27a7B25EB3A770fc3aba', 18, 'USDC', 'USD//C')
export const AST = new Token(22040, '0x24f3811961685888c7a1966cAec194e5444bfC0D', 18, 'AST', 'Astra Token')
export const KOS = new Token(22040, '0xAedD2bf3Aa338088C5024f5A92bBc708C0073BF0', 18, 'KOS', 'Kosmos Token')
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

export const resetFork = async (block: number = 2765038) => {
  await hre.network.provider.request({
    method: 'hardhat_reset',
    params: [
      {
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
