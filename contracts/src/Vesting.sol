// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Linear vesting contract for employer-funded USDC grants.
contract Vesting is Ownable {
    using SafeERC20 for IERC20;

    error InvalidVest();
    error InvalidParameters();
    error StartTimeInPast();
    error VestAlreadyExists();
    error VestStarted();
    error VestNotStarted();
    error NotRecipient();

    IERC20 public immutable usdc;
    mapping(address => bool) public allocators;

    struct Vest {
        uint40 startTime;
        address recipient;
        uint40 duration;
        uint256 amount;
        uint256 withdrawn;
    }

    mapping(bytes32 => Vest) public vests;
    bytes32[] private _vestIds;

    event VestCreated(
        bytes32 indexed vestId,
        address indexed sender,
        address indexed recipient,
        uint256 amount,
        uint256 startTime,
        uint256 duration
    );
    event VestCancelled(bytes32 indexed vestId, uint256 refundedAmount);
    event VestWithdrawn(address indexed recipient, bytes32 indexed vestId, uint256 amount, uint256 timestamp);
    event AllocatorSet(address indexed allocator, bool allowed);

    constructor(address initialOwner, address usdc_) Ownable(initialOwner) {
        if (initialOwner == address(0) || usdc_ == address(0)) revert InvalidParameters();
        usdc = IERC20(usdc_);
    }

    modifier onlyAllocator() {
        if (msg.sender != owner() && !allocators[msg.sender]) revert OwnableUnauthorizedAccount(msg.sender);
        _;
    }

    function setAllocator(address allocator, bool allowed) external onlyOwner {
        if (allocator == address(0)) revert InvalidParameters();
        allocators[allocator] = allowed;
        emit AllocatorSet(allocator, allowed);
    }

    function createVest(address recipient, uint256 amount, uint40 startTime, uint40 duration, uint256 salt)
        external
        onlyAllocator
    {
        if (recipient == address(0) || amount == 0 || duration == 0) revert InvalidParameters();
        if (startTime < block.timestamp) revert StartTimeInPast();

        bytes32 vestId = computeVestId(recipient, amount, startTime, duration, salt);
        if (vests[vestId].recipient != address(0)) revert VestAlreadyExists();

        vests[vestId] =
            Vest({startTime: startTime, recipient: recipient, duration: duration, amount: amount, withdrawn: 0});
        _vestIds.push(vestId);
        usdc.safeTransferFrom(msg.sender, address(this), amount);

        emit VestCreated(vestId, msg.sender, recipient, amount, startTime, duration);
    }

    function cancelVest(bytes32 vestId) external onlyOwner {
        Vest memory vest = vests[vestId];
        if (vest.recipient == address(0)) revert InvalidVest();
        if (vest.startTime <= block.timestamp) revert VestStarted();

        delete vests[vestId];
        usdc.safeTransfer(owner(), vest.amount - vest.withdrawn);

        emit VestCancelled(vestId, vest.amount - vest.withdrawn);
    }

    function withdrawVest(bytes32 vestId, uint256 amount) external {
        if (amount == 0) revert InvalidParameters();

        Vest storage vest = vests[vestId];
        if (vest.recipient == address(0)) revert InvalidVest();
        if (msg.sender != vest.recipient) revert NotRecipient();
        if (vest.startTime > block.timestamp) revert VestNotStarted();

        uint256 endOfVest = uint256(vest.startTime) + vest.duration;
        uint256 durationPassed = block.timestamp >= endOfVest ? vest.duration : block.timestamp - vest.startTime;
        uint256 vested = vest.amount * durationPassed / vest.duration;
        uint256 releasable = vested - vest.withdrawn;
        uint256 amountToSend = amount > releasable ? releasable : amount;

        vest.withdrawn += amountToSend;
        usdc.safeTransfer(vest.recipient, amountToSend);

        emit VestWithdrawn(vest.recipient, vestId, amountToSend, block.timestamp);
    }

    function vestIds() external view returns (bytes32[] memory) {
        return _vestIds;
    }

    function computeVestId(address recipient, uint256 amount, uint40 startTime, uint40 duration, uint256 salt)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(recipient, amount, startTime, duration, salt));
    }
}
