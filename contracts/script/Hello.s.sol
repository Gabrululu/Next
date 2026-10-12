// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Hello} from "../src/Hello.sol";

contract HelloScript is Script {
    function run() external {
        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        Hello h = new Hello();
        vm.stopBroadcast();
        console.log("Hello deployed at", address(h));
    }
}
