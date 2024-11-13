// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import 'forge-std/Test.sol';
import {ERC20} from 'solmate/src/tokens/ERC20.sol';
import {AstraClassicTest} from '../AstraClassic.t.sol';

contract ClassicSambUsdc is AstraClassicTest {
    ERC20 constant USDC = ERC20(0xFF9F502976E7bD2b4901aD7Dd1131Bb81E5567de);

    function token0() internal pure override returns (address) {
        return address(USDC);
    }

    function token1() internal pure override returns (address) {
        return address(SAMB);
    }
}
