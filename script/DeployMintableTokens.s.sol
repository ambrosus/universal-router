// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import 'forge-std/console2.sol';
import 'forge-std/Script.sol';
import {ERC20PresetMinterPauser} from '@openzeppelin/contracts/token/ERC20/presets/ERC20PresetMinterPauser.sol';

contract DeployMintableTokens is Script {
    uint256 public amount;

    // set values for params and unsupported
    function setUp() public {
        amount = 150_000_000 ether;
    }

    function run() public {
        vm.startBroadcast();

        ERC20PresetMinterPauser test1 = new ERC20PresetMinterPauser('Test1', 'TEST1');
        console2.log('Test1 Deployed to: %s', address(test1));
        ERC20PresetMinterPauser test2 = new ERC20PresetMinterPauser('Test2', 'TEST2');
        console2.log('Test2 Deployed to: %s', address(test2));
        ERC20PresetMinterPauser test3 = new ERC20PresetMinterPauser('Test3', 'TEST3');
        console2.log('Test3 Deployed to: %s', address(test3));

        test1.mint(msg.sender, amount);
        console2.log('Test1 mintedAmount: %s', amount / 10 ** 18);
        test2.mint(msg.sender, amount);
        console2.log('Test2 mintedAmount: %s', amount / 10 ** 18);
        test3.mint(msg.sender, amount);
        console2.log('Test3 mintedAmount: %s', amount / 10 ** 18);

        vm.stopBroadcast();
    }
}
