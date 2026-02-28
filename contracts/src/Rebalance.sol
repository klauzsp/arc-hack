// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface ITeller {
    function deposit(uint256 _assets, address _receiver) external returns (uint256);
    function redeem(uint256 _shares, address _receiver, address _account) external returns (uint256);
}

contract Rebalance {
    using SafeERC20 for IERC20;

    ITeller public teller;
    IERC20  public usdc;
    IERC20  public usyc;

    address public usycWhitelistedAddress;
    address public keeper;   // backend/keeper EOA that can also trigger rebalance

    event UsdcToUsyc(uint256 usdcAmount, uint256 usycAmount);
    event UsycToUsdc(uint256 usdcAmount, uint256 usycAmount);
    event KeeperUpdated(address indexed newKeeper);

    modifier onlyWhitelistedOrKeeper() {
        require(
            msg.sender == usycWhitelistedAddress || msg.sender == keeper,
            "Not authorised"
        );
        _;
    }

    constructor(address _usdc, address _usyc, address _teller, address _whitelisted) {
        usdc = IERC20(_usdc);
        usyc = IERC20(_usyc);
        teller = ITeller(_teller);
        usycWhitelistedAddress = _whitelisted;
    }

    function setKeeper(address _keeper) external {
        require(msg.sender == usycWhitelistedAddress, "Only whitelisted");
        keeper = _keeper;
        emit KeeperUpdated(_keeper);
    }

    function usdcToWhitelisted(uint256 _amount) external onlyWhitelistedOrKeeper {
        usdc.approve(usycWhitelistedAddress, _amount);
        usdc.safeTransfer(usycWhitelistedAddress, _amount);
    }

    function usdcToUsyc(uint256 _amount) external onlyWhitelistedOrKeeper returns (uint256) {
        usdc.approve(address(teller), _amount);
        uint256 usycPurchased = teller.deposit(_amount, usycWhitelistedAddress);
        emit UsdcToUsyc(_amount, usycPurchased);
        return usycPurchased;
    }

    function usycToUsdc(uint256 _amount) external onlyWhitelistedOrKeeper returns (uint256) {
        uint256 usdcPayout = teller.redeem(_amount, address(this), msg.sender);
        emit UsycToUsdc(usdcPayout, _amount);
        return usdcPayout;
    }

    /**
     * @notice Transfer USDC held by this contract to a target (e.g. Core treasury).
     */
    function transferUsdc(address to, uint256 amount) external onlyWhitelistedOrKeeper {
        usdc.safeTransfer(to, amount);
    }
}

