// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Core} from "./Core.sol";

/// @notice Stores pay run records on-chain and executes Arc payouts from the treasury.
contract PayRun is Ownable {
    error ZeroAddress();
    error LengthMismatch();
    error PayRunAlreadyExists();
    error PayRunNotFound();
    error InvalidStatus();
    error EmptyPayRun();

    enum Status {
        None,
        Pending,
        Processing,
        Executed,
        Failed
    }

    struct PayRunSummary {
        uint64 periodStart;
        uint64 periodEnd;
        uint64 executedAt;
        uint32 recipientCount;
        uint256 totalAmount;
        Status status;
        bool arcTransfersExecuted;
    }

    struct PayRunItem {
        address recipient;
        uint256 amount;
        uint32 chainId;
    }

    Core public immutable treasury;
    uint32 public immutable arcChainId;

    mapping(address => bool) public managers;
    mapping(bytes32 => PayRunSummary) public payRuns;
    mapping(bytes32 => PayRunItem[]) private _payRunItems;

    event ManagerSet(address indexed manager, bool allowed);
    event PayRunCreated(bytes32 indexed payRunId, uint64 periodStart, uint64 periodEnd, uint256 totalAmount);
    event ArcPayoutTransferred(bytes32 indexed payRunId, uint256 indexed itemIndex, address indexed recipient, uint256 amount);
    event CrossChainPayoutRequested(
        bytes32 indexed payRunId, uint256 indexed itemIndex, address indexed recipient, uint256 amount, uint32 chainId
    );
    event PayRunProcessing(bytes32 indexed payRunId, uint256 arcPayoutAmount, uint256 crossChainItemCount);
    event PayRunFinalized(bytes32 indexed payRunId, uint64 executedAt);
    event PayRunFailed(bytes32 indexed payRunId);

    constructor(address initialOwner, address treasury_, uint32 arcChainId_) Ownable(initialOwner) {
        if (initialOwner == address(0) || treasury_ == address(0)) revert ZeroAddress();
        treasury = Core(treasury_);
        arcChainId = arcChainId_;
    }

    modifier onlyManager() {
        if (msg.sender != owner() && !managers[msg.sender]) revert InvalidStatus();
        _;
    }

    function setManager(address manager, bool allowed) external onlyOwner {
        if (manager == address(0)) revert ZeroAddress();
        managers[manager] = allowed;
        emit ManagerSet(manager, allowed);
    }

    function createPayRun(
        bytes32 payRunId,
        uint64 periodStart,
        uint64 periodEnd,
        address[] calldata recipients,
        uint256[] calldata amounts,
        uint32[] calldata chainIds
    ) external onlyManager returns (uint256 totalAmount) {
        if (payRuns[payRunId].status != Status.None) revert PayRunAlreadyExists();
        if (recipients.length == 0) revert EmptyPayRun();
        if (recipients.length != amounts.length || recipients.length != chainIds.length) revert LengthMismatch();

        for (uint256 i = 0; i < recipients.length; i++) {
            if (recipients[i] == address(0)) revert ZeroAddress();

            uint256 amount = amounts[i];
            totalAmount += amount;
            _payRunItems[payRunId].push(PayRunItem({recipient: recipients[i], amount: amount, chainId: chainIds[i]}));
        }

        payRuns[payRunId] = PayRunSummary({
            periodStart: periodStart,
            periodEnd: periodEnd,
            executedAt: 0,
            recipientCount: uint32(recipients.length),
            totalAmount: totalAmount,
            status: Status.Pending,
            arcTransfersExecuted: false
        });

        emit PayRunCreated(payRunId, periodStart, periodEnd, totalAmount);
    }

    function executePayRun(bytes32 payRunId) external onlyManager returns (uint256 arcPayoutAmount, uint256 crossChainItemCount) {
        PayRunSummary storage payRun = payRuns[payRunId];
        if (payRun.status == Status.None) revert PayRunNotFound();
        if (payRun.status != Status.Pending || payRun.arcTransfersExecuted) revert InvalidStatus();

        payRun.arcTransfersExecuted = true;

        PayRunItem[] storage items = _payRunItems[payRunId];
        for (uint256 i = 0; i < items.length; i++) {
            PayRunItem storage item = items[i];
            if (item.chainId == arcChainId) {
                treasury.transferPayroll(item.recipient, item.amount);
                arcPayoutAmount += item.amount;
                emit ArcPayoutTransferred(payRunId, i, item.recipient, item.amount);
            } else {
                crossChainItemCount += 1;
                emit CrossChainPayoutRequested(payRunId, i, item.recipient, item.amount, item.chainId);
            }
        }

        if (crossChainItemCount == 0) {
            payRun.status = Status.Executed;
            payRun.executedAt = uint64(block.timestamp);
            emit PayRunFinalized(payRunId, payRun.executedAt);
        } else {
            payRun.status = Status.Processing;
            emit PayRunProcessing(payRunId, arcPayoutAmount, crossChainItemCount);
        }
    }

    function finalizePayRun(bytes32 payRunId) external onlyManager {
        PayRunSummary storage payRun = payRuns[payRunId];
        if (payRun.status != Status.Processing || !payRun.arcTransfersExecuted) revert InvalidStatus();

        payRun.status = Status.Executed;
        payRun.executedAt = uint64(block.timestamp);

        emit PayRunFinalized(payRunId, payRun.executedAt);
    }

    function markFailed(bytes32 payRunId) external onlyManager {
        PayRunSummary storage payRun = payRuns[payRunId];
        if (payRun.status == Status.None) revert PayRunNotFound();
        if (payRun.status != Status.Pending && payRun.status != Status.Processing) revert InvalidStatus();

        payRun.status = Status.Failed;
        emit PayRunFailed(payRunId);
    }

    function getItemCount(bytes32 payRunId) external view returns (uint256) {
        return _payRunItems[payRunId].length;
    }

    function getItem(bytes32 payRunId, uint256 index) external view returns (PayRunItem memory) {
        return _payRunItems[payRunId][index];
    }
}
