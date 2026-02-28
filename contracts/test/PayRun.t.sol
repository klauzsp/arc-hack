// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "forge-std/Test.sol";
import {PayRun} from "../src/PayRun.sol";
import {Core} from "../src/Core.sol";
import {Vesting} from "../src/Vesting.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC2 is ERC20 {
    constructor() ERC20("MockUSDC", "mUSDC") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

contract PayRunTest is Test {
    PayRun payRunContract;
    Core core;
    Vesting vesting;
    MockUSDC2 usdc;

    address admin   = address(0xAD);
    address alice   = address(0xA1);
    address bob     = address(0xB0);
    address carol   = address(0xC0);

    function setUp() public {
        vm.startPrank(admin);
        usdc = new MockUSDC2();

        // Deploy Vesting (needed by Core constructor)
        vesting = new Vesting(address(usdc));

        // Deploy Core (treasury)
        core = new Core(address(usdc), address(vesting), address(0));

        // Deploy PayRun
        payRunContract = new PayRun(address(usdc), address(core));

        // Wire Core → PayRun
        core.setPayRunContract(address(payRunContract));

        vm.stopPrank();

        // Fund treasury
        usdc.mint(address(core), 1_000_000e6);
    }

    // ── Helpers ────────────────────────

    function _id(string memory s) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(s));
    }

    // ── Tests ──────────────────────────

    function test_createPayRun_storesRecord() public {
        bytes32 prId = _id("pr-1");
        address[] memory r = new address[](2);
        uint256[] memory a = new uint256[](2);
        uint256[] memory c = new uint256[](2);
        r[0] = alice; r[1] = bob;
        a[0] = 1000e6; a[1] = 500e6;
        c[0] = 0; c[1] = 0;

        vm.prank(admin);
        payRunContract.createPayRun(prId, block.timestamp + 1 days, r, a, c);

        (uint256 periodEnd, PayRun.Status status, uint256 totalAmount, uint256 itemCount) =
            payRunContract.payRuns(prId);

        assertEq(totalAmount, 1500e6);
        assertEq(itemCount, 2);
        assertTrue(status == PayRun.Status.Pending);
        assertEq(payRunContract.payRunCount(), 1);
    }

    function test_executePayRun_transfersUsdc() public {
        bytes32 prId = _id("pr-2");
        address[] memory r = new address[](2);
        uint256[] memory a = new uint256[](2);
        uint256[] memory c = new uint256[](2);
        r[0] = alice; r[1] = bob;
        a[0] = 300e6; a[1] = 200e6;
        c[0] = 0; c[1] = 0;

        vm.startPrank(admin);
        payRunContract.createPayRun(prId, block.timestamp + 1 days, r, a, c);

        // Fund pay run contract from Core
        core.fundPayRun(prId, 500e6);

        // Execute
        payRunContract.executePayRun(prId);
        vm.stopPrank();

        assertEq(usdc.balanceOf(alice), 300e6);
        assertEq(usdc.balanceOf(bob), 200e6);
        assertTrue(payRunContract.getPayRunStatus(prId) == PayRun.Status.Executed);
    }

    function test_executePayRun_crossChainItemsSkipped() public {
        bytes32 prId = _id("pr-3");
        address[] memory r = new address[](3);
        uint256[] memory a = new uint256[](3);
        uint256[] memory c = new uint256[](3);
        r[0] = alice; r[1] = bob; r[2] = carol;
        a[0] = 100e6; a[1] = 200e6; a[2] = 150e6;
        c[0] = 0; c[1] = 99999; c[2] = 0; // bob is cross-chain

        vm.startPrank(admin);
        payRunContract.createPayRun(prId, block.timestamp + 1 days, r, a, c);
        core.fundPayRun(prId, 450e6);
        payRunContract.executePayRun(prId);
        vm.stopPrank();

        assertEq(usdc.balanceOf(alice), 100e6);
        assertEq(usdc.balanceOf(bob), 0);       // cross-chain: not transferred
        assertEq(usdc.balanceOf(carol), 150e6);
    }

    function test_createPayRun_reverts_emptyRecipients() public {
        bytes32 prId = _id("pr-4");
        address[] memory r = new address[](0);
        uint256[] memory a = new uint256[](0);
        uint256[] memory c = new uint256[](0);

        vm.prank(admin);
        vm.expectRevert(bytes("PayRun: empty recipients"));
        payRunContract.createPayRun(prId, block.timestamp + 1 days, r, a, c);
    }

    function test_createPayRun_reverts_duplicateId() public {
        bytes32 prId = _id("pr-5");
        address[] memory r = new address[](1);
        uint256[] memory a = new uint256[](1);
        uint256[] memory c = new uint256[](1);
        r[0] = alice; a[0] = 100e6; c[0] = 0;

        vm.startPrank(admin);
        payRunContract.createPayRun(prId, block.timestamp + 1 days, r, a, c);
        vm.expectRevert(bytes("PayRun: id exists"));
        payRunContract.createPayRun(prId, block.timestamp + 1 days, r, a, c);
        vm.stopPrank();
    }

    function test_executePayRun_reverts_notPending() public {
        bytes32 prId = _id("pr-6");
        address[] memory r = new address[](1);
        uint256[] memory a = new uint256[](1);
        uint256[] memory c = new uint256[](1);
        r[0] = alice; a[0] = 100e6; c[0] = 0;

        vm.startPrank(admin);
        payRunContract.createPayRun(prId, block.timestamp + 1 days, r, a, c);
        core.fundPayRun(prId, 100e6);
        payRunContract.executePayRun(prId);

        // second execution should fail
        vm.expectRevert(bytes("PayRun: not pending"));
        payRunContract.executePayRun(prId);
        vm.stopPrank();
    }

    function test_onlyOwner_createPayRun() public {
        bytes32 prId = _id("pr-7");
        address[] memory r = new address[](1);
        uint256[] memory a = new uint256[](1);
        uint256[] memory c = new uint256[](1);
        r[0] = alice; a[0] = 100e6; c[0] = 0;

        vm.prank(alice); // non-owner
        vm.expectRevert(bytes("PayRun: caller is not owner"));
        payRunContract.createPayRun(prId, block.timestamp + 1 days, r, a, c);
    }

    function test_getPayRunItems() public {
        bytes32 prId = _id("pr-8");
        address[] memory r = new address[](2);
        uint256[] memory a = new uint256[](2);
        uint256[] memory c = new uint256[](2);
        r[0] = alice; r[1] = bob;
        a[0] = 100e6; a[1] = 200e6;
        c[0] = 0; c[1] = 42161;

        vm.prank(admin);
        payRunContract.createPayRun(prId, block.timestamp + 1 days, r, a, c);

        PayRun.PayRunItem[] memory items = payRunContract.getPayRunItems(prId);
        assertEq(items.length, 2);
        assertEq(items[0].recipient, alice);
        assertEq(items[0].amount, 100e6);
        assertEq(items[1].chainId, 42161);
    }
}
