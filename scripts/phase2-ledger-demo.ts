// Phase 2 demo: deploys PermissionGate to Sepolia, deploys a fresh resolver that only the
// gate can write to, has the operator request a permission escalation, has the
// approver (a throwaway keypair standing in for the future Ledger key -- see
// docs/ledger-integration.md) sign an EIP-712 approval completely offline with zero ETH,
// and has the operator relay it on chain. This proves the exact mechanism Phase 2 needs;
// the only thing left for real hardware is swapping the local-key signature for
// SignerEth.signTypedData() over the same {domain, types, message}, per
// docs/ledger-integration.md.
//
// Usage: cd scripts && npx tsx phase2-ledger-demo.ts

import { config as loadEnv } from "dotenv";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  encodeFunctionData,
  keccak256,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(__dirname, "..", "contracts", ".env") });

const deployments = JSON.parse(
  readFileSync(path.join(__dirname, "..", "docs", "deployments.json"), "utf8")
);
const registered = JSON.parse(
  readFileSync(path.join(__dirname, "..", "docs", "registered-agents.json"), "utf8")
);
const HK = deployments.ensv2.hackathon as Record<string, string>;

const gateArtifact = JSON.parse(
  readFileSync(path.join(__dirname, "..", "contracts", "out", "PermissionGate.sol", "PermissionGate.json"), "utf8")
);

const ROLE_SET_ADDRESS = 1n << 0n;
const ROLE_SET_TEXT = 1n << 4n;
const RESOLVER_ROLES_FOR_GATE = ROLE_SET_ADDRESS | ROLE_SET_TEXT;

const factoryAbi = parseAbi([
  "function deployProxy(address implementation, uint256 salt, bytes data) returns (address)",
]);
const resolverInitAbi = parseAbi([
  "function initialize((address account, uint256 roleBitmap)[] grants, bytes[] calls)",
]);
const resolverWriteAbi = parseAbi(["function setText(bytes name, string key, string value)"]);

function dnsEncode(name: string): Hex {
  const labels = name.split(".");
  let out = "";
  for (const label of labels) {
    out += label.length.toString(16).padStart(2, "0") + Buffer.from(label).toString("hex");
  }
  return `0x${out}00` as Hex;
}

async function main() {
  const operatorPk = process.env.DEPLOYER_PRIVATE_KEY as Hex;
  const approverPk = process.env.LEDGER_STANDIN_PRIVATE_KEY as Hex;
  if (!operatorPk || !approverPk) throw new Error("DEPLOYER_PRIVATE_KEY / LEDGER_STANDIN_PRIVATE_KEY missing in contracts/.env");

  const operator = privateKeyToAccount(operatorPk);
  const approver = privateKeyToAccount(approverPk);

  const rpcUrl = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
  const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
  const operatorClient = createWalletClient({ account: operator, chain: sepolia, transport: http(rpcUrl) });

  console.log(`Operator (funded, relays everything): ${operator.address}`);
  console.log(`Approver (throwaway, Ledger stand-in, ZERO ETH by design): ${approver.address}`);
  const approverBalance = await publicClient.getBalance({ address: approver.address });
  console.log(`Approver balance: ${approverBalance} wei (must be 0 -- it never pays gas)\n`);

  // --- Step 1: deploy PermissionGate ---
  console.log("Step 1/5: deploying PermissionGate...");
  const deployHash = await operatorClient.deployContract({
    abi: gateArtifact.abi,
    bytecode: gateArtifact.bytecode.object as Hex,
    args: [registered.subregistry.address as Address, operator.address, approver.address],
  });
  const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
  const gateAddress = deployReceipt.contractAddress as Address;
  console.log(`  PermissionGate deployed: ${gateAddress} (tx ${deployHash})`);

  // --- Step 2: deploy a resolver that ONLY the gate can write to ---
  console.log("Step 2/5: deploying a resolver writable only by the gate...");
  const salt = BigInt(keccak256(toHex(`${gateAddress}-phase2-demo-resolver-v1`)));
  const initData = encodeFunctionData({
    abi: resolverInitAbi,
    functionName: "initialize",
    args: [[{ account: gateAddress, roleBitmap: RESOLVER_ROLES_FOR_GATE }], []],
  });
  const sim = await publicClient.simulateContract({
    account: operator,
    address: HK.resolverFactory as Address,
    abi: factoryAbi,
    functionName: "deployProxy",
    args: [HK.resolverImplementation as Address, salt, initData],
  });
  const resolverHash = await operatorClient.writeContract(sim.request);
  const resolverReceipt = await publicClient.waitForTransactionReceipt({ hash: resolverHash });
  const gatedResolver = sim.result as Address;
  console.log(`  gated resolver deployed: ${gatedResolver} (tx ${resolverReceipt.transactionHash})`);
  console.log(`  (the operator wallet itself has NO write role here -- only the gate does)`);

  // --- Step 3: operator requests a permission escalation ---
  console.log("Step 3/5: operator requests permission escalation (blocked pending approval)...");
  const dnsName = dnsEncode(registered.testAgent.name);
  const setTextData = encodeFunctionData({
    abi: resolverWriteAbi,
    functionName: "setText",
    args: [dnsName, "agentns:ledger-gated", "true"],
  });
  const gateAbi = gateArtifact.abi;
  const requestSim = await publicClient.simulateContract({
    account: operator,
    address: gateAddress,
    abi: gateAbi,
    functionName: "requestPermissionEscalation",
    args: [gatedResolver, setTextData],
  });
  const requestHash = await operatorClient.writeContract(requestSim.request);
  await publicClient.waitForTransactionReceipt({ hash: requestHash });
  const actionId = requestSim.result as bigint;
  console.log(`  requested, actionId=${actionId} (tx ${requestHash}) -- PENDING, nothing written yet`);

  // --- Step 4: approver signs EIP-712 approval completely offline, zero gas ---
  console.log("Step 4/5: approver signs EIP-712 approval offline (this is exactly what SignerEth.signTypedData would produce on real hardware)...");
  const signature = await approver.signTypedData({
    domain: {
      name: "AgentNS PermissionGate",
      version: "1",
      chainId: sepolia.id,
      verifyingContract: gateAddress,
    },
    types: {
      Approval: [{ name: "actionId", type: "uint256" }],
    },
    primaryType: "Approval",
    message: { actionId },
  });
  console.log(`  signed (${signature.slice(0, 20)}...) -- approver never sent a transaction or held ETH`);

  // --- Step 5: operator relays the signature on chain ---
  console.log("Step 5/5: operator relays the signature on chain...");
  const relaySim = await publicClient.simulateContract({
    account: operator,
    address: gateAddress,
    abi: gateAbi,
    functionName: "approveWithSignature",
    args: [actionId, signature],
  });
  const relayHash = await operatorClient.writeContract(relaySim.request);
  const relayReceipt = await publicClient.waitForTransactionReceipt({ hash: relayHash });
  console.log(`  relayed (tx ${relayReceipt.transactionHash}) -- resolver record now written`);

  console.log("\nDone.");
  console.log(`  PermissionGate: ${gateAddress}`);
  console.log(`  gated resolver: ${gatedResolver}`);
  console.log(`  actionId: ${actionId}`);
  console.log(`\nSwap-in for real hardware: replace the approver.signTypedData(...) call above with`);
  console.log(`SignerEth.signTypedData(derivationPath, sameTypedData, {skipOpenApp}) from`);
  console.log(`@ledgerhq/device-signer-kit-ethereum -- identical {domain, types, message}, see docs/ledger-integration.md.`);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
