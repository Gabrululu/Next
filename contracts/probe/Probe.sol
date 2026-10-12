// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract Probe {
    function probe() external view returns (uint256 n, bytes32 h1, bytes32 h2, bytes32 h256, bytes32 h257, bytes32 h8191, bytes32 h8192, uint256 rnd, uint256 ts) {
        n = block.number;
        h1 = blockhash(n - 1);
        h2 = blockhash(n - 2);
        h256 = blockhash(n - 256);
        h257 = blockhash(n - 257);
        h8191 = blockhash(n - 8191);
        h8192 = blockhash(n - 8192);
        rnd = block.prevrandao;
        ts = block.timestamp;
    }
}
