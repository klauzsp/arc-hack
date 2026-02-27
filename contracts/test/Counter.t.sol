// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Counter} from "../src/Counter.sol";

contract CounterTest is Test {
    Counter counter;

    function setUp() public {
        counter = new Counter();
    }

    function test_Increment() public {
        counter.increment();
        assertEq(counter.count(), 1);
    }

    function test_IncrementTwice() public {
        counter.increment();
        counter.increment();
        assertEq(counter.count(), 2);
    }

    function test_Reset() public {
        counter.increment();
        counter.reset();
        assertEq(counter.count(), 0);
    }
}
