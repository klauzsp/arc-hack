// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Test} from "forge-std/Test.sol";
import {Core} from "../src/Core.sol";
import {PayRun} from "../src/PayRun.sol";
import {Rebalance} from "../src/Rebalance.sol";
import {Vesting} from "../src/Vesting.sol";

contract MockToken is ERC20 {
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        _burn(from, amount);
    }
}

contract MockTeller {
    MockToken public immutable usdc;
    MockToken public immutable usyc;

    constructor(address usdc_, address usyc_) {
        usdc = MockToken(usdc_);
        usyc = MockToken(usyc_);
    }

    function deposit(uint256 assets, address receiver) external returns (uint256) {
        usdc.transferFrom(msg.sender, address(this), assets);
        usyc.mint(receiver, assets);
        return assets;
    }

    function redeem(uint256 shares, address receiver, address account) external returns (uint256) {
        usyc.transferFrom(account, address(this), shares);
        usyc.burn(address(this), shares);
        usdc.transfer(receiver, shares);
        return shares;
    }
}

contract PayrollSystemTest is Test {
    uint32 internal constant ARC_CHAIN_ID = 10_001;
    uint32 internal constant BASE_CHAIN_ID = 8453;

    address internal owner = address(0xA11CE);
    address internal payrollManager = address(0xB0B);
    address internal alice = address(0xAAA1);
    address internal bob = address(0xBBB2);
    address internal carol = address(0xCCC3);

    MockToken internal usdc;
    MockToken internal usyc;
    MockTeller internal teller;
    Vesting internal vesting;
    Rebalance internal rebalance;
    Core internal treasury;
    PayRun internal payRun;

    function setUp() public {
        vm.startPrank(owner);
        usdc = new MockToken("Mock USD Coin", "mUSDC");
        usyc = new MockToken("Mock Yield Coin", "mUSYC");
        teller = new MockTeller(address(usdc), address(usyc));
        vesting = new Vesting(owner, address(usdc));
        rebalance = new Rebalance(owner, address(usdc), address(usyc), address(teller));
        treasury = new Core(owner, address(usdc), address(vesting), address(rebalance));
        payRun = new PayRun(owner, address(treasury), ARC_CHAIN_ID);
        vesting.setAllocator(address(treasury), true);
        treasury.setPayoutExecutor(address(payRun), true);
        payRun.setManager(payrollManager, true);
        rebalance.setOperator(payrollManager, true);
        vm.stopPrank();

        usdc.mint(address(treasury), 1_000_000e18);
        usdc.mint(address(rebalance), 250_000e18);
    }

    function test_executeArcOnlyPayRun_marksExecutedAndTransfersFunds() public {
        bytes32 payRunId = keccak256("payrun-1");
        address[] memory recipients = new address[](2);
        recipients[0] = alice;
        recipients[1] = bob;

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1_500e18;
        amounts[1] = 2_250e18;

        uint32[] memory chainIds = new uint32[](2);
        chainIds[0] = ARC_CHAIN_ID;
        chainIds[1] = ARC_CHAIN_ID;

        vm.prank(owner);
        payRun.createPayRun(payRunId, uint64(block.timestamp), uint64(block.timestamp + 14 days), recipients, amounts, chainIds);

        vm.prank(payrollManager);
        payRun.executePayRun(payRunId);

        assertEq(usdc.balanceOf(alice), amounts[0]);
        assertEq(usdc.balanceOf(bob), amounts[1]);

        (,,, uint32 recipientCount, uint256 totalAmount, PayRun.Status status, bool arcExecuted) = payRun.payRuns(payRunId);
        assertEq(recipientCount, 2);
        assertEq(totalAmount, amounts[0] + amounts[1]);
        assertEq(uint256(status), uint256(PayRun.Status.Executed));
        assertTrue(arcExecuted);
    }

    function test_executeMixedChainPayRun_movesToProcessingUntilFinalized() public {
        bytes32 payRunId = keccak256("payrun-2");
        address[] memory recipients = new address[](2);
        recipients[0] = alice;
        recipients[1] = carol;

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 800e18;
        amounts[1] = 1_200e18;

        uint32[] memory chainIds = new uint32[](2);
        chainIds[0] = ARC_CHAIN_ID;
        chainIds[1] = BASE_CHAIN_ID;

        vm.prank(owner);
        payRun.createPayRun(payRunId, uint64(block.timestamp), uint64(block.timestamp + 14 days), recipients, amounts, chainIds);

        vm.prank(owner);
        payRun.executePayRun(payRunId);

        assertEq(usdc.balanceOf(alice), amounts[0]);
        assertEq(usdc.balanceOf(carol), 0);

        (,,,,, PayRun.Status statusBeforeFinalize,) = payRun.payRuns(payRunId);
        assertEq(uint256(statusBeforeFinalize), uint256(PayRun.Status.Processing));

        vm.prank(owner);
        payRun.finalizePayRun(payRunId);

        (,, uint64 executedAt,,, PayRun.Status statusAfterFinalize,) = payRun.payRuns(payRunId);
        assertEq(uint256(statusAfterFinalize), uint256(PayRun.Status.Executed));
        assertGt(executedAt, 0);
    }

    function test_rebalance_operatorCanConvertAndRedeem() public {
        uint256 usdcAmount = 10_000e18;

        vm.prank(payrollManager);
        uint256 mintedUsyc = rebalance.usdcToUsyc(usdcAmount, address(rebalance));

        assertEq(mintedUsyc, usdcAmount);
        assertEq(usyc.balanceOf(address(rebalance)), usdcAmount);

        vm.prank(payrollManager);
        uint256 redeemedUsdc = rebalance.usycToUsdc(usdcAmount / 2, owner);

        assertEq(redeemedUsdc, usdcAmount / 2);
        assertEq(usdc.balanceOf(owner), usdcAmount / 2);
    }

    function test_ownerCanAllocateTreasuryFundsToVesting() public {
        uint256 amount = 5_000e18;
        uint40 startTime = uint40(block.timestamp + 1 days);
        uint40 duration = 30 days;

        vm.prank(owner);
        treasury.allocateToVesting(alice, amount, startTime, duration, 11);

        bytes32 vestId = vesting.computeVestId(alice, amount, startTime, duration, 11);
        (uint40 vestStartTime, address recipient, uint40 vestDuration, uint256 vestAmount, uint256 withdrawn) =
            vesting.vests(vestId);

        assertEq(uint256(vestStartTime), uint256(startTime));
        assertEq(recipient, alice);
        assertEq(uint256(vestDuration), uint256(duration));
        assertEq(vestAmount, amount);
        assertEq(withdrawn, 0);
    }
}
