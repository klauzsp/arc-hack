// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {Core} from "../src/Core.sol";
import {CctpBridge} from "../src/CctpBridge.sol";
import {PayRun} from "../src/PayRun.sol";
import {Rebalance} from "../src/Rebalance.sol";
import {Vesting} from "../src/Vesting.sol";

contract Deploy is Script {
    uint32 internal constant ARC_TESTNET_CHAIN_ID = 5_042_002;
    uint32 internal constant ARC_TESTNET_CCTP_DOMAIN = 26;
    address internal constant ARC_TESTNET_USDC = 0x3600000000000000000000000000000000000000;
    address internal constant ARC_TESTNET_USYC = 0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C;
    address internal constant ARC_TESTNET_TELLER = 0x9fdF14c5B14173D74C08Af27AebFf39240dC105A;
    address internal constant ARC_TESTNET_TOKEN_MESSENGER_V2 = 0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA;

    function run() external returns (Core core, PayRun payRun, Rebalance rebalance, Vesting vesting, CctpBridge cctpBridge) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address owner = vm.envOr("OWNER_ADDRESS", vm.addr(deployerPrivateKey));
        address usdc = vm.envOr("ARC_TESTNET_USDC", ARC_TESTNET_USDC);
        address usyc = vm.envOr("ARC_TESTNET_USYC", ARC_TESTNET_USYC);
        address teller = vm.envOr("ARC_TESTNET_TELLER", ARC_TESTNET_TELLER);
        address tokenMessenger = vm.envOr("ARC_TESTNET_TOKEN_MESSENGER_V2", ARC_TESTNET_TOKEN_MESSENGER_V2);

        vm.startBroadcast(deployerPrivateKey);

        vesting = new Vesting(owner, usdc);

        rebalance = new Rebalance(owner, usdc, usyc, teller);

        core = new Core(owner, usdc, address(vesting), address(rebalance));
        cctpBridge = new CctpBridge(owner, address(core), usdc, tokenMessenger, ARC_TESTNET_CCTP_DOMAIN);
        payRun = new PayRun(owner, address(core), address(cctpBridge), ARC_TESTNET_CCTP_DOMAIN);

        core.setPayoutExecutor(address(payRun), true);
        core.setPayoutExecutor(address(cctpBridge), true);
        vesting.setAllocator(address(core), true);
        cctpBridge.setOperator(address(payRun), true);

        vm.stopBroadcast();

        console2.log("owner", owner);
        console2.log("usdc", usdc);
        console2.log("vesting", address(vesting));
        console2.log("core", address(core));
        console2.log("cctpBridge", address(cctpBridge));
        console2.log("payRun", address(payRun));
        console2.log("rebalance", address(rebalance));
        console2.log("usyc", usyc);
        console2.log("teller", teller);
        console2.log("tokenMessengerV2", tokenMessenger);
    }
}
