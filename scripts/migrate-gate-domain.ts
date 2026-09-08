// Deploys a correctly-branded PermissionGate ("Mandate PermissionGate" domain -- the
// previous gate's domain is stuck saying "AgentNS PermissionGate" because that string was
// hardcoded into its bytecode at deploy time, before PermissionGate.sol's constructor took
// a domainName parameter) and a resolver only the new gate can write to, then migrates
// agent1/agent2's custody there via the OLD gate's own request/approve flow (still fully
// functional on its own terms -- this doesn't touch the old gate's logic, just uses it one
// last time to hand off what it holds).
//
// Usage: cd scripts && npx tsx migrate-gate-domain.ts

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
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(__dirname, "..", "contracts", ".env") });

const deployments = JSON.parse(readFileSync(path.join(__dirname, "..", "docs", "deployments.json"), "utf8"));
const HK = deployments.ensv2.hackathon as Record<string, string>;
const gateArtifact = JSON.parse(readFileSync(path.join(__dirname, "..", "contracts", "out", "PermissionGate.sol", "PermissionGate.json"), "utf8"));

const OLD_GATE = "0x4c67fbc5ced0d417d418632b18e4cb328198dad2" as Address;
const SUBREGISTRY = "0xea6F52BB85cf5316ecFd9Fcbe562b4eF6fcCce9b" as Address;
const CHILDREN = {
  agent1: 12574331500417930745150951692014312166842720674563136141102103973686872637441n,
  agent2: 12914604233378511217194968470333727029220150315766677847302245112977196843008n,
};

const ROLE_SET_ADDRESS = 1n << 0n;
const ROLE_SET_TEXT = 1n << 4n;
const RESOLVER_ROLES_FOR_GATE = ROLE_SET_ADDRESS | ROLE_SET_TEXT;

const factoryAbi = parseAbi(["function deployProxy(address implementation, uint256 salt, bytes data) returns (address)"]);
const resolverInitAbi = parseAbi(["function initialize((address account, uint256 roleBitmap)[] grants, bytes[] calls)"]);
const resolverWriteAbi = parseAbi(["function setText(bytes name, string key, string value)"]);
const subregistryAbi = parseAbi(["function setResolver(uint256 tokenId, address resolver)", "function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes data)"]);
const oldGateAbi = parseAbi([
  "function requestPermissionEscalation(address target, bytes data) returns (uint256)",
  "function requestOwnershipTransfer(address registry, uint256 tokenId, address newOwner, bytes transferCalldata) returns (uint256)",
  "function approveWithSignature(uint256 actionId, bytes signature)",
]);

function dnsEncode(name: string): Hex {
  const labels = name.split(".");
  let out = "";
  for (const label of labels) out += label.length.toString(16).padStart(2, "0") + Buffer.from(label).toString("hex");
  return `0x${out}00` as Hex;
}

async function main() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY as Hex;
  const approverPk = process.env.LEDGER_STANDIN_PRIVATE_KEY as Hex;
  const account = privateKeyToAccount(pk);
  const approver = privateKeyToAccount(approverPk);
  const rpcUrl = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
  const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) });

  async function approveOldGateAction(actionId: bigint): Promise<Hex> {
    const typedData = {
      domain: { name: "AgentNS PermissionGate", version: "1", chainId: sepolia.id, verifyingContract: OLD_GATE },
      types: { Approval: [{ name: "actionId", type: "uint256" }] },
      primaryType: "Approval" as const,
      message: { actionId },
    };
    const signature = await approver.signTypedData(typedData);
    const sim = await publicClient.simulateContract({ account, address: OLD_GATE, abi: oldGateAbi, functionName: "approveWithSignature", args: [actionId, signature] });
    const hash = await walletClient.writeContract(sim.request);
    await publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  // --- Step 1: deploy correctly-branded gate ---
  console.log("Step 1: deploying gate with domain 'Mandate PermissionGate'...");
  let hash = await walletClient.deployContract({
    abi: gateArtifact.abi,
    bytecode: gateArtifact.bytecode.object as Hex,
    args: [SUBREGISTRY, account.address, approver.address, "Mandate PermissionGate"],
  });
  let receipt = await publicClient.waitForTransactionReceipt({ hash });
  const newGate = receipt.contractAddress as Address;
  console.log(`  new gate: ${newGate} (tx ${hash})`);

  // --- Step 2: deploy resolver only the new gate can write to ---
  const resSalt = BigInt(keccak256(toHex(`${account.address}-mandate-resolver-v2`)));
  const resInit = encodeFunctionData({ abi: resolverInitAbi, functionName: "initialize", args: [[{ account: newGate, roleBitmap: RESOLVER_ROLES_FOR_GATE }], []] });
  console.log("Step 2: deploying resolver for the new gate...");
  let sim = await publicClient.simulateContract({ account, address: HK.resolverFactory as Address, abi: factoryAbi, functionName: "deployProxy", args: [HK.resolverImplementation as Address, resSalt, resInit] });
  hash = await walletClient.writeContract(sim.request);
  await publicClient.waitForTransactionReceipt({ hash });
  const newResolver = sim.result as Address;
  console.log(`  new resolver: ${newResolver} (tx ${hash})`);

  // --- Step 3: for each child, repoint resolver then transfer custody, both via the old gate ---
  const results: Record<string, { repointTx: Hex; transferTx: Hex }> = {};
  for (const [label, tokenId] of Object.entries(CHILDREN)) {
    console.log(`\nStep 3 (${label}): repointing resolver via old gate...`);
    const repointData = encodeFunctionData({ abi: subregistryAbi, functionName: "setResolver", args: [tokenId, newResolver] });
    sim = await publicClient.simulateContract({ account, address: OLD_GATE, abi: oldGateAbi, functionName: "requestPermissionEscalation", args: [SUBREGISTRY, repointData] });
    hash = await walletClient.writeContract(sim.request);
    await publicClient.waitForTransactionReceipt({ hash });
    const repointActionId = sim.result as bigint;
    const repointTx = await approveOldGateAction(repointActionId);
    console.log(`  repointed (tx ${repointTx})`);

    console.log(`  transferring custody to the new gate via old gate...`);
    const transferCalldata = encodeFunctionData({ abi: subregistryAbi, functionName: "safeTransferFrom", args: [OLD_GATE, newGate, tokenId, 1n, "0x"] });
    sim = await publicClient.simulateContract({ account, address: OLD_GATE, abi: oldGateAbi, functionName: "requestOwnershipTransfer", args: [SUBREGISTRY, tokenId, newGate, transferCalldata] });
    hash = await walletClient.writeContract(sim.request);
    await publicClient.waitForTransactionReceipt({ hash });
    const transferActionId = sim.result as bigint;
    const transferTx = await approveOldGateAction(transferActionId);
    console.log(`  transferred (tx ${transferTx})`);

    results[label] = { repointTx, transferTx };
  }

  // --- Step 4: prove the new gate + resolver work, with the correctly-branded domain ---
  console.log("\nStep 4: proving the new resolver is gated and the new gate's domain is 'Mandate PermissionGate'...");
  try {
    await publicClient.simulateContract({ account, address: newResolver, abi: resolverWriteAbi, functionName: "setText", args: [dnsEncode("agent1.mandate.eth"), "mandate:direct-write-test", "should-fail"] });
    console.log("  UNEXPECTED: direct write succeeded");
  } catch {
    console.log("  confirmed: operator direct setText reverts on the new resolver");
  }

  const data = encodeFunctionData({ abi: resolverWriteAbi, functionName: "setText", args: [dnsEncode("agent1.mandate.eth"), "mandate:capabilities", "read,transact"] });
  sim = await publicClient.simulateContract({ account, address: newGate, abi: gateArtifact.abi, functionName: "requestPermissionEscalation", args: [newResolver, data] });
  hash = await walletClient.writeContract(sim.request);
  await publicClient.waitForTransactionReceipt({ hash });
  const actionId = sim.result as bigint;

  const typedData = {
    domain: { name: "Mandate PermissionGate", version: "1", chainId: sepolia.id, verifyingContract: newGate },
    types: { Approval: [{ name: "actionId", type: "uint256" }] },
    primaryType: "Approval" as const,
    message: { actionId },
  };
  const signature = await approver.signTypedData(typedData);
  sim = await publicClient.simulateContract({ account, address: newGate, abi: gateArtifact.abi, functionName: "approveWithSignature", args: [actionId, signature] });
  hash = await walletClient.writeContract(sim.request);
  await publicClient.waitForTransactionReceipt({ hash });
  console.log(`  actionId ${actionId} approved + executed under the "Mandate PermissionGate" domain (tx ${hash})`);

  const output = { gate: newGate, resolver: newResolver, subregistry: SUBREGISTRY, migratedFrom: OLD_GATE, children: results, firstMandateEscalation: { actionId: actionId.toString(), txHash: hash } };
  writeFileSync(path.join(__dirname, "..", "docs", "mandate-gate-migration.json"), JSON.stringify(output, null, 2) + "\n");
  console.log("\nDone. Written to docs/mandate-gate-migration.json");
  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
