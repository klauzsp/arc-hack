// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {Core} from "../src/Core.sol";
import {CctpBridge} from "../src/CctpBridge.sol";
import {PayRun} from "../src/PayRun.sol";

contract DeployCctpPayouts is Script {
    uint32 internal constant ARC_TESTNET_CCTP_DOMAIN = 26;
    address internal constant ARC_TESTNET_USDC = 0x3600000000000000000000000000000000000000;
    address internal constant ARC_TESTNET_TOKEN_MESSENGER_V2 = 0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA;

    function run() external returns (CctpBridge cctpBridge, PayRun payRun) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address owner = vm.envOr("OWNER_ADDRESS", vm.addr(deployerPrivateKey));
        address coreAddress = vm.envAddress("CORE_ADDRESS");
        address usdc = vm.envOr("ARC_TESTNET_USDC", ARC_TESTNET_USDC);
        address tokenMessenger = vm.envOr("ARC_TESTNET_TOKEN_MESSENGER_V2", ARC_TESTNET_TOKEN_MESSENGER_V2);
        address previousPayRun = vm.envOr("PREVIOUS_PAYRUN_ADDRESS", address(0));
        address previousCctpBridge = vm.envOr("PREVIOUS_CCTP_BRIDGE_ADDRESS", address(0));
        Core core = Core(coreAddress);

        vm.startBroadcast(deployerPrivateKey);

        cctpBridge = new CctpBridge(owner, coreAddress, usdc, tokenMessenger, ARC_TESTNET_CCTP_DOMAIN);
        payRun = new PayRun(owner, coreAddress, address(cctpBridge), ARC_TESTNET_CCTP_DOMAIN);

        core.setPayoutExecutor(address(payRun), true);
        core.setPayoutExecutor(address(cctpBridge), true);
        cctpBridge.setOperator(address(payRun), true);

        if (previousPayRun != address(0)) {
            core.setPayoutExecutor(previousPayRun, false);
        }
        if (previousCctpBridge != address(0)) {
            core.setPayoutExecutor(previousCctpBridge, false);
        }

        vm.stopBroadcast();

        console2.log("owner", owner);
        console2.log("core", coreAddress);
        console2.log("cctpBridge", address(cctpBridge));
        console2.log("payRun", address(payRun));
        console2.log("tokenMessengerV2", tokenMessenger);
        console2.log("previousPayRunDisabled", previousPayRun);
        console2.log("previousCctpBridgeDisabled", previousCctpBridge);
    }
}
