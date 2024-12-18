// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import {DeployUniversalRouter} from '../DeployUniversalRouter.s.sol';
import {RouterParameters} from 'contracts/base/RouterImmutables.sol';

contract DeployAirdaoTest is DeployUniversalRouter {
    function setUp() public override {
        params = RouterParameters({
            permit2: 0x2B75bF9B8ec5966832c123bc24Db3a283E3C1be4, // Recheck
            samb: 0x2Cf845b49e1c4E5D657fbBF36E97B7B5B7B7b74b,
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
            clFactory: 0xCD1C424a67ea5a1EfD9593E0230F26e0F5Cd0045,
            pairInitCodeHash: 0x890f57556fe54f67a74a243b39a055a4ad13602f405bfc7607a203a81592f64e,
            poolInitCodeHash: 0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54
        });

        unsupported = 0xc3d3a94A6A29FCBC1cf86B8264AAA933B96bb5A7;
    }
}
