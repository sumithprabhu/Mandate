// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PermissionGate} from "../src/PermissionGate.sol";
import {PermissionGateFactory} from "../src/PermissionGateFactory.sol";
import {MockIdentityRegistry} from "./mocks/MockIdentityRegistry.sol";

contract PermissionGateFactoryTest is Test {
    PermissionGateFactory factory;
    MockIdentityRegistry registry;

    address alice = makeAddr("alice");
    address aliceApprover = makeAddr("aliceApprover");
    address bob = makeAddr("bob");
    address bobApprover = makeAddr("bobApprover");

    uint256 constant ALICE_AGENT_ID = 1;
    uint256 constant BOB_AGENT_ID = 2;

    function setUp() public {
        registry = new MockIdentityRegistry();
        factory = new PermissionGateFactory(address(registry));
        registry.setOwner(ALICE_AGENT_ID, alice);
        registry.setOwner(BOB_AGENT_ID, bob);
    }

    function test_createGate_revertsIfCallerDoesNotOwnAgent() public {
        vm.prank(bob);
        vm.expectRevert(PermissionGateFactory.NotAgentOwner.selector);
        factory.createGate(ALICE_AGENT_ID, bobApprover, "Bob's Gate");
    }

    function test_createGate_setsOperatorAndApproverAndAgentId() public {
        vm.prank(alice);
        address gateAddr = factory.createGate(ALICE_AGENT_ID, aliceApprover, "Alice's Gate");
        PermissionGate gate = PermissionGate(gateAddr);

        assertEq(gate.operator(), alice);
        assertEq(gate.approver(), aliceApprover);
        assertEq(gate.agentId(), ALICE_AGENT_ID);
    }

    function test_createGate_emitsGateDeployed() public {
        vm.prank(alice);
        vm.expectEmit(false, true, true, true);
        emit PermissionGateFactory.GateDeployed(address(0), ALICE_AGENT_ID, aliceApprover, alice, "Alice's Gate");
        factory.createGate(ALICE_AGENT_ID, aliceApprover, "Alice's Gate");
    }

    /// Two gates deployed by the same factory for two different agents must not share any
    /// state -- independent operators, approvers, and action-id counters.
    function test_createGate_independentGatesDoNotInterfere() public {
        vm.prank(alice);
        address aliceGateAddr = factory.createGate(ALICE_AGENT_ID, aliceApprover, "Alice's Gate");
        vm.prank(bob);
        address bobGateAddr = factory.createGate(BOB_AGENT_ID, bobApprover, "Bob's Gate");

        PermissionGate aliceGate = PermissionGate(aliceGateAddr);
        PermissionGate bobGate = PermissionGate(bobGateAddr);

        assertTrue(aliceGateAddr != bobGateAddr);
        assertEq(aliceGate.operator(), alice);
        assertEq(bobGate.operator(), bob);
        assertEq(aliceGate.approver(), aliceApprover);
        assertEq(bobGate.approver(), bobApprover);

        // Bob's operator role has no power over Alice's gate.
        vm.prank(bob);
        vm.expectRevert(PermissionGate.NotOperator.selector);
        aliceGate.requestPermissionEscalation(makeAddr("someTarget"), "");

        // Alice acting on her own gate doesn't touch Bob's action counter.
        vm.prank(alice);
        aliceGate.requestPermissionEscalation(makeAddr("someTarget"), "");
        assertEq(aliceGate.nextActionId(), 1);
        assertEq(bobGate.nextActionId(), 0);
    }
}
