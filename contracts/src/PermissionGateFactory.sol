// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PermissionGate} from "./PermissionGate.sol";

interface IIdentityRegistryView {
    function isAuthorizedOrOwner(address spender, uint256 agentId) external view returns (bool);
}

/// @notice Deploys one PermissionGate per agent, with the caller as its own operator and a
/// caller-chosen approver -- self-serve, non-custodial registration instead of one shared
/// gate under a single backend-held operator key.
///
/// The caller becomes the gate's `operator` (whoever registers proposes their own agent's
/// changes) and separately names an `approver` (typically a hardware wallet they also
/// control). Two different keys held by the same person is the actual security property
/// here -- a compromised hot wallet alone still can't move the agent.
contract PermissionGateFactory {
    address public immutable agentIdentityRegistry;

    event GateDeployed(
        address indexed gate, uint256 indexed agentId, address indexed approver, address operator, string domainName
    );

    error NotAgentOwner();

    constructor(address _agentIdentityRegistry) {
        agentIdentityRegistry = _agentIdentityRegistry;
    }

    /// @notice Deploy a new PermissionGate for `agentId`, reverting unless the caller is
    /// that agent's registered owner or an authorized operator on the identity registry --
    /// without this check, anyone could deploy a gate falsely claiming to protect an agent
    /// they don't own, polluting downstream indexes with a fake gate for a real agent.
    function createGate(uint256 agentId, address approver, string calldata domainName) external returns (address gate) {
        if (!IIdentityRegistryView(agentIdentityRegistry).isAuthorizedOrOwner(msg.sender, agentId)) {
            revert NotAgentOwner();
        }
        gate = address(new PermissionGate(agentIdentityRegistry, msg.sender, approver, domainName, agentId));
        emit GateDeployed(gate, agentId, approver, msg.sender, domainName);
    }
}
