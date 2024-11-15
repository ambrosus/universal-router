// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import {DeployUniversalRouter} from '../DeployUniversalRouter.s.sol';
import {RouterParameters} from 'contracts/base/RouterImmutables.sol';

contract DeployAirdaoMain is DeployUniversalRouter {
    function setUp() public override {
        params = RouterParameters({
            permit2: address(0), // Recheck
            samb: 0x2b2d892C3fe2b4113dd7aC0D2c1882AF202FB28F,
            seaportV1_5: UNSUPPORTED_PROTOCOL,
            seaportV1_4: UNSUPPORTED_PROTOCOL,
            openseaConduit: UNSUPPORTED_PROTOCOL,
            nftxZap: UNSUPPORTED_PROTOCOL,
            x2y2: UNSUPPORTED_PROTOCOL,
            foundation: UNSUPPORTED_PROTOCOL,
            sudoswap: UNSUPPORTED_PROTOCOL,
            elementMarket: UNSUPPORTED_PROTOCOL,
            nft20Zap: UNSUPPORTED_PROTOCOL,
            cryptopunks: UNSUPPORTED_PROTOCOL,
            looksRareV2: UNSUPPORTED_PROTOCOL,
            routerRewardsDistributor: UNSUPPORTED_PROTOCOL,
            looksRareRewardsDistributor: UNSUPPORTED_PROTOCOL,
            looksRareToken: UNSUPPORTED_PROTOCOL,
            classicFactory:0x2b6852CeDEF193ece9814Ee99BE4A4Df7F463557,
            clFactory: address(0), // add after deployment
            pairInitCodeHash: 0x400e13fc6c59224f20228f0c0561806856ac34b7318f337f8012707c880c351f,
            poolInitCodeHash: 0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54 // recheck
        });

        unsupported = 0x0000000000000000000000000000000000000000;
    }
}
