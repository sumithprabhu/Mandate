// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal stand-in for the ERC-8004 IdentityRegistry's ownership-check surface,
/// just enough for PermissionGateFactory's tests (isAuthorizedOrOwner). Not spec-complete.
contract MockIdentityRegistry {
    mapping(uint256 => address) public ownerOf;

    function setOwner(uint256 agentId, address owner) external {
        ownerOf[agentId] = owner;
    }

    function isAuthorizedOrOwner(address spender, uint256 agentId) external view returns (bool) {
        return ownerOf[agentId] == spender;
    }
}
