// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// Vesting is a contract that releases tokens to a employees linearly over a specified period.
// For example, if 100 tokens are vested over 100 days, the employee will receive 1 token per day.
// However, the vesting happens every second, so every update to the block.timestamp means the amount
// withdrawable is updated. The contract should track the amount of tokens the user has withdrawn so far.
// For example, if the vesting period is 4 hours, then after 1 hour, 1/4th of the tokens are withdrawable.

// Be careful to track the amount withdrawn per-vesting. The same user might have multiple vestings using
// the same token.

// Lifecycle:
// Employer deposits tokens into the contracts and creates a vest
// Employee can withdraw their tokens at any time, but only up to the amount released
// The receiver can identify vests that belong to them by listening to events and entering in vests mapping

contract Vesting {
    using SafeERC20 for IERC20;

    address public immutable employer;
    IERC20 public usdc = IERC20(address(0x3600000000000000000000000000000000000000));

    struct Vest {
        uint40 startTime;
        address recipient;
        uint40 duration;
        uint256 amount;
        uint256 withdrawn;
    }

    mapping(bytes32 => Vest) public vests;
    bytes32[] public vestIds;

    // Events
    event VestCreated(
        address indexed sender, address indexed recipient, uint256 amount, uint256 startTime, uint256 duration
    );

    event VestWithdrawn(address indexed recipient, bytes32 indexed vestId, uint256 amount, uint256 timestamp);

    constructor() {
        employer = msg.sender;
    }

    /*
     * @notice Creates a vest for employees
     * @param recipient The employee of the vest
     * @param amount The amount of usdc to vest
     * @param startTime The start time of the vest in seconds
     * @param duration The duration of the vest in seconds
     * @param salt Allows for multiple vests to be created with the same parameters
     */
    function createVest(address recipient, uint256 amount, uint40 startTime, uint40 duration, uint256 salt) external {
        if (amount == 0 || duration == 0) revert("Cannot be 0 amount or duration");
        if (startTime < block.timestamp) revert("Start time cannot be in the past");
        bytes32 vestId = keccak256(abi.encodePacked(recipient, amount, startTime, duration, salt));
        vests[vestId] =
            Vest({startTime: startTime, recipient: recipient, duration: duration, amount: amount, withdrawn: 0});
        vestIds.push(vestId);
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit VestCreated(msg.sender, recipient, amount, startTime, duration);
    }

    // @note need a deallocate

    function cancelVest(bytes32 vestId) external {
        Vest storage vest = vests[vestId];
        if (vest.startTime < block.timestamp) revert("Vest has already began");
        // if (msg.sender != employer) revert("Must be employer");
        usdc.safeTransfer(employer, vest.amount);
        delete vests[vestId];
    }

    /**
     * @notice Withdraws a vest
     * @param vestId The ID of the vest to withdraw
     * @param amount The amount to withdraw. If amount is greater than the amount withdrawable,
     * the amount withdrawable is withdrawn.
     */
    function withdrawVest(bytes32 vestId, uint256 amount) external {
        if (amount == 0) revert("Cannot be zero amount");
        Vest storage vest = vests[vestId];
        address vestRecipient = vest.recipient;
        if (msg.sender != vestRecipient) revert("Must be recipient");
        uint256 vestStartTime = vest.startTime;
        if (vestStartTime > block.timestamp) revert("Vest has not began");

        uint256 vestAmount = vest.amount;
        uint256 vestDuration = vest.duration;

        //  Find what the end vest time is
        uint256 endOfVest = vestStartTime + vestDuration;
        // Have we gone past the end time? If so, the full duration has passed (such as 10 days). If not, how much time has passed since the start time (such as 2 days)
        uint256 durationPassed = block.timestamp >= endOfVest ? vestDuration : block.timestamp - vestStartTime;

        uint256 vested = vestAmount * durationPassed / vestDuration;
        // e.g. 1000 * (2 days has passed / 10 days) -> 20% (200 tokens)
        uint256 amountReleasable = vested - vest.withdrawn;
        // e.g. if someone made a withdrawal at 200 and then at 210 tokens, we want to only send them 10
        uint256 amountToSend = amount > amountReleasable ? amountReleasable : amount;

        vest.withdrawn += amountToSend;
        usdc.safeTransfer(vestRecipient, amountToSend);

        emit VestWithdrawn(vestRecipient, vestId, amountToSend, block.timestamp);
    }

    /*
     * @notice Computes the vest ID for a given vest
     * @param recipient The employee of the vest
     * @param amount The amount of usdc to vest
     * @param startTime The start time of the vest in seconds
     * @param duration The duration of the vest in seconds
     * @param salt Allows for multiple vests to be created with the same parameters
     * @return The vest ID, which is the keccak256 hash of the vest parameters
     */
    function computeVestId(address recipient, uint256 amount, uint40 startTime, uint40 duration, uint256 salt)
        public
        view
        returns (bytes32)
    {
        return (keccak256(abi.encodePacked(recipient, amount, startTime, duration, salt)));
    }
}
