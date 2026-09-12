// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PermissionGateFactory} from "../src/PermissionGateFactory.sol";

/// Deploys PermissionGateFactory against the real, canonical ERC-8004 IdentityRegistry on
/// Sepolia (see docs/deployments.json -- independently verified live on Blockscout).
contract DeployFactory is Script {
    address constant IDENTITY_REGISTRY = 0x8004A818BFB912233c491871b3d84c89A494BD9e;

    function run() external returns (address factory) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);
        factory = address(new PermissionGateFactory(IDENTITY_REGISTRY));
        vm.stopBroadcast();

        console.log("PermissionGateFactory deployed at:", factory);
    }
}
