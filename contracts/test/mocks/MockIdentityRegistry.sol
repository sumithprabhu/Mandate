// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal stand-in for Adapter8004's real ownership-check surface (isController),
/// just enough for PermissionGateFactory's tests. Not spec-complete.
contract MockIdentityRegistry {
    mapping(uint256 => address) public ownerOf;

    function setOwner(uint256 agentId, address owner) external {
        ownerOf[agentId] = owner;
    }

    function isController(uint256 agentId, address account) external view returns (bool) {
        return ownerOf[agentId] == account;
    }
}
