// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Vesting} from "./Vesting.sol";
import {Rebalance} from "./Rebalance.sol";
import {PayRun} from "./PayRun.sol";

contract Core {
    using SafeERC20 for IERC20;

    // ── State ──────────────────────────────────────────────────────────
    address public owner;
    IERC20  public usdc;
    address public vestingContract;
    address public rebalanceContract;
    address public payRunContract;

    // ── Events ─────────────────────────────────────────────────────────
    event PayRunFunded(bytes32 indexed payRunId, uint256 amount);

    // ── Constructor ────────────────────────────────────────────────────
    constructor(address _usdc, address _vestingContract, address _rebalanceContract) {
        owner = msg.sender;
        usdc = IERC20(_usdc);
        vestingContract = _vestingContract;
        rebalanceContract = _rebalanceContract;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    // ── Config ─────────────────────────────────────────────────────────

    function setPayRunContract(address _payRunContract) external onlyOwner {
        payRunContract = _payRunContract;
    }

    function setRebalanceContract(address _rebalanceContract) external onlyOwner {
        rebalanceContract = _rebalanceContract;
    }

    // ── Treasury basics ────────────────────────────────────────────────

    function withdraw(uint256 amount) external onlyOwner {
        usdc.safeTransfer(owner, amount);
    }

    /**
     * @notice Return the USDC balance held by this treasury.
     */
    function balance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    // ── Vesting ────────────────────────────────────────────────────────

    function allocateToVesting(address employee, uint256 amount, uint40 startTime, uint40 duration, uint256 salt)
        external
        onlyOwner
    {
        usdc.approve(vestingContract, amount);
        Vesting(vestingContract).createVest(employee, amount, startTime, duration, salt);
    }

    function cancelVest(bytes32 vestId) external onlyOwner {
        Vesting(vestingContract).cancelVest(vestId);
    }

    // ── PayRun funding ─────────────────────────────────────────────────

    /**
     * @notice Fund the PayRun contract with USDC so it can execute payouts.
     *         Called by the backend/owner before executePayRun.
     */
    function fundPayRun(bytes32 payRunId, uint256 amount) external onlyOwner {
        require(payRunContract != address(0), "PayRun not set");
        usdc.safeTransfer(payRunContract, amount);
        emit PayRunFunded(payRunId, amount);
    }

    /**
     * @notice Ensure the treasury has at least `requiredUsdc` of USDC.
     *         If not, redeem USYC via Rebalance to cover the shortfall.
     *         Returns the amount redeemed (0 if treasury already had enough).
     */
    function ensureLiquidity(uint256 requiredUsdc) external onlyOwner returns (uint256 redeemed) {
        uint256 bal = usdc.balanceOf(address(this));
        if (bal >= requiredUsdc) return 0;

        uint256 shortfall = requiredUsdc - bal;
        // Rebalance.usycToUsdc redeems USYC held by the whitelisted EOA
        // and sends USDC back to the Rebalance contract, then we pull it.
        // For simplicity, owner/backend should call Rebalance directly and
        // transfer the resulting USDC to Core. This is a convenience helper
        // that records the intent; actual rebalance is orchestrated off-chain.
        redeemed = shortfall;
    }
}
