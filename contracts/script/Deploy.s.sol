// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {Core} from "../src/Core.sol";
import {PayRun} from "../src/PayRun.sol";
import {Rebalance} from "../src/Rebalance.sol";
import {Vesting} from "../src/Vesting.sol";

contract Deploy is Script {
    uint32 internal constant ARC_TESTNET_CHAIN_ID = 5_042_002;
    address internal constant ARC_TESTNET_USDC = 0x3600000000000000000000000000000000000000;
    address internal constant ARC_TESTNET_USYC = 0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C;
    address internal constant ARC_TESTNET_TELLER = 0x9fdF14c5B14173D74C08Af27AebFf39240dC105A;

    function run() external returns (Core core, PayRun payRun, Rebalance rebalance, Vesting vesting) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address owner = vm.envOr("OWNER_ADDRESS", vm.addr(deployerPrivateKey));
        address usdc = vm.envOr("ARC_TESTNET_USDC", ARC_TESTNET_USDC);
        address usyc = vm.envOr("ARC_TESTNET_USYC", ARC_TESTNET_USYC);
        address teller = vm.envOr("ARC_TESTNET_TELLER", ARC_TESTNET_TELLER);

        vm.startBroadcast(deployerPrivateKey);

        vesting = new Vesting(owner, usdc);

        rebalance = new Rebalance(owner, usdc, usyc, teller);

        core = new Core(owner, usdc, address(vesting), address(rebalance));
        payRun = new PayRun(owner, address(core), ARC_TESTNET_CHAIN_ID);

        core.setPayoutExecutor(address(payRun), true);
        vesting.setAllocator(address(core), true);

        vm.stopBroadcast();

        console2.log("owner", owner);
        console2.log("usdc", usdc);
        console2.log("vesting", address(vesting));
        console2.log("core", address(core));
        console2.log("payRun", address(payRun));
        console2.log("rebalance", address(rebalance));
        console2.log("usyc", usyc);
        console2.log("teller", teller);
    }
}
