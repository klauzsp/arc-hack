// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Vesting} from "./Vesting.sol";
import {Rebalance} from "./Rebalance.sol";

contract Core {
    using SafeERC20 for IERC20;
    // This contract is meant to be a simple treasury that can hold USDC and allow the owner to withdraw it.
    // The owner should be able to withdraw any amount of USDC from the contract at any time.

    address public owner;
    IERC20 public usdc = IERC20(address(0x3600000000000000000000000000000000000000)); // arc USDC address
    address public vestingContract;
    address public rebalanceContract;

    constructor(address _usdc, address _vestingContract, address _rebalanceContract) {
        owner = msg.sender;
        usdc = IERC20(_usdc);
        vestingContract = _vestingContract;
        rebalanceContract = _rebalanceContract;
    }

    function withdraw(uint256 amount) external {
        require(msg.sender == owner, "Only owner can withdraw");
        usdc.safeTransfer(owner, amount);
    }

    function allocateToVesting(address employee, uint256 amount, uint40 startTime, uint40 duration, uint256 salt)
        external
    {
        require(msg.sender == owner, "Only owner can allocate to vesting");
        usdc.approve(vestingContract, amount);
        Vesting(vestingContract).createVest(employee, amount, startTime, duration, salt);
    }

    function cancelVest(bytes32 vestId) external {
        require(msg.sender == owner, "Only owner can cancel vest");
        Vesting(vestingContract).cancelVest(vestId);
    }
}
