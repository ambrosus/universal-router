// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import 'forge-std/Test.sol';
import {ERC20} from 'solmate/src/tokens/ERC20.sol';
import {AstraClassicTest} from '../AstraClassic.t.sol';

contract ClassicBondSamb is AstraClassicTest {
    ERC20 constant BOND = ERC20(0xf2d8C5D1a7B4fAaf5Fd81e4CE14DbD3d0fEb70a9);

    function token0() internal pure override returns (address) {
        return address(SAMB);
    }

    function token1() internal pure override returns (address) {
        return address(BOND);
    }
}
