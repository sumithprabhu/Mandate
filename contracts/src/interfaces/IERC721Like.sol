// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal ERC-721 surface the gate needs from the ERC-8004 IdentityRegistry.
interface IERC721Like {
    function ownerOf(uint256 tokenId) external view returns (address);
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
}
