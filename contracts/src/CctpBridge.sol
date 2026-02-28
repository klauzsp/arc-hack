// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Core} from "./Core.sol";

interface ITokenMessengerV2 {
    function depositForBurn(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold
    ) external;

    function depositForBurnWithHook(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold,
        bytes calldata hookData
    ) external;
}

/// @notice Pulls payroll funds from treasury and initiates Circle CCTP burns for cross-chain payouts.
contract CctpBridge is Ownable {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error InvalidDestinationDomain();
    error InvalidAmount();
    error InvalidFee();
    error UnauthorizedOperator();

    bytes internal constant FORWARDING_HOOK_DATA =
        hex"636374702d666f72776172640000000000000000000000000000000000000000";

    Core public immutable treasury;
    IERC20 public immutable usdc;
    uint32 public immutable sourceDomain;
    ITokenMessengerV2 public tokenMessenger;

    mapping(address => bool) public operators;

    event OperatorSet(address indexed operator, bool allowed);
    event TokenMessengerSet(address indexed tokenMessenger);
    event PayrollBridgeRequested(
        address indexed recipient,
        uint32 indexed destinationDomain,
        uint256 amount,
        uint256 maxFee,
        uint32 minFinalityThreshold,
        bool useForwarder
    );

    constructor(
        address initialOwner,
        address treasury_,
        address usdc_,
        address tokenMessenger_,
        uint32 sourceDomain_
    ) Ownable(initialOwner) {
        if (initialOwner == address(0) || treasury_ == address(0) || usdc_ == address(0) || tokenMessenger_ == address(0))
        {
            revert ZeroAddress();
        }

        treasury = Core(treasury_);
        usdc = IERC20(usdc_);
        tokenMessenger = ITokenMessengerV2(tokenMessenger_);
        sourceDomain = sourceDomain_;
    }

    modifier onlyOperator() {
        if (msg.sender != owner() && !operators[msg.sender]) revert UnauthorizedOperator();
        _;
    }

    function setOperator(address operator, bool allowed) external onlyOwner {
        if (operator == address(0)) revert ZeroAddress();
        operators[operator] = allowed;
        emit OperatorSet(operator, allowed);
    }

    function setTokenMessenger(address tokenMessenger_) external onlyOwner {
        if (tokenMessenger_ == address(0)) revert ZeroAddress();
        tokenMessenger = ITokenMessengerV2(tokenMessenger_);
        emit TokenMessengerSet(tokenMessenger_);
    }

    function bridgePayroll(
        address recipient,
        uint256 amount,
        uint32 destinationDomain,
        uint256 maxFee,
        uint32 minFinalityThreshold,
        bool useForwarder
    ) external onlyOperator {
        if (recipient == address(0)) revert ZeroAddress();
        if (destinationDomain == sourceDomain) revert InvalidDestinationDomain();
        if (amount == 0) revert InvalidAmount();
        if (maxFee >= amount) revert InvalidFee();

        treasury.transferPayroll(address(this), amount);
        usdc.forceApprove(address(tokenMessenger), amount);

        bytes32 mintRecipient = bytes32(uint256(uint160(recipient)));
        if (useForwarder) {
            tokenMessenger.depositForBurnWithHook(
                amount,
                destinationDomain,
                mintRecipient,
                address(usdc),
                bytes32(0),
                maxFee,
                minFinalityThreshold,
                FORWARDING_HOOK_DATA
            );
        } else {
            tokenMessenger.depositForBurn(
                amount,
                destinationDomain,
                mintRecipient,
                address(usdc),
                bytes32(0),
                maxFee,
                minFinalityThreshold
            );
        }

        emit PayrollBridgeRequested(recipient, destinationDomain, amount, maxFee, minFinalityThreshold, useForwarder);
    }

    function rescueToken(address token, address to, uint256 amount) external onlyOwner {
        if (token == address(0) || to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
    }
}
