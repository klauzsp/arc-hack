// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Rebalance {
    function allocateUsyc(address _usyc, address _to, uint256 _amount) external {
        IERC20(_usyc).transfer(_to, _amount);
    }

    function redeemUsyc(address _usyc, address _from, uint256 _amount) external {
        IERC20(_usyc).transferFrom(_from, address(this), _amount);
    }
}

