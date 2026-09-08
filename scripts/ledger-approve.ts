// Signs a PermissionGate Approval(actionId) with a real Ledger device over USB (node-hid,
// no browser needed) and relays it on chain via the operator wallet. Structurally
// identical to phase2-ledger-demo.ts's Step 4-5, except the signature comes from real
// hardware Clear Signing instead of a throwaway local key.
//
// NOT YET RUN AGAINST REAL HARDWARE OR SPECULOS -- neither was available in the session
// that wrote this (no Docker installed, no physical device connected). The API calls below
// are transcribed from Ledger's own reference CLI (github.com/LedgerHQ/device-sdk-ts,
// apps/ldmk-cli), not guessed, but this exact file has not been executed. See
// docs/ledger-integration.md before running for the first time.
//
// Prerequisites: a Ledger device connected over USB, Ethereum app open, and its address
// (see `mm ensv2`-style derivation or SignerEth.getAddress) already set as the gate's
// `approver` via PermissionGate.setApprover(...).
//
// Usage: cd scripts && npx tsx ledger-approve.ts <permissionGateAddress> <actionId>

import { config as loadEnv } from "dotenv";
import { createPublicClient, createWalletClient, http, type Abi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { DeviceManagementKitBuilder } from "@ledgerhq/device-management-kit";
import { nodeHidTransportFactory } from "@ledgerhq/device-transport-kit-node-hid";
import { SignerEthBuilder } from "@ledgerhq/device-signer-kit-ethereum";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(__dirname, "..", "contracts", ".env") });

const DERIVATION_PATH = "44'/60'/0'/0/0";

const gateArtifact = JSON.parse(
  readFileSync(path.join(__dirname, "..", "contracts", "out", "PermissionGate.sol", "PermissionGate.json"), "utf8")
);

async function main() {
  const [gateAddressArg, actionIdArg] = process.argv.slice(2);
  if (!gateAddressArg || !actionIdArg) {
    throw new Error("Usage: npx tsx ledger-approve.ts <permissionGateAddress> <actionId>");
  }
  const gateAddress = gateAddressArg as Address;
  const actionId = BigInt(actionIdArg);

  const operatorPk = process.env.DEPLOYER_PRIVATE_KEY as Hex;
  if (!operatorPk) throw new Error("DEPLOYER_PRIVATE_KEY missing in contracts/.env");
  const operator = privateKeyToAccount(operatorPk);

  const rpcUrl = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
  const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
  const operatorClient = createWalletClient({ account: operator, chain: sepolia, transport: http(rpcUrl) });

  console.log("Connecting to Ledger over USB (node-hid)...");
  const dmk = new DeviceManagementKitBuilder().addTransport(nodeHidTransportFactory).build();

  const device = await new Promise<Parameters<typeof dmk.connect>[0]["device"]>((resolve, reject) => {
    const sub = dmk.listenToAvailableDevices({}).subscribe((devices) => {
      if (devices.length > 0) {
        sub.unsubscribe();
        resolve(devices[0]);
      }
    });
    setTimeout(() => {
      sub.unsubscribe();
      reject(new Error("No Ledger device found after 10s -- is it connected and unlocked?"));
    }, 10_000);
  });

  const sessionId = await dmk.connect({ device });
  console.log(`Connected, session ${sessionId}. Open the Ethereum app on the device if it isn't already.`);

  const signer = new SignerEthBuilder({ dmk, sessionId }).build();

  console.log(`\nRequesting address at ${DERIVATION_PATH} to confirm it matches the gate's approver...`);
  const { observable: addrObservable } = signer.getAddress(DERIVATION_PATH);
  const ledgerAddress = await new Promise<Address>((resolve, reject) => {
    addrObservable.subscribe({
      next: (state) => {
        if (state.status === "completed") resolve(state.output.address as Address);
      },
      error: reject,
    });
  });
  console.log(`Ledger address: ${ledgerAddress}`);

  // cast: viem's generic-Abi overload resolution mis-picks the EIP-7702 authorizationList
  // variant here; runtime call shape is correct (unaffected -- tsx doesn't type-check).
  const currentApprover = await publicClient.readContract({
    address: gateAddress,
    abi: gateArtifact.abi as Abi,
    functionName: "approver",
  } as Parameters<typeof publicClient.readContract>[0]);
  if ((currentApprover as string).toLowerCase() !== ledgerAddress.toLowerCase()) {
    throw new Error(
      `Gate's approver is ${currentApprover}, but this Ledger address is ${ledgerAddress}. ` +
        `Call PermissionGate.setApprover(${ledgerAddress}) first (from the current approver).`
    );
  }

  const typedData = {
    domain: {
      name: "AgentNS PermissionGate",
      version: "1",
      chainId: sepolia.id,
      verifyingContract: gateAddress,
    },
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      Approval: [{ name: "actionId", type: "uint256" }],
    },
    primaryType: "Approval" as const,
    message: { actionId: actionId.toString() },
  };

  console.log("\nSending to device for Clear Signing -- review the domain and actionId on screen, then confirm.");
  const { observable: signObservable } = signer.signTypedData(DERIVATION_PATH, typedData, { skipOpenApp: false });
  const signature = await new Promise<{ r: Hex; s: Hex; v: number }>((resolve, reject) => {
    signObservable.subscribe({
      next: (state) => {
        if (state.status === "pending" && state.intermediateValue?.requiredUserInteraction) {
          console.log(`  device: ${state.intermediateValue.requiredUserInteraction}`);
        }
        if (state.status === "completed") resolve(state.output);
        if (state.status === "error") reject(state.error);
      },
      error: reject,
    });
  });
  const packedSignature = `0x${signature.r.slice(2)}${signature.s.slice(2)}${signature.v.toString(16).padStart(2, "0")}` as Hex;
  console.log(`Signed on device: r=${signature.r} s=${signature.s} v=${signature.v}`);

  console.log("\nRelaying approveWithSignature() on chain via the operator wallet...");
  const sim = await publicClient.simulateContract({
    account: operator,
    address: gateAddress,
    abi: gateArtifact.abi as Abi,
    functionName: "approveWithSignature",
    args: [actionId, packedSignature],
  });
  const hash = await operatorClient.writeContract(sim.request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`Done. tx ${receipt.transactionHash}, status ${receipt.status}`);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
