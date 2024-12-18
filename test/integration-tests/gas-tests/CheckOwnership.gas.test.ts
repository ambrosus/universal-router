import { CommandType, RoutePlanner } from './../shared/planner'
import { Permit2, UniversalRouter } from '../../../typechain'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import { resetFork, USDC } from '../shared/testnetForkHelpers'
import { ALICE_ADDRESS, DEADLINE } from './../shared/constants'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import deployUniversalRouter, { deployPermit2 } from './../shared/deployUniversalRouter'
import { abi as TOKEN_ABI } from '../../../artifacts/solmate/src/tokens/ERC20.sol/ERC20.json'
const { ethers } = hre

describe('Check Ownership Gas', () => {
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

  it('gas: balance check ERC20', async () => {
    const usdcContract = new ethers.Contract(USDC.address, TOKEN_ABI, alice)
    const aliceUSDCBalance = await usdcContract.balanceOf(ALICE_ADDRESS)

    planner.addCommand(CommandType.BALANCE_CHECK_ERC20, [ALICE_ADDRESS, USDC.address, aliceUSDCBalance])

    const { commands, inputs } = planner
    await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
  })
})
