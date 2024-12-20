// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.17;

import {IAstraPair} from '@airdao/astra-contracts/contracts/core/interfaces/IAstraPair.sol';
import {AstraClassicLibrary} from './AstraClassicLibrary.sol';
import {RouterImmutables} from '../../../base/RouterImmutables.sol';
import {Payments} from '../../Payments.sol';
import {Permit2Payments} from '../../Permit2Payments.sol';
import {Constants} from '../../../libraries/Constants.sol';
import {ERC20} from 'solmate/src/tokens/ERC20.sol';

/// @title Router for Astra Classic Trades
abstract contract ClassicSwapRouter is RouterImmutables, Permit2Payments {
    error ClassicTooLittleReceived();
    error ClassicTooMuchRequested();
    error ClassicInvalidPath();

    function _classicSwap(address[] calldata path, address recipient, address pair) private {
        unchecked {
            if (path.length < 2) revert ClassicInvalidPath();

            // cached to save on duplicate operations
            (address token0,) = AstraClassicLibrary.sortTokens(path[0], path[1]);
            uint256 finalPairIndex = path.length - 1;
            uint256 penultimatePairIndex = finalPairIndex - 1;
            for (uint256 i; i < finalPairIndex; i++) {
                (address input, address output) = (path[i], path[i + 1]);
                (uint256 reserve0, uint256 reserve1,) = IAstraPair(pair).getReserves();
                (uint256 reserveInput, uint256 reserveOutput) =
                    input == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
                uint256 amountInput = ERC20(input).balanceOf(pair) - reserveInput;
                uint256 amountOutput = AstraClassicLibrary.getAmountOut(amountInput, reserveInput, reserveOutput);
                (uint256 amount0Out, uint256 amount1Out) =
                    input == token0 ? (uint256(0), amountOutput) : (amountOutput, uint256(0));
                address nextPair;
                (nextPair, token0) = i < penultimatePairIndex
                    ? AstraClassicLibrary.pairAndToken0For(
                        ASTRA_CLASSIC_FACTORY, ASTRA_CLASSIC_PAIR_INIT_CODE_HASH, output, path[i + 2]
                    )
                    : (recipient, address(0));
                IAstraPair(pair).swap(amount0Out, amount1Out, nextPair, new bytes(0));
                pair = nextPair;
            }
        }
    }

    /// @notice Performs a Astra Classic exact input swap
    /// @param recipient The recipient of the output tokens
    /// @param amountIn The amount of input tokens for the trade
    /// @param amountOutMinimum The minimum desired amount of output tokens
    /// @param path The path of the trade as an array of token addresses
    /// @param payer The address that will be paying the input
    function classicSwapExactInput(
        address recipient,
        uint256 amountIn,
        uint256 amountOutMinimum,
        address[] calldata path,
        address payer
    ) internal {
        address firstPair =
            AstraClassicLibrary.pairFor(ASTRA_CLASSIC_FACTORY, ASTRA_CLASSIC_PAIR_INIT_CODE_HASH, path[0], path[1]);
        if (
            amountIn != Constants.ALREADY_PAID // amountIn of 0 to signal that the pair already has the tokens
        ) {
            payOrPermit2Transfer(path[0], payer, firstPair, amountIn);
        }

        ERC20 tokenOut = ERC20(path[path.length - 1]);
        uint256 balanceBefore = tokenOut.balanceOf(recipient);

        _classicSwap(path, recipient, firstPair);

        uint256 amountOut = tokenOut.balanceOf(recipient) - balanceBefore;
        if (amountOut < amountOutMinimum) revert ClassicTooLittleReceived();
    }

    /// @notice Performs a Astra Classic exact output swap
    /// @param recipient The recipient of the output tokens
    /// @param amountOut The amount of output tokens to receive for the trade
    /// @param amountInMaximum The maximum desired amount of input tokens
    /// @param path The path of the trade as an array of token addresses
    /// @param payer The address that will be paying the input
    function classicSwapExactOutput(
        address recipient,
        uint256 amountOut,
        uint256 amountInMaximum,
        address[] calldata path,
        address payer
    ) internal {
        (uint256 amountIn, address firstPair) = AstraClassicLibrary.getAmountInMultihop(
            ASTRA_CLASSIC_FACTORY, ASTRA_CLASSIC_PAIR_INIT_CODE_HASH, amountOut, path
        );
        if (amountIn > amountInMaximum) revert ClassicTooMuchRequested();

        payOrPermit2Transfer(path[0], payer, firstPair, amountIn);
        _classicSwap(path, recipient, firstPair);
    }
}