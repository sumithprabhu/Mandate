// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal ERC-721-shaped stand-in for the ERC-8004 IdentityRegistry, just
/// enough surface for PermissionGate's tests (mint / ownerOf / safeTransferFrom with
/// an onERC721Received callback). Not a spec-complete ERC-721.
contract MockAgentNFT {
    mapping(uint256 => address) public ownerOf_;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    function mint(address to, uint256 tokenId) external {
        require(ownerOf_[tokenId] == address(0), "already minted");
        ownerOf_[tokenId] = to;
        emit Transfer(address(0), to, tokenId);
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        return ownerOf_[tokenId];
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        require(ownerOf_[tokenId] == from, "not owner");
        ownerOf_[tokenId] = to;
        emit Transfer(from, to, tokenId);

        if (to.code.length > 0) {
            bytes4 selector =
                IERC721ReceiverLike(to).onERC721Received(msg.sender, from, tokenId, "");
            require(selector == IERC721ReceiverLike.onERC721Received.selector, "receiver rejected");
        }
    }
}

interface IERC721ReceiverLike {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data)
        external
        returns (bytes4);
}
