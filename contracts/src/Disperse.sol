// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Stress-test helper: funds many ephemeral wallets in ONE transaction, so the deployer
///         does not need hundreds of in-flight transfers (Monad's reserve-balance rules cap the
///         gas a sender can have in flight across consecutive blocks).
contract Disperse {
    error LengthMismatch();
    error TransferFailed(address to);

    function disperse(address[] calldata to, uint256 amountEach) external payable {
        if (msg.value != amountEach * to.length) revert LengthMismatch();
        for (uint256 i = 0; i < to.length; ++i) {
            (bool ok,) = to[i].call{value: amountEach}("");
            if (!ok) revert TransferFailed(to[i]);
        }
    }
}
