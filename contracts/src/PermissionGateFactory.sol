// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PermissionGate} from "./PermissionGate.sol";

/// @dev Adapter8004's real ownership check for an ERC-8004 identity it bound to an
/// external token (e.g. an ENS subname) -- NOT IdentityRegistry.isAuthorizedOrOwner, which
/// only reflects true ownership for identities registered directly against the identity
/// registry itself. For an adapter-bound identity, IdentityRegistry.ownerOf/isAuthorizedOrOwner
/// resolve to the adapter contract, not the real backing owner -- confirmed against real
/// Sepolia state for a known-good agent before shipping this, not assumed (see
/// docs/self-serve-registration.md).
interface IAdapter8004View {
    function isController(uint256 agentId, address account) external view returns (bool);
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
    address public immutable agentAdapter8004;

    event GateDeployed(
        address indexed gate, uint256 indexed agentId, address indexed approver, address operator, string domainName
    );

    error NotAgentOwner();

    constructor(address _agentIdentityRegistry, address _agentAdapter8004) {
        agentIdentityRegistry = _agentIdentityRegistry;
        agentAdapter8004 = _agentAdapter8004;
    }

    /// @notice Deploy a new PermissionGate for `agentId`, reverting unless the caller
    /// genuinely controls that agent per Adapter8004 -- without this check, anyone could
    /// deploy a gate falsely claiming to protect an agent they don't own, polluting
    /// downstream indexes with a fake gate for a real agent.
    function createGate(uint256 agentId, address approver, string calldata domainName) external returns (address gate) {
        if (!IAdapter8004View(agentAdapter8004).isController(agentId, msg.sender)) {
            revert NotAgentOwner();
        }
        gate = address(new PermissionGate(agentIdentityRegistry, msg.sender, approver, domainName, agentId));
        emit GateDeployed(gate, agentId, approver, msg.sender, domainName);
    }
}
