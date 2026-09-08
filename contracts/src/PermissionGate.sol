// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Gates ownership transfer and permission escalation for one ERC-8004 agent
/// behind a second, independent approval.
///
/// The gate must itself hold custody of the agent's identity token: the operator can only
/// *request* a transfer, never execute one directly, because the token lives here, not
/// with the operator. The same split applies to permission escalation -- the operator
/// proposes a call against the agent's resolver (or any configured target), and it is
/// only sent once the approver confirms it.
///
/// Both action types execute as a plain `target.call(data)` chosen by the operator at
/// request time, with `data` shown to the approver in full before it signs -- there is no
/// interface assumption baked in here (an ERC-8004 identity's real "ownership" token lives
/// in an ENSv2 registry, which is ERC-1155-shaped (5-arg `safeTransferFrom`), not the
/// 3-arg ERC-721 shape an earlier version of this contract assumed and never actually
/// exercised against a real registry). The operator is trusted to construct calldata that
/// matches whatever registry/resolver is actually in play; the approver is the backstop
/// that reviews exactly what it's signing before anything executes.
///
/// `approver` starts as a plain EOA so the request/approve/execute state machine can be
/// proven with two ordinary signatures (see test/PermissionGate.t.sol).
///
/// Approval happens one of two ways: a direct `approve()` call from `approver` (pays its
/// own gas), or `approveWithSignature()`, which accepts an EIP-712 signature over the
/// action and lets anyone relay it on chain. The Ledger-controlled approver never needs
/// its own gas -- it signs the typed-data struct (which the Ethereum app displays as
/// plain domain/field text, no calldata descriptor needed), and the operator relays it.
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
        address target;
        bytes data; // the exact call made on approval -- this is what the approver signs off on
        address newOwner; // ownership transfer only, for indexing; address(0) for permission escalation
        uint256 tokenId; // ownership transfer only, for indexing; 0 for permission escalation
        address requestedBy;
        uint256 requestedAt;
        Status status;
    }

    /// @dev Informational only -- not enforced as a restriction on `target`. See the
    /// contract-level note on why ownership transfer calldata is operator-supplied rather
    /// than assumed.
    address public immutable agentIdentityRegistry;
    address public operator;
    address public approver;

    /// @dev EIP-712 domain separator, bound to this contract + chain so a signature can't
    /// be replayed against a different deployment or network.
    bytes32 public immutable DOMAIN_SEPARATOR;
    bytes32 public constant APPROVAL_TYPEHASH = keccak256("Approval(uint256 actionId)");

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
    error InvalidSignatureLength();
    error InvalidSignature();

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

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("AgentNS PermissionGate")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    /// @notice Propose transferring the agent's identity token to a new owner. `registry` is
    /// the token contract and `transferCalldata` is the exact call to make against it on
    /// approval (e.g. a 5-arg ERC-1155 `safeTransferFrom` for an ENSv2 registry token, or a
    /// 3-arg ERC-721 `safeTransferFrom` for a plain NFT) -- the operator is responsible for
    /// constructing calldata that matches the registry actually holding the token; `tokenId`
    /// and `newOwner` are recorded purely for event indexing. Blocked until `approve`.
    function requestOwnershipTransfer(address registry, uint256 tokenId, address newOwner, bytes calldata transferCalldata)
        external
        onlyOperator
        returns (uint256 actionId)
    {
        if (registry == address(0) || newOwner == address(0)) revert ZeroAddress();
        actionId = nextActionId++;
        _actions[actionId] = PendingAction({
            actionType: ActionType.OwnershipTransfer,
            target: registry,
            data: transferCalldata,
            newOwner: newOwner,
            tokenId: tokenId,
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
            data: data,
            newOwner: address(0),
            tokenId: 0,
            requestedBy: msg.sender,
            requestedAt: block.timestamp,
            status: Status.Pending
        });
        emit PermissionEscalationRequested(actionId, target, data, msg.sender);
    }

    /// @notice Confirm and immediately execute a pending action, paid for by the approver.
    function approve(uint256 actionId) external onlyApprover {
        _approveAndExecute(actionId, msg.sender);
    }

    /// @notice Confirm and execute a pending action using an EIP-712 signature from the
    /// approver, relayed by anyone (typically the operator, who pays gas). This is the
    /// path a Ledger-controlled approver uses: it signs the typed-data struct offline via
    /// Clear Signing and never needs its own ETH.
    function approveWithSignature(uint256 actionId, bytes calldata signature) external {
        bytes32 structHash = keccak256(abi.encode(APPROVAL_TYPEHASH, actionId));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
        address signer = _recoverSigner(digest, signature);
        if (signer != approver) revert NotApprover();
        _approveAndExecute(actionId, signer);
    }

    function _approveAndExecute(uint256 actionId, address approvedBy) internal {
        PendingAction storage action = _actions[actionId];
        if (action.status != Status.Pending) revert ActionNotPending();

        (bool ok,) = action.target.call(action.data);
        if (!ok) revert ExecutionFailed();

        action.status = Status.Executed;
        emit ActionApproved(actionId, approvedBy);
        emit ActionExecuted(actionId);
    }

    function _recoverSigner(bytes32 digest, bytes calldata signature) internal pure returns (address) {
        if (signature.length != 65) revert InvalidSignatureLength();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        address signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
        return signer;
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

    /// @dev Lets the gate receive an ERC-721-shaped identity token via safeTransferFrom.
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    /// @dev Lets the gate receive an ERC-1155-shaped identity token (e.g. an ENSv2 registry
    /// token) via safeTransferFrom -- the shape our real agent registration actually uses.
    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return this.onERC1155BatchReceived.selector;
    }
}
