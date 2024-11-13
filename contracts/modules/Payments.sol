// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.17;

import {Constants} from '../libraries/Constants.sol';
import {RouterImmutables} from '../base/RouterImmutables.sol';
import {SafeTransferLib} from 'solmate/src/utils/SafeTransferLib.sol';
import {ERC20} from 'solmate/src/tokens/ERC20.sol';
import {ERC721} from 'solmate/src/tokens/ERC721.sol';
import {ERC1155} from 'solmate/src/tokens/ERC1155.sol';

/// @title Payments contract
/// @notice Performs various operations around the payment of ETH and tokens
abstract contract Payments is RouterImmutables {
    using SafeTransferLib for ERC20;
    using SafeTransferLib for address;

    error InsufficientToken();
    error InsufficientAMB();
    error InvalidBips();
    error InvalidSpender();

    uint256 internal constant FEE_BIPS_BASE = 10_000;

    /// @notice Pays an amount of ETH or ERC20 to a recipient
    /// @param token The token to pay (can be ETH using Constants.ETH)
    /// @param recipient The address that will receive the payment
    /// @param value The amount to pay
    function pay(address token, address recipient, uint256 value) internal {
        if (token == Constants.AMB) {
            recipient.safeTransferETH(value);
        } else {
            if (value == Constants.CONTRACT_BALANCE) {
                value = ERC20(token).balanceOf(address(this));
            }

            ERC20(token).safeTransfer(recipient, value);
        }
    }

    /// @notice Approves a protocol to spend ERC20s in the router
    /// @param token The token to approve
    /// @param spender Which protocol to approve
    function approveERC20(ERC20 token, Spenders spender) internal {
        // check spender is one of our approved spenders
        address spenderAddress;
        /// @dev use 0 = Opensea Conduit for both Seaport v1.4 and v1.5
        if (spender == Spenders.OSConduit) spenderAddress = OPENSEA_CONDUIT;
        else if (spender == Spenders.Sudoswap) spenderAddress = SUDOSWAP;
        else revert InvalidSpender();

        // set approval
        token.safeApprove(spenderAddress, type(uint256).max);
    }

    /// @notice Pays a proportion of the contract's AMB or ERC20 to a recipient
    /// @param token The token to pay (can be AMB using Constants.AMB)
    /// @param recipient The address that will receive payment
    /// @param bips Portion in bips of whole balance of the contract
    function payPortion(address token, address recipient, uint256 bips) internal {
        if (bips == 0 || bips > FEE_BIPS_BASE) revert InvalidBips();
        if (token == Constants.AMB) {
            uint256 balance = address(this).balance;
            uint256 amount = (balance * bips) / FEE_BIPS_BASE;
            recipient.safeTransferETH(amount);
        } else {
            uint256 balance = ERC20(token).balanceOf(address(this));
            uint256 amount = (balance * bips) / FEE_BIPS_BASE;
            ERC20(token).safeTransfer(recipient, amount);
        }
    }

    /// @notice Sweeps all of the contract's ERC20 or AMB to an address
    /// @param token The token to sweep (can be AMB using Constants.AMB)
    /// @param recipient The address that will receive payment
    /// @param amountMinimum The minimum desired amount
    function sweep(address token, address recipient, uint256 amountMinimum) internal {
        uint256 balance;
        if (token == Constants.AMB) {
            balance = address(this).balance;
            if (balance < amountMinimum) revert InsufficientAMB();
            if (balance > 0) recipient.safeTransferETH(balance);
        } else {
            balance = ERC20(token).balanceOf(address(this));
            if (balance < amountMinimum) revert InsufficientToken();
            if (balance > 0) ERC20(token).safeTransfer(recipient, balance);
        }
    }

    /// @notice Sweeps an ERC721 to a recipient from the contract
    /// @param token The ERC721 token to sweep
    /// @param recipient The address that will receive payment
    /// @param id The ID of the ERC721 to sweep
    function sweepERC721(address token, address recipient, uint256 id) internal {
        ERC721(token).safeTransferFrom(address(this), recipient, id);
    }

    /// @notice Sweeps all of the contract's ERC1155 to an address
    /// @param token The ERC1155 token to sweep
    /// @param recipient The address that will receive payment
    /// @param id The ID of the ERC1155 to sweep
    /// @param amountMinimum The minimum desired amount
    function sweepERC1155(address token, address recipient, uint256 id, uint256 amountMinimum) internal {
        uint256 balance = ERC1155(token).balanceOf(address(this), id);
        if (balance < amountMinimum) revert InsufficientToken();
        ERC1155(token).safeTransferFrom(address(this), recipient, id, balance, bytes(''));
    }

    /// @notice Wraps an amount of AMB into SAMB
    /// @param recipient The recipient of the SAMB
    /// @param amount The amount to wrap (can be CONTRACT_BALANCE)
    function wrapAMB(address recipient, uint256 amount) internal {
        if (amount == Constants.CONTRACT_BALANCE) {
            amount = address(this).balance;
        } else if (amount > address(this).balance) {
            revert InsufficientAMB();
        }
        if (amount > 0) {
            SAMB.deposit{value: amount}();
            if (recipient != address(this)) {
                SAMB.transfer(recipient, amount);
            }
        }
    }

    /// @notice Unwraps all of the contract's SAMB into AMB
    /// @param recipient The recipient of the AMB
    /// @param amountMinimum The minimum amount of AMB desired
    function unwrapSAMB(address recipient, uint256 amountMinimum) internal {
        uint256 value = SAMB.balanceOf(address(this));
        if (value < amountMinimum) {
            revert InsufficientAMB();
        }
        if (value > 0) {
            SAMB.withdraw(value);
            if (recipient != address(this)) {
                recipient.safeTransferETH(value);
            }
        }
    }
}
