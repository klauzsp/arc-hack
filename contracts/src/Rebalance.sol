// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface ITeller {
    function deposit(uint256 assets, address receiver) external returns (uint256);
    function redeem(uint256 shares, address receiver, address account) external returns (uint256);
}

/// @notice Converts idle USDC into USYC and redeems back into USDC for payroll liquidity.
contract Rebalance is Ownable {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error UnauthorizedOperator();

    ITeller public teller;
    IERC20 public immutable usdc;
    IERC20 public immutable usyc;

    mapping(address => bool) public operators;

    event OperatorSet(address indexed operator, bool allowed);
    event TellerSet(address indexed teller);
    event UsdcToUsyc(address indexed caller, uint256 usdcAmount, uint256 usycAmount, address indexed receiver);
    event UsycToUsdc(address indexed caller, uint256 usycAmount, uint256 usdcAmount, address indexed receiver);

    constructor(address initialOwner, address usdc_, address usyc_, address teller_) Ownable(initialOwner) {
        if (initialOwner == address(0) || usdc_ == address(0) || usyc_ == address(0) || teller_ == address(0)) {
            revert ZeroAddress();
        }

        usdc = IERC20(usdc_);
        usyc = IERC20(usyc_);
        teller = ITeller(teller_);
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

    function setTeller(address teller_) external onlyOwner {
        if (teller_ == address(0)) revert ZeroAddress();
        teller = ITeller(teller_);
        emit TellerSet(teller_);
    }

    /// @notice Converts this contract's USDC balance into USYC.
    function usdcToUsyc(uint256 amount, address receiver) external onlyOperator returns (uint256 usycPurchased) {
        if (receiver == address(0)) revert ZeroAddress();

        usdc.forceApprove(address(teller), amount);
        usycPurchased = teller.deposit(amount, receiver);

        emit UsdcToUsyc(msg.sender, amount, usycPurchased, receiver);
    }

    /// @notice Redeems this contract's USYC balance into USDC and sends the proceeds to the receiver.
    function usycToUsdc(uint256 shares, address receiver) external onlyOperator returns (uint256 usdcPayout) {
        if (receiver == address(0)) revert ZeroAddress();

        usyc.forceApprove(address(teller), shares);
        usdcPayout = teller.redeem(shares, receiver, address(this));

        emit UsycToUsdc(msg.sender, shares, usdcPayout, receiver);
    }

    function rescueToken(address token, address to, uint256 amount) external onlyOwner {
        if (token == address(0) || to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
    }
}
