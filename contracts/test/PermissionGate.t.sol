// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PermissionGate} from "../src/PermissionGate.sol";
import {MockAgentNFT} from "./mocks/MockAgentNFT.sol";
import {MockAgent1155} from "./mocks/MockAgent1155.sol";
import {MockResolver} from "./mocks/MockResolver.sol";

contract PermissionGateTest is Test {
    PermissionGate gate;
    MockAgentNFT nft;
    MockAgent1155 registry1155;
    MockResolver resolver;

    address operator = makeAddr("operator");
    address approver;
    uint256 approverPk; // stands in for the Ledger key: same signature-recovery path, different signer
    address attacker = makeAddr("attacker");
    address newOwner = makeAddr("newOwner");

    uint256 constant TOKEN_ID = 1;
    uint256 constant AGENT_ID = 42;

    function setUp() public {
        (approver, approverPk) = makeAddrAndKey("approver");
        nft = new MockAgentNFT();
        registry1155 = new MockAgent1155();
        resolver = new MockResolver();
        gate = new PermissionGate(address(nft), operator, approver, "Test PermissionGate", AGENT_ID);

        // The agent's identity NFT lives with the gate, not the operator -- that's the point.
        nft.mint(address(gate), TOKEN_ID);
        registry1155.mint(address(gate), TOKEN_ID);
    }

    function _signApproval(uint256 actionId, uint256 signerPk) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(gate.APPROVAL_TYPEHASH(), actionId));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", gate.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        return abi.encodePacked(r, s, v);
    }

    /// @dev Calldata for MockAgentNFT's 3-arg ERC-721-shaped safeTransferFrom, sent from the gate.
    function _nftTransferCalldata(address to, uint256 tokenId) internal view returns (bytes memory) {
        return abi.encodeWithSignature("safeTransferFrom(address,address,uint256)", address(gate), to, tokenId);
    }

    /// @dev Requests an ownership transfer of TOKEN_ID on the ERC-721-shaped mock -- the
    /// shape most of this suite exercises for brevity; test_ownershipTransfer_erc1155Shaped
    /// separately proves the 5-arg ERC-1155 shape our real agent registration actually uses.
    function _requestOwnershipTransfer() internal returns (uint256 actionId) {
        return gate.requestOwnershipTransfer(address(nft), TOKEN_ID, newOwner, _nftTransferCalldata(newOwner, TOKEN_ID));
    }

    // --- ownership transfer ---

    function test_ownershipTransfer_blockedUntilApproved() public {
        vm.prank(operator);
        uint256 actionId = _requestOwnershipTransfer();

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
        uint256 actionId = _requestOwnershipTransfer();

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
        _requestOwnershipTransfer();
    }

    function test_ownershipTransfer_onlyApproverCanApprove() public {
        vm.prank(operator);
        uint256 actionId = _requestOwnershipTransfer();

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
        uint256 actionId = _requestOwnershipTransfer();

        vm.prank(approver);
        vm.expectEmit(true, true, false, false);
        emit PermissionGate.ActionApproved(actionId, approver);
        gate.approve(actionId);
    }

    /// This is the shape our actual registered agent uses: its "ownership" token lives in
    /// an ENSv2 registry (ERC-1155-shaped, 5-arg safeTransferFrom), not a plain ERC-721.
    /// An earlier version of this contract only knew how to call the 3-arg ERC-721 shape
    /// and would have reverted against the real registry -- requestOwnershipTransfer now
    /// takes the exact calldata to run, so it works against either.
    function test_ownershipTransfer_erc1155Shaped() public {
        bytes memory transferCalldata =
            abi.encodeWithSignature("safeTransferFrom(address,address,uint256,uint256,bytes)", address(gate), newOwner, TOKEN_ID, uint256(1), bytes(""));

        vm.prank(operator);
        uint256 actionId = gate.requestOwnershipTransfer(address(registry1155), TOKEN_ID, newOwner, transferCalldata);

        assertEq(registry1155.ownerOf_(TOKEN_ID), address(gate), "must not move before approval");

        vm.prank(approver);
        gate.approve(actionId);

        assertEq(registry1155.ownerOf_(TOKEN_ID), newOwner, "must move after approval");
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

    // --- signature-based approval (the Ledger path: approver signs, anyone relays) ---

    function test_approveWithSignature_relayedByOperator() public {
        vm.prank(operator);
        uint256 actionId = _requestOwnershipTransfer();

        bytes memory sig = _signApproval(actionId, approverPk);

        // operator relays the approver's signature and pays the gas -- approver never
        // needed ETH or to send a transaction itself, only to produce this signature.
        vm.prank(operator);
        gate.approveWithSignature(actionId, sig);

        assertEq(nft.ownerOf(TOKEN_ID), newOwner);
        PermissionGate.PendingAction memory action = gate.getAction(actionId);
        assertEq(uint8(action.status), uint8(PermissionGate.Status.Executed));
    }

    function test_approveWithSignature_relayedByStranger() public {
        // relaying doesn't require any special role -- the signature is the authorization
        vm.prank(operator);
        uint256 actionId = _requestOwnershipTransfer();
        bytes memory sig = _signApproval(actionId, approverPk);

        vm.prank(attacker);
        gate.approveWithSignature(actionId, sig);

        assertEq(nft.ownerOf(TOKEN_ID), newOwner);
    }

    function test_approveWithSignature_rejectsWrongSigner() public {
        vm.prank(operator);
        uint256 actionId = _requestOwnershipTransfer();

        (, uint256 attackerPk) = makeAddrAndKey("attacker");
        bytes memory sig = _signApproval(actionId, attackerPk);

        vm.expectRevert(PermissionGate.NotApprover.selector);
        gate.approveWithSignature(actionId, sig);
    }

    function test_approveWithSignature_rejectsWrongActionId() public {
        vm.startPrank(operator);
        uint256 actionId = _requestOwnershipTransfer();
        uint256 otherActionId = gate.requestPermissionEscalation(address(resolver), "");
        vm.stopPrank();

        // signature is for `otherActionId`, submitted against `actionId`
        bytes memory sig = _signApproval(otherActionId, approverPk);

        vm.expectRevert(PermissionGate.NotApprover.selector);
        gate.approveWithSignature(actionId, sig);
    }

    function test_approveWithSignature_cannotReplayAfterExecution() public {
        vm.prank(operator);
        uint256 actionId = _requestOwnershipTransfer();
        bytes memory sig = _signApproval(actionId, approverPk);

        gate.approveWithSignature(actionId, sig);

        vm.expectRevert(PermissionGate.ActionNotPending.selector);
        gate.approveWithSignature(actionId, sig);
    }

    function test_approveWithSignature_rejectsMalformedSignature() public {
        vm.prank(operator);
        uint256 actionId = _requestOwnershipTransfer();

        vm.expectRevert(PermissionGate.InvalidSignatureLength.selector);
        gate.approveWithSignature(actionId, hex"deadbeef");
    }

    function test_approveWithSignature_permissionEscalation() public {
        bytes memory data = abi.encodeCall(MockResolver.setRecord, ("capabilities", "trade,transfer"));
        vm.prank(operator);
        uint256 actionId = gate.requestPermissionEscalation(address(resolver), data);

        bytes memory sig = _signApproval(actionId, approverPk);
        gate.approveWithSignature(actionId, sig);

        assertEq(resolver.records("capabilities"), "trade,transfer");
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
        uint256 actionId = _requestOwnershipTransfer();
        vm.prank(approver);
        vm.expectRevert(PermissionGate.NotApprover.selector);
        gate.approve(actionId);

        vm.prank(newApprover);
        gate.approve(actionId);
        assertEq(nft.ownerOf(TOKEN_ID), newOwner);
    }

    function test_constructor_rejectsZeroAddresses() public {
        vm.expectRevert(PermissionGate.ZeroAddress.selector);
        new PermissionGate(address(0), operator, approver, "Test PermissionGate", AGENT_ID);

        vm.expectRevert(PermissionGate.ZeroAddress.selector);
        new PermissionGate(address(nft), address(0), approver, "Test PermissionGate", AGENT_ID);

        vm.expectRevert(PermissionGate.ZeroAddress.selector);
        new PermissionGate(address(nft), operator, address(0), "Test PermissionGate", AGENT_ID);
    }

    function test_constructor_setsAgentId() public view {
        assertEq(gate.agentId(), AGENT_ID);
    }

    // --- self-target guard on permission escalation ---

    function test_permissionEscalation_rejectsSelfTarget() public {
        vm.prank(operator);
        vm.expectRevert(PermissionGate.SelfTargetNotAllowed.selector);
        gate.requestPermissionEscalation(address(gate), abi.encodeCall(PermissionGate.setApprover, (attacker)));
    }
}
