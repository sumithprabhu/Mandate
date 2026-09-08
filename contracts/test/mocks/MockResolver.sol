// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Stand-in for the agent's ENSv2 PermissionedResolver, just a settable text
/// record, enough to prove PermissionGate can gate an arbitrary write.
contract MockResolver {
    mapping(string => string) public records;

    event RecordSet(string key, string value, address setter);

    function setRecord(string calldata key, string calldata value) external {
        records[key] = value;
        emit RecordSet(key, value, msg.sender);
    }
}
