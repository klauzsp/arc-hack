// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IVesting {
    function createVest(address recipient, uint256 amount, uint40 startTime, uint40 duration, uint256 salt) external;
    function cancelVest(bytes32 vestId) external;
}

/// @notice Treasury contract that holds Arc USDC and authorizes payroll transfers.
contract Core is Ownable {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error UnauthorizedPayoutExecutor();
    error LengthMismatch();

    IERC20 public immutable usdc;
    address public vestingContract;
    address public rebalanceContract;

    mapping(address => bool) public payoutExecutors;

    event VestingContractSet(address indexed vestingContract);
    event RebalanceContractSet(address indexed rebalanceContract);
    event PayoutExecutorSet(address indexed executor, bool allowed);
    event TreasuryWithdrawal(address indexed to, uint256 amount);
    event PayrollTransfer(address indexed recipient, uint256 amount);
    event PayrollBatchTransfer(uint256 recipientCount, uint256 totalAmount);

    constructor(address initialOwner, address usdc_, address vestingContract_, address rebalanceContract_)
        Ownable(initialOwner)
    {
        if (initialOwner == address(0) || usdc_ == address(0)) revert ZeroAddress();
        usdc = IERC20(usdc_);
        vestingContract = vestingContract_;
        rebalanceContract = rebalanceContract_;
    }

    modifier onlyOwnerOrPayoutExecutor() {
        if (msg.sender != owner() && !payoutExecutors[msg.sender]) revert UnauthorizedPayoutExecutor();
        _;
    }

    function setVestingContract(address vestingContract_) external onlyOwner {
        vestingContract = vestingContract_;
        emit VestingContractSet(vestingContract_);
    }

    function setRebalanceContract(address rebalanceContract_) external onlyOwner {
        rebalanceContract = rebalanceContract_;
        emit RebalanceContractSet(rebalanceContract_);
    }

    function setPayoutExecutor(address executor, bool allowed) external onlyOwner {
        if (executor == address(0)) revert ZeroAddress();
        payoutExecutors[executor] = allowed;
        emit PayoutExecutorSet(executor, allowed);
    }

    function treasuryBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    function withdraw(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        usdc.safeTransfer(to, amount);
        emit TreasuryWithdrawal(to, amount);
    }

    function transferPayroll(address recipient, uint256 amount) external onlyOwnerOrPayoutExecutor {
        if (recipient == address(0)) revert ZeroAddress();
        usdc.safeTransfer(recipient, amount);
        emit PayrollTransfer(recipient, amount);
    }

    function batchPayout(address[] calldata recipients, uint256[] calldata amounts)
        external
        onlyOwnerOrPayoutExecutor
        returns (uint256 totalAmount)
    {
        if (recipients.length != amounts.length) revert LengthMismatch();

        for (uint256 i = 0; i < recipients.length; i++) {
            if (recipients[i] == address(0)) revert ZeroAddress();
            uint256 amount = amounts[i];
            totalAmount += amount;
            usdc.safeTransfer(recipients[i], amount);
            emit PayrollTransfer(recipients[i], amount);
        }

        emit PayrollBatchTransfer(recipients.length, totalAmount);
    }

    function allocateToVesting(address employee, uint256 amount, uint40 startTime, uint40 duration, uint256 salt)
        external
        onlyOwner
    {
        if (vestingContract == address(0)) revert ZeroAddress();
        usdc.forceApprove(vestingContract, amount);
        IVesting(vestingContract).createVest(employee, amount, startTime, duration, salt);
    }

    function cancelVest(bytes32 vestId) external onlyOwner {
        if (vestingContract == address(0)) revert ZeroAddress();
        IVesting(vestingContract).cancelVest(vestId);
    }
}
