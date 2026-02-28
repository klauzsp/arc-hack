// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title PayRun
 * @notice On-chain pay run record and batch USDC payout from a treasury (Core).
 *         Owner (admin) creates a pay run with recipients, amounts, and chain IDs.
 *         Execution transfers USDC from this contract (funded by Core) to each
 *         same-chain (Arc) recipient. Cross-chain items are marked for off-chain
 *         Bridge Kit handling by the backend.
 */
contract PayRun {
    using SafeERC20 for IERC20;

    // ── Types ──────────────────────────────────────────────────────────
    enum Status { Pending, Executed, Failed }

    struct PayRunItem {
        address recipient;
        uint256 amount;
        uint256 chainId;   // 0 or current chain → same-chain; otherwise cross-chain
    }

    struct PayRunRecord {
        uint256 periodEnd;
        Status  status;
        uint256 totalAmount;
        uint256 itemCount;
    }

    // ── State ──────────────────────────────────────────────────────────
    address public owner;
    address public treasury;   // Core contract that funds this contract
    IERC20  public usdc;

    mapping(bytes32 => PayRunRecord) public payRuns;
    mapping(bytes32 => PayRunItem[]) internal _items;
    bytes32[] public payRunIds;

    // ── Events ─────────────────────────────────────────────────────────
    event PayRunCreated(bytes32 indexed payRunId, uint256 periodEnd, uint256 totalAmount, uint256 itemCount);
    event PayRunExecuted(bytes32 indexed payRunId, uint256 totalPaidOnChain, uint256 crossChainItems);
    event PayoutSent(bytes32 indexed payRunId, address indexed recipient, uint256 amount);

    // ── Modifiers ──────────────────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "PayRun: caller is not owner");
        _;
    }

    // ── Constructor ────────────────────────────────────────────────────
    constructor(address _usdc, address _treasury) {
        owner = msg.sender;
        usdc = IERC20(_usdc);
        treasury = _treasury;
    }

    // ── Admin ──────────────────────────────────────────────────────────

    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
    }

    // ── Create ─────────────────────────────────────────────────────────

    /**
     * @notice Create a pay run in Pending state.
     * @param payRunId    Unique id (backend-generated, e.g. keccak of DB id).
     * @param periodEnd   End timestamp of the pay period.
     * @param recipients  Ordered array of recipient addresses.
     * @param amounts     Amounts (USDC, 6-decimal) per recipient.
     * @param chainIds    Destination chain per recipient (0 = same chain).
     */
    function createPayRun(
        bytes32 payRunId,
        uint256 periodEnd,
        address[] calldata recipients,
        uint256[] calldata amounts,
        uint256[] calldata chainIds
    ) external onlyOwner {
        require(recipients.length > 0, "PayRun: empty recipients");
        require(
            recipients.length == amounts.length && amounts.length == chainIds.length,
            "PayRun: length mismatch"
        );
        require(payRuns[payRunId].itemCount == 0, "PayRun: id exists");

        uint256 total = 0;
        for (uint256 i = 0; i < recipients.length; i++) {
            require(recipients[i] != address(0), "PayRun: zero address");
            require(amounts[i] > 0, "PayRun: zero amount");
            _items[payRunId].push(PayRunItem({
                recipient: recipients[i],
                amount: amounts[i],
                chainId: chainIds[i]
            }));
            total += amounts[i];
        }

        payRuns[payRunId] = PayRunRecord({
            periodEnd: periodEnd,
            status: Status.Pending,
            totalAmount: total,
            itemCount: recipients.length
        });
        payRunIds.push(payRunId);

        emit PayRunCreated(payRunId, periodEnd, total, recipients.length);
    }

    // ── Execute ────────────────────────────────────────────────────────

    /**
     * @notice Execute a pending pay run. The contract must already hold enough USDC
     *         (Core should transfer USDC to this contract before calling execute).
     *         Same-chain items are transferred directly; cross-chain items are skipped
     *         (backend handles them via Bridge Kit). Emits per-recipient PayoutSent.
     */
    function executePayRun(bytes32 payRunId) external onlyOwner {
        PayRunRecord storage pr = payRuns[payRunId];
        require(pr.itemCount > 0, "PayRun: not found");
        require(pr.status == Status.Pending, "PayRun: not pending");

        uint256 currentChain = block.chainid;
        uint256 totalPaidOnChain = 0;
        uint256 crossChainCount = 0;
        PayRunItem[] storage items = _items[payRunId];

        for (uint256 i = 0; i < items.length; i++) {
            if (items[i].chainId == 0 || items[i].chainId == currentChain) {
                usdc.safeTransfer(items[i].recipient, items[i].amount);
                totalPaidOnChain += items[i].amount;
                emit PayoutSent(payRunId, items[i].recipient, items[i].amount);
            } else {
                crossChainCount++;
            }
        }

        pr.status = Status.Executed;
        emit PayRunExecuted(payRunId, totalPaidOnChain, crossChainCount);
    }

    // ── Views ──────────────────────────────────────────────────────────

    function getPayRunItems(bytes32 payRunId) external view returns (PayRunItem[] memory) {
        return _items[payRunId];
    }

    function payRunCount() external view returns (uint256) {
        return payRunIds.length;
    }

    function getPayRunStatus(bytes32 payRunId) external view returns (Status) {
        return payRuns[payRunId].status;
    }
}
