// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal ERC-1155-shaped stand-in for a real ENSv2 registry token -- the actual
/// shape PermissionGate's ownership-transfer path has to work against (5-arg
/// safeTransferFrom, not the 3-arg ERC-721 shape). Not a spec-complete ERC-1155.
contract MockAgent1155 {
    mapping(uint256 => address) public ownerOf_;

    event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value);

    function mint(address to, uint256 tokenId) external {
        require(ownerOf_[tokenId] == address(0), "already minted");
        ownerOf_[tokenId] = to;
        emit TransferSingle(msg.sender, address(0), to, tokenId, 1);
    }

    function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes calldata data) external {
        require(ownerOf_[id] == from, "not owner");
        require(value == 1, "bad value");
        ownerOf_[id] = to;
        emit TransferSingle(msg.sender, from, to, id, value);

        if (to.code.length > 0) {
            bytes4 selector =
                IERC1155ReceiverLike(to).onERC1155Received(msg.sender, from, id, value, data);
            require(selector == IERC1155ReceiverLike.onERC1155Received.selector, "receiver rejected");
        }
    }
}

interface IERC1155ReceiverLike {
    function onERC1155Received(address operator, address from, uint256 id, uint256 value, bytes calldata data)
        external
        returns (bytes4);
}
