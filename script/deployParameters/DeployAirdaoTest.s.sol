// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import {DeployUniversalRouter} from '../DeployUniversalRouter.s.sol';
import {RouterParameters} from 'contracts/base/RouterImmutables.sol';

contract DeployAirdaoTest is DeployUniversalRouter {
    function setUp() public override {
        params = RouterParameters({
            permit2: 0x2B75bF9B8ec5966832c123bc24Db3a283E3C1be4, // Recheck
            samb: 0x8D3e03889bFCb859B2dBEB65C60a52Ad9523512c,
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
            classicFactory: 0x7bf4227eDfAA6823aD577dc198DbCadECccbEb07,
            clFactory: 0x4d82626CB6B92d1583cb3c7Ad85b76c6009Aa2AD,
            pairInitCodeHash: 0x890f57556fe54f67a74a243b39a055a4ad13602f405bfc7607a203a81592f64e,
            poolInitCodeHash: 0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54
        });

        unsupported = 0x0000000000000000000000000000000000000000;
    }
}
