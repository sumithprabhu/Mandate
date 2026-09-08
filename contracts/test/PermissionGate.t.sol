// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PermissionGate} from "../src/PermissionGate.sol";
import {MockAgentNFT} from "./mocks/MockAgentNFT.sol";
import {MockResolver} from "./mocks/MockResolver.sol";

contract PermissionGateTest is Test {
    PermissionGate gate;
    MockAgentNFT nft;
    MockResolver resolver;

    address operator = makeAddr("operator");
    address approver = makeAddr("approver"); // stands in for the Ledger key until Phase 2
    address attacker = makeAddr("attacker");
    address newOwner = makeAddr("newOwner");

    uint256 constant TOKEN_ID = 1;

    function setUp() public {
        nft = new MockAgentNFT();
        resolver = new MockResolver();
        gate = new PermissionGate(address(nft), operator, approver);

        // The agent's identity NFT lives with the gate, not the operator -- that's the point.
        nft.mint(address(gate), TOKEN_ID);
    }

    // --- ownership transfer ---

    function test_ownershipTransfer_blockedUntilApproved() public {
        vm.prank(operator);
        uint256 actionId = gate.requestOwnershipTransfer(TOKEN_ID, newOwner);

        assertEq(nft.ownerOf(TOKEN_ID), address(gate), "must not move before approval");

        PermissionGate.PendingAction memory action = gate.getAction(actionId);
        assertEq(uint8(action.status), uint8(PermissionGate.Status.Pending));

        vm.prank(approver);
        gate.approve(actionId);

        assertEq(nft.ownerOf(TOKEN_ID), newOwner, "must move after approval");
        action = gate.getAction(actionId);
        assertEq(uint8(action.status), uint8(PermissionGate.Status.Executed));
    }

    function test_ownershipTransfer_rejected_neverExecutes() public {
        vm.prank(operator);
        uint256 actionId = gate.requestOwnershipTransfer(TOKEN_ID, newOwner);

        vm.prank(approver);
        gate.reject(actionId);

        assertEq(nft.ownerOf(TOKEN_ID), address(gate));

        vm.prank(approver);
        vm.expectRevert(PermissionGate.ActionNotPending.selector);
        gate.approve(actionId);
    }

    function test_ownershipTransfer_onlyOperatorCanRequest() public {
        vm.prank(attacker);
        vm.expectRevert(PermissionGate.NotOperator.selector);
        gate.requestOwnershipTransfer(TOKEN_ID, newOwner);
    }

    function test_ownershipTransfer_onlyApproverCanApprove() public {
        vm.prank(operator);
        uint256 actionId = gate.requestOwnershipTransfer(TOKEN_ID, newOwner);

        vm.prank(attacker);
        vm.expectRevert(PermissionGate.NotApprover.selector);
        gate.approve(actionId);

        // not even the operator who requested it can self-approve
        vm.prank(operator);
        vm.expectRevert(PermissionGate.NotApprover.selector);
        gate.approve(actionId);
    }

    function test_ownershipTransfer_emitsEvents() public {
        vm.prank(operator);
        vm.expectEmit(true, true, true, true);
        emit PermissionGate.OwnershipTransferRequested(0, TOKEN_ID, newOwner, operator);
        uint256 actionId = gate.requestOwnershipTransfer(TOKEN_ID, newOwner);

        vm.prank(approver);
        vm.expectEmit(true, true, false, false);
        emit PermissionGate.ActionApproved(actionId, approver);
        gate.approve(actionId);
    }

    // --- permission escalation ---

    function test_permissionEscalation_blockedUntilApproved() public {
        bytes memory data = abi.encodeCall(MockResolver.setRecord, ("capabilities", "trade,transfer"));

        vm.prank(operator);
        uint256 actionId = gate.requestPermissionEscalation(address(resolver), data);

        assertEq(resolver.records("capabilities"), "", "must not write before approval");

        vm.prank(approver);
        gate.approve(actionId);

        assertEq(resolver.records("capabilities"), "trade,transfer", "must write after approval");
    }

    function test_permissionEscalation_onlyOperatorCanRequest() public {
        bytes memory data = abi.encodeCall(MockResolver.setRecord, ("capabilities", "trade"));
        vm.prank(attacker);
        vm.expectRevert(PermissionGate.NotOperator.selector);
        gate.requestPermissionEscalation(address(resolver), data);
    }

    function test_permissionEscalation_revertedCallBubbles() public {
        // target a function selector that doesn't exist on the resolver
        bytes memory badData = abi.encodeWithSignature("thisFunctionDoesNotExist()");

        vm.prank(operator);
        uint256 actionId = gate.requestPermissionEscalation(address(resolver), badData);

        vm.prank(approver);
        vm.expectRevert(PermissionGate.ExecutionFailed.selector);
        gate.approve(actionId);
    }

    // --- approver rotation ---

    function test_setApprover_onlyCurrentApprover() public {
        address newApprover = makeAddr("newApprover");

        vm.prank(attacker);
        vm.expectRevert(PermissionGate.NotApprover.selector);
        gate.setApprover(newApprover);

        vm.prank(approver);
        gate.setApprover(newApprover);
        assertEq(gate.approver(), newApprover);

        // old approver is now powerless
        vm.prank(operator);
        uint256 actionId = gate.requestOwnershipTransfer(TOKEN_ID, newOwner);
        vm.prank(approver);
        vm.expectRevert(PermissionGate.NotApprover.selector);
        gate.approve(actionId);

        vm.prank(newApprover);
        gate.approve(actionId);
        assertEq(nft.ownerOf(TOKEN_ID), newOwner);
    }

    function test_constructor_rejectsZeroAddresses() public {
        vm.expectRevert(PermissionGate.ZeroAddress.selector);
        new PermissionGate(address(0), operator, approver);

        vm.expectRevert(PermissionGate.ZeroAddress.selector);
        new PermissionGate(address(nft), address(0), approver);

        vm.expectRevert(PermissionGate.ZeroAddress.selector);
        new PermissionGate(address(nft), operator, address(0));
    }
}
