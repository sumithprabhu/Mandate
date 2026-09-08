// Full on-chain rebrand: registers mandate.eth (fresh subregistry + resolver), re-registers
// agent1/agent2 as its children, binds ERC-8004 identities, deploys a new PermissionGate
// with the "Mandate PermissionGate" EIP-712 domain, and -- fixing the two gaps documented
// in docs/backend.md -- grants the new resolver's write role ONLY to the gate (not the
// operator) and actually transfers each agent's token into the gate's custody after
// binding. agentns.eth and the old gate are left exactly as they are (real history, not
// rewritten) -- this is a parallel fresh deployment under the new name, not a migration.
//
// Run with DRY_RUN=1 to print the plan without sending anything.
//
// Usage: cd scripts && npx tsx rebrand-onchain.ts

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

const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

const deployments = JSON.parse(readFileSync(path.join(__dirname, "..", "docs", "deployments.json"), "utf8"));
const HK = deployments.ensv2.hackathon as Record<string, string>;

const gateArtifact = JSON.parse(
  readFileSync(path.join(__dirname, "..", "contracts", "out", "PermissionGate.sol", "PermissionGate.json"), "utf8")
);

const PARENT_LABEL = "mandate";
const CHILD_LABELS = ["agent1", "agent2"];
const DURATION_SECONDS = 31536000n; // 1 year

const ROLE_SET_ADDRESS = 1n << 0n;
const ROLE_SET_TEXT = 1n << 4n;
const RESOLVER_ROLES_FOR_GATE = ROLE_SET_ADDRESS | ROLE_SET_TEXT;

const ROLE_REGISTRAR = 1n << 0n;
const ROLE_UNREGISTER = 1n << 12n;
const ROLE_RENEW = 1n << 16n;
const ROLE_SET_SUBREGISTRY = 1n << 20n;
const ROLE_SET_RESOLVER = 1n << 24n;
// Registry blocks transfers by default (TransferDisallowed) unless the sender holds this --
// learned the hard way: the first attempt at this script registered agent1 without it and
// the custody-transfer step reverted. Re-registered with this included; see docs/mandate-deployment.json.
const ROLE_CAN_TRANSFER_ADMIN = (1n << 28n) << 128n;
const SUBREGISTRY_ROLES_FOR_OPERATOR = ROLE_REGISTRAR | ROLE_SET_SUBREGISTRY | ROLE_SET_RESOLVER | ROLE_RENEW | ROLE_UNREGISTER;
const CHILD_TOKEN_ROLES_FOR_OPERATOR = ROLE_SET_SUBREGISTRY | ROLE_SET_RESOLVER | ROLE_RENEW | ROLE_UNREGISTER | ROLE_CAN_TRANSFER_ADMIN;

const factoryAbi = parseAbi(["function deployProxy(address implementation, uint256 salt, bytes data) returns (address)"]);
const resolverInitAbi = parseAbi(["function initialize((address account, uint256 roleBitmap)[] grants, bytes[] calls)"]);
const resolverWriteAbi = parseAbi(["function setText(bytes name, string key, string value)"]);
const subregistryAbi = parseAbi([
  "function initialize((address account, uint256 roleBitmap)[] grants)",
  "function register(string label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256)",
  "function findTokenId(string label) view returns (uint256)",
  "function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes data)",
  "function unregister(uint256 anyId)",
]);
const registrarAbi = parseAbi([
  "function isAvailable(string label) view returns (bool)",
  "function getRegisterPrice(string label, uint64 duration, address paymentToken) view returns (uint256 base, uint256 premium)",
  "function makeCommitment(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, bytes32 referrer) pure returns (bytes32)",
  "function commit(bytes32 commitment)",
  "function MIN_COMMITMENT_AGE() view returns (uint64)",
  "function register(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 referrer) returns (uint256)",
]);
const erc20Abi = parseAbi(["function balanceOf(address account) view returns (uint256)", "function mint(address to, uint256 amount)", "function approve(address spender, uint256 value) returns (bool)"]);
const adapterAbi = parseAbi(["function register(uint8 standard, address tokenContract, uint256 tokenId, string agentURI) returns (uint256)"]);

function dnsEncode(name: string): Hex {
  const labels = name.split(".");
  let out = "";
  for (const label of labels) out += label.length.toString(16).padStart(2, "0") + Buffer.from(label).toString("hex");
  return `0x${out}00` as Hex;
}

async function main() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY as Hex;
  const approverPk = process.env.LEDGER_STANDIN_PRIVATE_KEY as Hex;
  if (!pk || !approverPk) throw new Error("DEPLOYER_PRIVATE_KEY / LEDGER_STANDIN_PRIVATE_KEY missing in contracts/.env");
  const account = privateKeyToAccount(pk);
  const approver = privateKeyToAccount(approverPk);

  const rpcUrl = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
  const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) });

  console.log(`Operator: ${account.address}`);
  console.log(`Approver (reused Ledger stand-in): ${approver.address}`);
  console.log(`Plan: register "${PARENT_LABEL}.eth" fresh, children [${CHILD_LABELS.join(", ")}], new gate + gate-only-writable resolver, real custody transfer.\n`);

  let totalPrice = 0n;
  if (process.env.SKIP_PARENT_REGISTER !== "1") {
    const available = await publicClient.readContract({ address: HK.registrar as Address, abi: registrarAbi, functionName: "isAvailable", args: [PARENT_LABEL] });
    console.log(`"${PARENT_LABEL}.eth" available: ${available}`);
    if (!available) throw new Error(`${PARENT_LABEL}.eth is no longer available`);

    const [base, premium] = await publicClient.readContract({ address: HK.registrar as Address, abi: registrarAbi, functionName: "getRegisterPrice", args: [PARENT_LABEL, DURATION_SECONDS, HK.paymentToken as Address] });
    totalPrice = base + premium;
    console.log(`Price for 1 year: ${totalPrice} (payment token: ${HK.paymentToken})`);
  } else {
    console.log(`"${PARENT_LABEL}.eth" already registered, skipping availability/price check`);
  }

  if (DRY_RUN) {
    console.log("\nDRY_RUN=1 -- stopping before any transaction.");
    return;
  }

  let hash: Hex;
  let sim;
  let receipt;

  // --- Step 1: deploy subregistry for mandate.eth's children (skip if already deployed) ---
  let subregistry: Address;
  if (process.env.SUBREGISTRY_ADDRESS) {
    subregistry = process.env.SUBREGISTRY_ADDRESS as Address;
    console.log(`Step 1: reusing already-deployed subregistry: ${subregistry}`);
  } else {
    const subSalt = BigInt(keccak256(toHex(`${account.address}-mandate-subregistry-v1`)));
    const subInit = encodeFunctionData({ abi: subregistryAbi, functionName: "initialize", args: [[{ account: account.address, roleBitmap: SUBREGISTRY_ROLES_FOR_OPERATOR }]] });
    console.log("Step 1: deploying subregistry...");
    sim = await publicClient.simulateContract({ account, address: HK.resolverFactory as Address, abi: factoryAbi, functionName: "deployProxy", args: [HK.subregistryImplementation as Address, subSalt, subInit] });
    hash = await walletClient.writeContract(sim.request);
    await publicClient.waitForTransactionReceipt({ hash });
    subregistry = sim.result as Address;
    console.log(`  subregistry: ${subregistry} (tx ${hash})`);
  }

  // --- Step 2: deploy PermissionGate (skip if already deployed) ---
  let gate: Address;
  if (process.env.GATE_ADDRESS) {
    gate = process.env.GATE_ADDRESS as Address;
    console.log(`Step 2: reusing already-deployed gate: ${gate}`);
  } else {
    console.log("Step 2: deploying PermissionGate...");
    hash = await walletClient.deployContract({ abi: gateArtifact.abi, bytecode: gateArtifact.bytecode.object as Hex, args: [subregistry, account.address, approver.address] });
    receipt = await publicClient.waitForTransactionReceipt({ hash });
    gate = receipt.contractAddress as Address;
    console.log(`  gate: ${gate} (tx ${hash})`);
  }

  // --- Step 3: deploy resolver, write role granted ONLY to the gate (skip if already deployed) ---
  let resolver: Address;
  if (process.env.RESOLVER_ADDRESS) {
    resolver = process.env.RESOLVER_ADDRESS as Address;
    console.log(`Step 3: reusing already-deployed resolver: ${resolver}`);
  } else {
    const resSalt = BigInt(keccak256(toHex(`${account.address}-mandate-resolver-v1`)));
    const resInit = encodeFunctionData({ abi: resolverInitAbi, functionName: "initialize", args: [[{ account: gate, roleBitmap: RESOLVER_ROLES_FOR_GATE }], []] });
    console.log("Step 3: deploying resolver (gate-only-writable from the start)...");
    sim = await publicClient.simulateContract({ account, address: HK.resolverFactory as Address, abi: factoryAbi, functionName: "deployProxy", args: [HK.resolverImplementation as Address, resSalt, resInit] });
    hash = await walletClient.writeContract(sim.request);
    await publicClient.waitForTransactionReceipt({ hash });
    resolver = sim.result as Address;
    console.log(`  resolver: ${resolver} (tx ${hash})`);
  }

  // --- Step 4: commit + register mandate.eth (skip if already registered) ---
  if (process.env.SKIP_PARENT_REGISTER === "1") {
    console.log("Step 4: skipping, mandate.eth already registered");
  } else {
    const secret = toHex(crypto.getRandomValues(new Uint8Array(32)));
    const commitment = await publicClient.readContract({ address: HK.registrar as Address, abi: registrarAbi, functionName: "makeCommitment", args: [PARENT_LABEL, account.address, secret, subregistry, resolver, DURATION_SECONDS, toHex(0, { size: 32 })] });
    console.log("Step 4: committing mandate.eth...");
    hash = await walletClient.writeContract({ address: HK.registrar as Address, abi: registrarAbi, functionName: "commit", args: [commitment] });
    await publicClient.waitForTransactionReceipt({ hash });

    const balance = await publicClient.readContract({ address: HK.paymentToken as Address, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
    if (balance < totalPrice) {
      hash = await walletClient.writeContract({ address: HK.paymentToken as Address, abi: erc20Abi, functionName: "mint", args: [account.address, totalPrice * 2n] });
      await publicClient.waitForTransactionReceipt({ hash });
    }
    hash = await walletClient.writeContract({ address: HK.paymentToken as Address, abi: erc20Abi, functionName: "approve", args: [HK.registrar as Address, totalPrice] });
    await publicClient.waitForTransactionReceipt({ hash });

    const minCommitmentAge = await publicClient.readContract({ address: HK.registrar as Address, abi: registrarAbi, functionName: "MIN_COMMITMENT_AGE" });
    console.log(`  waiting ${minCommitmentAge}s for commitment to mature...`);
    await new Promise((r) => setTimeout(r, Number(minCommitmentAge) * 1000 + 5000));

    console.log(`  registering ${PARENT_LABEL}.eth...`);
    hash = await walletClient.writeContract({ address: HK.registrar as Address, abi: registrarAbi, functionName: "register", args: [PARENT_LABEL, account.address, secret, subregistry, resolver, DURATION_SECONDS, HK.paymentToken as Address, toHex(0, { size: 32 })] });
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`  registered (tx ${hash})`);
  }

  // --- Step 4b: unregister any child that was registered with the wrong (pre-fix) role bitmap ---
  const REDO_LABELS = (process.env.REDO_LABELS || "").split(",").filter(Boolean);
  for (const label of REDO_LABELS) {
    const staleTokenId = await publicClient.readContract({ address: subregistry, abi: subregistryAbi, functionName: "findTokenId", args: [label] });
    console.log(`Step 4b: unregistering ${label} (tokenId ${staleTokenId}, registered before the transfer-role fix)...`);
    hash = await walletClient.writeContract({ address: subregistry, abi: subregistryAbi, functionName: "unregister", args: [staleTokenId] });
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`  unregistered (tx ${hash})`);
  }

  // --- Step 5: register + bind + transfer custody for each child ---
  const results: Record<string, { tokenId: string; agentId: string; registerTx: Hex; bindTx: Hex; transferTx: Hex }> = {};
  for (const label of CHILD_LABELS) {
    console.log(`\nStep 5 (${label}): registering child, owner=operator (Adapter8004 requires the caller to control the token to bind it)...`);
    const latestBlock = await publicClient.getBlock();
    const expiry = latestBlock.timestamp + DURATION_SECONDS;
    sim = await publicClient.simulateContract({ account, address: subregistry, abi: subregistryAbi, functionName: "register", args: [label, account.address, "0x0000000000000000000000000000000000000000", resolver, CHILD_TOKEN_ROLES_FOR_OPERATOR, expiry] });
    hash = await walletClient.writeContract(sim.request);
    await publicClient.waitForTransactionReceipt({ hash });
    const registerTx = hash;
    const tokenId = sim.result as bigint;
    console.log(`  registered, tokenId=${tokenId} (tx ${registerTx})`);

    console.log(`  binding ERC-8004 identity...`);
    sim = await publicClient.simulateContract({ account, address: HK.adapter8004 as Address, abi: adapterAbi, functionName: "register", args: [0, subregistry, tokenId, `https://mandate.example/agents/${label}.json`] });
    hash = await walletClient.writeContract(sim.request);
    receipt = await publicClient.waitForTransactionReceipt({ hash });
    const bindTx = hash;
    const bindLog = receipt.logs.find((l) => l.address.toLowerCase() === (HK.adapter8004 as string).toLowerCase());
    const agentId = BigInt(bindLog!.topics[1]!);
    console.log(`  bound, agentId=${agentId} (tx ${bindTx})`);

    console.log(`  transferring custody to the gate (this is the fix -- the old gate never got this)...`);
    hash = await walletClient.writeContract({ address: subregistry, abi: subregistryAbi, functionName: "safeTransferFrom", args: [account.address, gate, tokenId, 1n, "0x"] });
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`  custody transferred (tx ${hash})`);

    results[label] = { tokenId: tokenId.toString(), agentId: agentId.toString(), registerTx, bindTx, transferTx: hash };
  }

  // --- Step 6: prove the gate-only-writable resolver for real, through the actual production resolver this time ---
  console.log("\nStep 6: proving the resolver is really gated (operator cannot write directly)...");
  const directWriteData = encodeFunctionData({ abi: resolverWriteAbi, functionName: "setText", args: [dnsEncode(`agent1.${PARENT_LABEL}.eth`), "mandate:direct-write-test", "should-fail"] });
  try {
    await publicClient.simulateContract({ account, address: resolver, abi: resolverWriteAbi, functionName: "setText", args: [dnsEncode(`agent1.${PARENT_LABEL}.eth`), "mandate:direct-write-test", "should-fail"] });
    console.log("  UNEXPECTED: operator direct write succeeded -- resolver is not actually gated");
  } catch {
    console.log("  confirmed: operator direct setText reverts -- only the gate can write");
  }
  void directWriteData;

  console.log("Step 6b: requesting + approving a real escalation through the gate...");
  const data = encodeFunctionData({ abi: resolverWriteAbi, functionName: "setText", args: [dnsEncode(`agent1.${PARENT_LABEL}.eth`), "mandate:capabilities", "read,transact"] });
  sim = await publicClient.simulateContract({ account, address: gate, abi: gateArtifact.abi, functionName: "requestPermissionEscalation", args: [resolver, data] });
  hash = await walletClient.writeContract(sim.request);
  await publicClient.waitForTransactionReceipt({ hash });
  const actionId = sim.result as bigint;

  const typedData = {
    domain: { name: "Mandate PermissionGate", version: "1", chainId: sepolia.id, verifyingContract: gate },
    types: { Approval: [{ name: "actionId", type: "uint256" }] },
    primaryType: "Approval" as const,
    message: { actionId },
  };
  const signature = await approver.signTypedData(typedData);
  sim = await publicClient.simulateContract({ account, address: gate, abi: gateArtifact.abi, functionName: "approveWithSignature", args: [actionId, signature] });
  hash = await walletClient.writeContract(sim.request);
  await publicClient.waitForTransactionReceipt({ hash });
  console.log(`  escalation actionId ${actionId} approved + executed (tx ${hash}) -- real record on the real production resolver`);

  const output = {
    deployedAt: new Date().toISOString().slice(0, 10),
    parentName: `${PARENT_LABEL}.eth`,
    subregistry,
    gate,
    resolver,
    approver: approver.address,
    operator: account.address,
    agents: results,
    firstEscalation: { actionId: actionId.toString() },
  };
  writeFileSync(path.join(__dirname, "..", "docs", "mandate-deployment.json"), JSON.stringify(output, null, 2) + "\n");
  console.log("\nDone. Written to docs/mandate-deployment.json");
  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
