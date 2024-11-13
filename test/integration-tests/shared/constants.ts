import hre from 'hardhat'
const { ethers } = hre

// Router Helpers
export const MAX_UINT = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
export const MAX_UINT160 = '0xffffffffffffffffffffffffffffffffffffffff'
export const DEADLINE = 2000000000
export const CONTRACT_BALANCE = '0x8000000000000000000000000000000000000000000000000000000000000000'
export const ALREADY_PAID = 0
export const ALICE_ADDRESS = '0x28c6c06298d514db089934071355e5743bf21d60'
export const AMB_ADDRESS = ethers.constants.AddressZero
export const ZERO_ADDRESS = ethers.constants.AddressZero
export const ONE_PERCENT_BIPS = 100
export const MSG_SENDER: string = '0x0000000000000000000000000000000000000001'
export const ADDRESS_THIS: string = '0x0000000000000000000000000000000000000002'
export const SOURCE_MSG_SENDER: boolean = true
export const SOURCE_ROUTER: boolean = false

// Protocol Data
export const OPENSEA_CONDUIT = '0x1E0049783F008A0085193E00003D00cd54003c71'
export const OPENSEA_CONDUIT_KEY = '0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000'

// NFT Addresses
export const COVEN_ADDRESS = '0x5180db8f5c931aae63c74266b211f580155ecac8'
export const DECENTRA_DRAGON_ADDRESS = '0xAA107cCFe230a29C345Fd97bc6eb9Bd2fccD0750'
export const TOWNSTAR_ADDRESS = '0xc36cF0cFcb5d905B8B513860dB0CFE63F6Cf9F5c'
export const TWERKY_ADDRESS = '0xf4680c917a873e2dd6ead72f9f433e74eb9c623c'
export const MILADY_ADDRESS = '0x5af0d9827e0c53e4799bb226655a1de152a425a5'
export const ALPHABETTIES_ADDRESS = '0x6d05064fe99e40f1c3464e7310a23ffaded56e20'
export const MENTAL_WORLDS_ADDRESS = '0xEf96021Af16BD04918b0d87cE045d7984ad6c38c'
export const CAMEO_ADDRESS = '0x93317E87a3a47821803CAADC54Ae418Af80603DA'
export const ENS_NFT_ADDRESS = '0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85'
export const CRYPTOPUNKS_MARKET_ADDRESS = '0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB'
export const NFTX_COVEN_VAULT = '0xd89b16331f39ab3878daf395052851d3ac8cf3cd'
export const NFTX_COVEN_VAULT_ID = '333'
export const NFTX_MILADY_VAULT = '0x227c7df69d3ed1ae7574a1a7685fded90292eb48'
export const NFTX_MILADY_VAULT_ID = '392'
export const NFTX_ERC_1155_VAULT = '0x78e09c5ec42d505742a52fd10078a57ea186002a'
export const NFTX_ERC_1155_VAULT_ID = '61'

// Constructor Params
export const CLASSIC_FACTORY_MAINNET = '0x2b6852CeDEF193ece9814Ee99BE4A4Df7F463557'
export const CL_FACTORY_MAINNET = '0x1F98431c8aD98523631AE4a59f267346ea31F984'
export const CL_INIT_CODE_HASH_MAINNET = '0x203c8ec649b23b7faf9b73ccadfb1a67af52a097119c82801f4947ec5deb6c04'
export const CLASSIC_INIT_CODE_HASH_MAINNET = '0x400e13fc6c59224f20228f0c0561806856ac34b7318f337f8012707c880c351f'

export const ROUTER_REWARDS_DISTRIBUTOR = '0x0000000000000000000000000000000000000000'
export const LOOKSRARE_REWARDS_DISTRIBUTOR = '0x0554f068365eD43dcC98dcd7Fd7A8208a5638C72'
export const LOOKSRARE_TOKEN = '0xf4d2888d29D722226FafA5d9B24F9164c092421E'
