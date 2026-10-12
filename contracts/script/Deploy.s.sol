// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Next} from "../src/Next.sol";
import {Disperse} from "../src/Disperse.sol";

/// Deploys Next (which deploys its NextPass in the constructor) and, only if DISPERSE_ADDRESS is not
/// already set, the Disperse helper used by the stress test.
contract DeployScript is Script {
    /// @dev docs.monad.xyz/ai/current-facts.md: 300 ms blocks (measured ~302 ms on testnet, 2026-10-11).
    uint256 constant BLOCK_TIME_MS = 300;

    function run() external {
        address existingDisperse = vm.envOr("DISPERSE_ADDRESS", address(0));
        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        Next next = new Next(BLOCK_TIME_MS);
        address disperse = existingDisperse == address(0) ? address(new Disperse()) : existingDisperse;
        vm.stopBroadcast();
        console.log("NEXT_ADDRESS=%s", address(next));
        console.log("NEXT_PASS_ADDRESS=%s", address(next.pass()));
        console.log("DISPERSE_ADDRESS=%s", disperse);
    }
}
