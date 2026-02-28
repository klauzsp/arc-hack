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
    ITeller teller = ITeller(0x96424C885951ceb4B79fecb934eD857999e6f82B);
    IERC20 public usdc = IERC20(address(0x3600000000000000000000000000000000000000));
    IERC20 public usyc = IERC20(0x38D3A3f8717F4DB1CcB4Ad7D8C755919440848A3);
    address usycWhitelistedAddress = 0x13e00D9810d3C8Dc19A8C9A172fd9A8aC56e94e0;

    event UsdcToUsyc(uint256 usdcAmount, uint256 usycAmount);
    event UsycToUsdc(uint256 usdcAmount, uint256 usycAmount);

    // EOA calls allocate on this contact, which through viem calls teller, the EOA sends USDC and receives USYC.
    // EOA calls redeem on this contract, which through viem calls teller, the EOA sends USYC and receives USDC.

    function usdcToWhitelisted(uint256 _amount) external {
        require(msg.sender == usycWhitelistedAddress, "Only whitelisted address can call");
        usdc.approve(usycWhitelistedAddress, _amount);
        usdc.safeTransfer(usycWhitelistedAddress, _amount);
    }

    function usdcToUsyc(uint256 _amount) external returns (uint256) {
        require(msg.sender == usycWhitelistedAddress, "Only whitelisted address can deposit");
        usdc.approve(address(teller), _amount);
        uint256 usycPurchased = teller.deposit(_amount, usycWhitelistedAddress);

        emit UsdcToUsyc(_amount, usycPurchased);
        return usycPurchased;
    }

    function usycToUsdc(uint256 _amount) external returns (uint256) {
        require(msg.sender == usycWhitelistedAddress, "Only whitelisted address can redeem");
        uint256 usdcPayout = teller.redeem(_amount, address(this), msg.sender);
        emit UsycToUsdc(usdcPayout, _amount);
        return usdcPayout;
    }
}

