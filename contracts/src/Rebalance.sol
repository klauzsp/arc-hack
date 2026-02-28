// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ITeller {
    function deposit(uint256 _assets, address _receiver) external returns (uint256);
    function redeem(uint256 _shares, address _receiver, address _account) external returns (uint256);
}

contract Rebalance {
    ITeller teller = ITeller(0x96424C885951ceb4B79fecb934eD857999e6f82B);
    IERC20 usdc = IERC20(0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238);
    IERC20 usyc = IERC20(0x38D3A3f8717F4DB1CcB4Ad7D8C755919440848A3);

    event UsdcToUsyc(uint256 usdcAmount, uint256 usycAmount);
    event UsycToUsdc(uint256 usdcAmount, uint256 usycAmount);

    function usdcToUsyc(address _usyc, address _to, uint256 _amount) external returns (uint256) {
        usdc.approve(address(teller), _amount);
        IERC20(_usyc).transfer(_to, _amount);
        uint256 usycPurchased = teller.deposit(_amount, address(this));

        emit UsdcToUsyc(_amount, usycPurchased);
        return usycPurchased;
    }

    function usycToUsdc(uint256 _amount) external returns (uint256) {
        uint256 usdcPayout = teller.redeem(_amount, address(this), address(this));
        emit UsycToUsdc(usdcPayout, _amount);
        return usdcPayout;
    }
}

