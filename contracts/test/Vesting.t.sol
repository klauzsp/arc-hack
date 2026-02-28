// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "forge-std/Test.sol";
import {Vesting} from "../src/Vesting.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("MockUSDC", "mUSDC") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

contract VestingTest is Test {
    Vesting vesting;
    MockUSDC usdc;

    address employer = address(0xE);
    address alice   = address(0xA);
    address bob     = address(0xB); // random other user

    function setUp() public {
        vm.startPrank(employer);
        usdc = new MockUSDC();
        vesting = new Vesting(address(usdc));
        vm.stopPrank();

        // fund employer and bob so either can create vests (since contract allows anyone)
        usdc.mint(employer, 1_000_000e18);
        usdc.mint(bob, 1_000_000e18);
    }

    function _createVestFrom(
        address sender,
        address recipient,
        uint256 amount,
        uint40 startTime,
        uint40 duration,
        uint256 salt
    ) internal returns (bytes32 vestId) {
        vm.startPrank(sender);
        usdc.approve(address(vesting), amount);
        vesting.createVest(recipient, amount, startTime, duration, salt);
        vm.stopPrank();

        vestId = vesting.computeVestId(recipient, amount, startTime, duration, salt);
    }

    function test_createVest_storesVestAndTransfersUSDC() public {
        uint256 amount = 100e18;
        uint40 start = uint40(block.timestamp + 10);
        uint40 duration = 100;

        uint256 contractBefore = usdc.balanceOf(address(vesting));
        bytes32 vestId = _createVestFrom(employer, alice, amount, start, duration, 1);

        // contract got funded
        assertEq(usdc.balanceOf(address(vesting)), contractBefore + amount);

        // vest stored
        (uint40 s, address r, uint40 d, uint256 a, uint256 w) = vesting.vests(vestId);
        assertEq(uint256(s), uint256(start));
        assertEq(r, alice);
        assertEq(uint256(d), uint256(duration));
        assertEq(a, amount);
        assertEq(w, 0);
    }

    function test_withdraw_reverts_if_not_recipient() public {
        bytes32 vestId = _createVestFrom(employer, alice, 100e18, uint40(block.timestamp + 1), 100, 1);

        vm.warp(block.timestamp + 2);

        vm.prank(bob);
        vm.expectRevert(bytes("Must be recipient"));
        vesting.withdrawVest(vestId, 1e18);
    }

    function test_withdraw_reverts_before_start() public {
        uint40 start = uint40(block.timestamp + 100);
        bytes32 vestId = _createVestFrom(employer, alice, 100e18, start, 1000, 1);

        vm.prank(alice);
        vm.expectRevert(bytes("Vest has not began"));
        vesting.withdrawVest(vestId, 1e18);
    }

    function test_withdraw_linear_partial_and_caps_to_releasable() public {
        uint256 amount = 100e18;
        uint40 start = uint40(block.timestamp + 1);
        uint40 duration = 100;

        bytes32 vestId = _createVestFrom(employer, alice, amount, start, duration, 42);

        // 25% vested => 25e18
        vm.warp(start + 25);

        uint256 aliceBefore = usdc.balanceOf(alice);

        vm.startPrank(alice);
        vesting.withdrawVest(vestId, 10e18);      // withdraw 10
        vesting.withdrawVest(vestId, 1000e18);    // request huge -> should cap to remaining 15
        vm.stopPrank();

        uint256 aliceAfter = usdc.balanceOf(alice);
        assertEq(aliceAfter - aliceBefore, 25e18);

        (, , , , uint256 withdrawn) = vesting.vests(vestId);
        assertEq(withdrawn, 25e18);
    }

    function test_withdraw_full_after_end() public {
        uint256 amount = 100e18;
        uint40 start = uint40(block.timestamp + 1);
        uint40 duration = 100;

        bytes32 vestId = _createVestFrom(employer, alice, amount, start, duration, 99);

        vm.warp(start + duration + 1);

        vm.prank(alice);
        vesting.withdrawVest(vestId, amount);

        assertEq(usdc.balanceOf(alice), amount);

        // Another withdraw when nothing is releasable transfers 0 (current behavior).
        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice);
        vesting.withdrawVest(vestId, 1e18);
        assertEq(usdc.balanceOf(alice), before);
    }

    function test_anyone_can_createVest_current_behavior() public {
        // bob can create a vest because createVest has no employer check
        uint256 amount = 50e18;
        uint40 start = uint40(block.timestamp + 10);

        bytes32 vestId = _createVestFrom(bob, alice, amount, start, 100, 123);

        (, address r, , uint256 a, ) = vesting.vests(vestId);
        assertEq(r, alice);
        assertEq(a, amount);
    }

    function test_computeVestId_matches_internal_encoding() public {
        uint256 amount = 1e18;
        uint40 start = uint40(block.timestamp + 10);
        uint40 duration = 100;
        uint256 salt = 777;

        bytes32 expected = keccak256(abi.encodePacked(alice, amount, start, duration, salt));
        bytes32 got = vesting.computeVestId(alice, amount, start, duration, salt);

        assertEq(got, expected);
    }
}