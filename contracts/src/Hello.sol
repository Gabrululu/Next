// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Pipeline smoke test: proves compile -> deploy -> read works on Monad testnet.
contract Hello {
    string public greeting = "Everyone in line. Nobody cuts in.";
}
