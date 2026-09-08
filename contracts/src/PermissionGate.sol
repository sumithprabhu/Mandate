// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC721Like} from "./interfaces/IERC721Like.sol";

/// @notice Gates ownership transfer and permission escalation for one ERC-8004 agent
/// behind a second, independent approval.
///
/// The gate must itself hold custody of the agent's identity NFT: the operator can only
/// *request* a transfer, never execute one directly, because the token lives here, not
/// with the operator. The same split applies to permission escalation -- the operator
/// proposes a call against the agent's resolver (or any configured target), and it is
/// only sent once the approver confirms it.
///
/// `approver` starts as a plain EOA so the request/approve/execute state machine can be
/// proven with two ordinary signatures (see test/PermissionGate.t.sol). Phase 2 swaps
/// nothing in this contract -- it points `approver` at an address whose key lives on a
/// Ledger and is only ever used through Clear Signing.
contract PermissionGate {
    enum ActionType {
        OwnershipTransfer,
        PermissionEscalation
    }

    enum Status {
        None,
        Pending,
        Rejected,
        Executed
    }

    struct PendingAction {
        ActionType actionType;
        address target; // NFT contract (ownership transfer) or arbitrary target (permission escalation)
        address newOwner; // ownership transfer only
        uint256 tokenId; // ownership transfer only
        bytes data; // permission escalation only
        address requestedBy;
        uint256 requestedAt;
        Status status;
    }

    address public immutable agentIdentityRegistry;
    address public operator;
    address public approver;

    uint256 public nextActionId;
    mapping(uint256 => PendingAction) private _actions;

    event OwnershipTransferRequested(
        uint256 indexed actionId, uint256 indexed tokenId, address indexed newOwner, address requestedBy
    );
    event PermissionEscalationRequested(
        uint256 indexed actionId, address indexed target, bytes data, address requestedBy
    );
    event ActionApproved(uint256 indexed actionId, address indexed approver);
    event ActionRejected(uint256 indexed actionId, address indexed approver);
    event ActionExecuted(uint256 indexed actionId);
    event ApproverUpdated(address indexed oldApprover, address indexed newApprover);

    error NotOperator();
    error NotApprover();
    error ActionNotPending();
    error ExecutionFailed();
    error ZeroAddress();

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    modifier onlyApprover() {
        if (msg.sender != approver) revert NotApprover();
        _;
    }

    constructor(address _agentIdentityRegistry, address _operator, address _approver) {
        if (_agentIdentityRegistry == address(0) || _operator == address(0) || _approver == address(0)) {
            revert ZeroAddress();
        }
        agentIdentityRegistry = _agentIdentityRegistry;
        operator = _operator;
        approver = _approver;
    }

    /// @notice Propose transferring the agent's identity NFT to a new owner. Blocked until `approve`.
    function requestOwnershipTransfer(uint256 tokenId, address newOwner) external onlyOperator returns (uint256 actionId) {
        if (newOwner == address(0)) revert ZeroAddress();
        actionId = nextActionId++;
        _actions[actionId] = PendingAction({
            actionType: ActionType.OwnershipTransfer,
            target: agentIdentityRegistry,
            newOwner: newOwner,
            tokenId: tokenId,
            data: "",
            requestedBy: msg.sender,
            requestedAt: block.timestamp,
            status: Status.Pending
        });
        emit OwnershipTransferRequested(actionId, tokenId, newOwner, msg.sender);
    }

    /// @notice Propose an arbitrary call against `target` (e.g. the agent's resolver, to
    /// raise its capability manifest). Blocked until `approve`.
    function requestPermissionEscalation(address target, bytes calldata data)
        external
        onlyOperator
        returns (uint256 actionId)
    {
        if (target == address(0)) revert ZeroAddress();
        actionId = nextActionId++;
        _actions[actionId] = PendingAction({
            actionType: ActionType.PermissionEscalation,
            target: target,
            newOwner: address(0),
            tokenId: 0,
            data: data,
            requestedBy: msg.sender,
            requestedAt: block.timestamp,
            status: Status.Pending
        });
        emit PermissionEscalationRequested(actionId, target, data, msg.sender);
    }

    /// @notice Confirm and immediately execute a pending action. Phase 2: sent only via
    /// Ledger Clear Signing, so the human sees this exact call on the device screen.
    function approve(uint256 actionId) external onlyApprover {
        PendingAction storage action = _actions[actionId];
        if (action.status != Status.Pending) revert ActionNotPending();

        if (action.actionType == ActionType.OwnershipTransfer) {
            IERC721Like(action.target).safeTransferFrom(address(this), action.newOwner, action.tokenId);
        } else {
            (bool ok,) = action.target.call(action.data);
            if (!ok) revert ExecutionFailed();
        }

        action.status = Status.Executed;
        emit ActionApproved(actionId, msg.sender);
        emit ActionExecuted(actionId);
    }

    function reject(uint256 actionId) external onlyApprover {
        PendingAction storage action = _actions[actionId];
        if (action.status != Status.Pending) revert ActionNotPending();
        action.status = Status.Rejected;
        emit ActionRejected(actionId, msg.sender);
    }

    function setApprover(address newApprover) external onlyApprover {
        if (newApprover == address(0)) revert ZeroAddress();
        emit ApproverUpdated(approver, newApprover);
        approver = newApprover;
    }

    function getAction(uint256 actionId) external view returns (PendingAction memory) {
        return _actions[actionId];
    }

    /// @dev Lets the gate receive the agent's identity NFT via safeTransferFrom.
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
