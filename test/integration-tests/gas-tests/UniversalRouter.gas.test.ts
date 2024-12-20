import { UniversalRouter, Permit2, ISAMB, ERC20, MintableERC20__factory, ISAMB__factory } from '../../../typechain'
import { expect } from '../shared/expect'
import { ALICE_ADDRESS, ADDRESS_THIS, DEADLINE, MAX_UINT, MAX_UINT160, SOURCE_MSG_SENDER } from '../shared/constants'
import { abi as TOKEN_ABI } from '../../../artifacts/solmate/src/tokens/ERC20.sol/ERC20.json'
import { abi as SAMB_ABI } from '../../../artifacts/contracts/interfaces/external/ISAMB.sol/ISAMB.json'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import { resetFork, SAMB, BOND } from '../shared/testnetForkHelpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import { expandTo18DecimalsBN } from '../shared/helpers'
import deployUniversalRouter, { deployPermit2 } from '../shared/deployUniversalRouter'
import { RoutePlanner, CommandType } from '../shared/planner'
import { BigNumber } from 'ethers'
import { Token } from '@airdao/astra-sdk-core'

const { ethers } = hre

describe('UniversalRouter Gas Tests', () => {
  let alice: SignerWithAddress
  let planner: RoutePlanner
  let router: UniversalRouter
  let permit2: Permit2
  let bondContract: ERC20
  let sambContract: ISAMB

  async function deployMintableToken(name: string, symbol: string, signer: SignerWithAddress): Promise<Token> {
    const token = await new MintableERC20__factory(signer).deploy(
      name,
      symbol,
      BigNumber.from(10).pow(18).mul('1000000000000000000')
    )
    return new Token(22040, token.address, 18, name, symbol)
  }

  beforeEach(async () => {
    await resetFork()
    alice = await ethers.getSigner(ALICE_ADDRESS)
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    await hre.network.provider.request({
      method: 'hardhat_setBalance',
      params: [ALICE_ADDRESS, '0x10000000000000000000000'],
    })
    const BOND = await deployMintableToken('Bond', 'BOND', alice)
    await (await ISAMB__factory.connect(SAMB.address, alice).deposit({ value: expandTo18DecimalsBN(1000) })).wait()
    bondContract = new ethers.Contract(BOND.address, TOKEN_ABI, alice) as ERC20
    sambContract = new ethers.Contract(SAMB.address, SAMB_ABI, alice) as ISAMB
    permit2 = (await deployPermit2()).connect(alice) as Permit2
    router = (await deployUniversalRouter(permit2)).connect(alice) as UniversalRouter
    planner = new RoutePlanner()
  })

  it('gas: bytecode size', async () => {
    expect(((await router.provider.getCode(router.address)).length - 2) / 2).to.matchSnapshot()
  })
})
