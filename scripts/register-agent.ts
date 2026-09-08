// Registers `agentns.eth` as a parent name (with its own subregistry so it can hold
// child agent names), then registers `agent1.agentns.eth` under it as the first test
// agent, deploys one shared PermissionedResolver for both names, and binds the child
// name to a fresh ERC-8004 identity via Adapter8004.
//
// Every address, role-bitmap constant, and function signature here was read from the
// verified source of the deployed hackathon-generation contracts on Sepolia (Blockscout,
// 2026-09-08) -- see docs/deployments.json. Nothing is guessed.
//
// Run with DRY_RUN=1 to print the full plan (addresses, price, role bitmaps, gas
// estimates) without sending anything. Unset (or =0) to execute for real.
//
// Usage: cd scripts && npm run register-agent

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
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(__dirname, "..", "contracts", ".env") });

const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

const deployments = JSON.parse(
  readFileSync(path.join(__dirname, "..", "docs", "deployments.json"), "utf8")
);
const HK = deployments.ensv2.hackathon as Record<string, string>;

const PARENT_LABEL = "agentns";
const CHILD_LABEL = "agent1";
const DURATION_SECONDS = 365n * 24n * 60n * 60n; // 1 year
const AGENT_URI_PLACEHOLDER = "https://agentns.example/agents/agent1.json"; // TODO: replace once backend serves this

// --- role bitmaps (from PermissionedResolverLib.sol / RegistryRolesLib.sol source, verified on Blockscout) ---
const ROLE_SET_ADDRESS = 1n << 0n;
const ROLE_SET_TEXT = 1n << 4n;
const RESOLVER_ROLES_FOR_OPERATOR = ROLE_SET_ADDRESS | ROLE_SET_TEXT;

const ROLE_REGISTRAR = 1n << 0n;
const ROLE_UNREGISTER = 1n << 12n;
const ROLE_RENEW = 1n << 16n;
const ROLE_SET_SUBREGISTRY = 1n << 20n;
const ROLE_SET_RESOLVER = 1n << 24n;
const SUBREGISTRY_ROLES_FOR_OPERATOR = ROLE_REGISTRAR | ROLE_SET_SUBREGISTRY | ROLE_SET_RESOLVER | ROLE_RENEW | ROLE_UNREGISTER;
const CHILD_TOKEN_ROLES_FOR_OPERATOR = ROLE_SET_SUBREGISTRY | ROLE_SET_RESOLVER | ROLE_RENEW | ROLE_UNREGISTER;

// --- minimal ABIs, only the functions this script calls (verified against Blockscout ABIs) ---
const factoryAbi = parseAbi([
  "function deployProxy(address implementation, uint256 salt, bytes data) returns (address)",
]);
const resolverInitAbi = parseAbi([
  "function initialize((address account, uint256 roleBitmap)[] grants, bytes[] calls)",
]);
const resolverWriteAbi = parseAbi([
  "function setText(bytes name, string key, string value)",
  "function setAddress(bytes name, uint256 coinType, bytes addressBytes)",
]);
const subregistryAbi = parseAbi([
  "function initialize((address account, uint256 roleBitmap)[] grants)",
  "function register(string label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256)",
]);
const registrarAbi = parseAbi([
  "function isAvailable(string label) view returns (bool)",
  "function getRegisterPrice(string label, uint64 duration, address paymentToken) view returns (uint256 base, uint256 premium)",
  "function makeCommitment(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, bytes32 referrer) pure returns (bytes32)",
  "function commit(bytes32 commitment)",
  "function commitmentAt(bytes32 commitment) view returns (uint64)",
  "function MIN_COMMITMENT_AGE() view returns (uint64)",
  "function register(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 referrer) returns (uint256)",
]);
const erc20Abi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function mint(address to, uint256 amount)",
  "function approve(address spender, uint256 value) returns (bool)",
]);
const registryReadAbi = parseAbi([
  "function findTokenId(string label) view returns (uint256)",
]);
const adapterAbi = parseAbi([
  "function register(uint8 standard, address tokenContract, uint256 tokenId, string agentURI) returns (uint256)",
]);

async function main() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY as Hex | undefined;
  if (!pk) throw new Error("DEPLOYER_PRIVATE_KEY missing in contracts/.env");
  const account = privateKeyToAccount(pk);

  const rpcUrl = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
  const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) });

  console.log(`Operator: ${account.address}`);
  console.log(`Deployment: hackathon (${deployments.ensv2.deploymentId})`);
  console.log(`Plan: register "${PARENT_LABEL}.eth" (with its own subregistry), then "${CHILD_LABEL}.${PARENT_LABEL}.eth" under it, one shared resolver, ERC-8004 bind on the child.\n`);

  const available = await publicClient.readContract({
    address: HK.registrar as Address,
    abi: registrarAbi,
    functionName: "isAvailable",
    args: [PARENT_LABEL],
  });
  console.log(`"${PARENT_LABEL}.eth" available: ${available}`);
  if (!available) throw new Error(`${PARENT_LABEL}.eth is no longer available -- stop and re-plan`);

  const [base, premium] = await publicClient.readContract({
    address: HK.registrar as Address,
    abi: registrarAbi,
    functionName: "getRegisterPrice",
    args: [PARENT_LABEL, DURATION_SECONDS, HK.paymentToken as Address],
  });
  const totalPrice = base + premium;
  console.log(`Price for 1 year: base=${base} premium=${premium} total=${totalPrice} (payment token: ${HK.paymentToken})`);

  const minCommitmentAge = await publicClient.readContract({
    address: HK.registrar as Address,
    abi: registrarAbi,
    functionName: "MIN_COMMITMENT_AGE",
  });
  console.log(`MIN_COMMITMENT_AGE: ${minCommitmentAge}s`);

  console.log(`\nRole bitmap for resolver (operator gets ROLE_SET_ADDRESS|ROLE_SET_TEXT): ${RESOLVER_ROLES_FOR_OPERATOR}`);
  console.log(`Role bitmap for subregistry root (operator): ${SUBREGISTRY_ROLES_FOR_OPERATOR}`);
  console.log(`Role bitmap for child token (operator): ${CHILD_TOKEN_ROLES_FOR_OPERATOR}\n`);

  if (DRY_RUN) {
    console.log("DRY_RUN=1 set -- stopping before any transaction. Re-run without DRY_RUN to execute.");
    return;
  }

  // --- Step 1: deploy shared resolver ---
  let resolverAddress: Address;
  if (process.env.RESOLVER_ADDRESS) {
    resolverAddress = process.env.RESOLVER_ADDRESS as Address;
    console.log(`Step 1/8: reusing already-deployed resolver: ${resolverAddress}`);
  } else {
    const resolverSalt = BigInt(keccak256(toHex(`${account.address}-agentns-resolver-v1`)));
    const resolverInitData = encodeFunctionData({
      abi: resolverInitAbi,
      functionName: "initialize",
      args: [[{ account: account.address, roleBitmap: RESOLVER_ROLES_FOR_OPERATOR }], []],
    });
    console.log("Step 1/8: deploying shared PermissionedResolver...");
    const sim = await publicClient.simulateContract({
      account,
      address: HK.resolverFactory as Address,
      abi: factoryAbi,
      functionName: "deployProxy",
      args: [HK.resolverImplementation as Address, resolverSalt, resolverInitData],
    });
    const hash = await walletClient.writeContract(sim.request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    resolverAddress = sim.result as Address;
    console.log(`  resolver deployed: ${resolverAddress} (tx ${receipt.transactionHash})`);
  }

  // --- Step 2: deploy subregistry for agentns.eth's children ---
  let subregistryAddress: Address;
  if (process.env.SUBREGISTRY_ADDRESS) {
    subregistryAddress = process.env.SUBREGISTRY_ADDRESS as Address;
    console.log(`Step 2/8: reusing already-deployed subregistry: ${subregistryAddress}`);
  } else {
    const subregistrySalt = BigInt(keccak256(toHex(`${account.address}-agentns-subregistry-v1`)));
    const subregistryInitData = encodeFunctionData({
      abi: subregistryAbi,
      functionName: "initialize",
      args: [[{ account: account.address, roleBitmap: SUBREGISTRY_ROLES_FOR_OPERATOR }]],
    });
    console.log("Step 2/8: deploying subregistry for agentns.eth...");
    const sim = await publicClient.simulateContract({
      account,
      address: HK.resolverFactory as Address,
      abi: factoryAbi,
      functionName: "deployProxy",
      args: [HK.subregistryImplementation as Address, subregistrySalt, subregistryInitData],
    });
    const hash = await walletClient.writeContract(sim.request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    subregistryAddress = sim.result as Address;
    console.log(`  subregistry deployed: ${subregistryAddress} (tx ${receipt.transactionHash})`);
  }

  // --- Step 3: commit ---
  const secret = toHex(randomBytes(32));
  const commitment = await publicClient.readContract({
    address: HK.registrar as Address,
    abi: registrarAbi,
    functionName: "makeCommitment",
    args: [PARENT_LABEL, account.address, secret, subregistryAddress, resolverAddress, DURATION_SECONDS, toHex(0, { size: 32 })],
  });
  console.log(`Step 3/8: committing ${PARENT_LABEL}.eth (secret kept in memory only)...`);
  const commitHash = await walletClient.writeContract({
    address: HK.registrar as Address,
    abi: registrarAbi,
    functionName: "commit",
    args: [commitment],
  });
  await publicClient.waitForTransactionReceipt({ hash: commitHash });
  console.log(`  committed (tx ${commitHash})`);

  // --- Step 4: fund + approve payment token ---
  console.log("Step 4/8: minting + approving test payment token...");
  const balance = await publicClient.readContract({
    address: HK.paymentToken as Address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });
  if (balance < totalPrice) {
    const mintHash = await walletClient.writeContract({
      address: HK.paymentToken as Address,
      abi: erc20Abi,
      functionName: "mint",
      args: [account.address, totalPrice * 2n],
    });
    await publicClient.waitForTransactionReceipt({ hash: mintHash });
    console.log(`  minted test payment token (tx ${mintHash})`);
  }
  const approveHash = await walletClient.writeContract({
    address: HK.paymentToken as Address,
    abi: erc20Abi,
    functionName: "approve",
    args: [HK.registrar as Address, totalPrice],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveHash });
  console.log(`  approved (tx ${approveHash})`);

  // --- Step 5: wait for commitment to mature ---
  const waitMs = Number(minCommitmentAge) * 1000 + 5000;
  console.log(`Step 5/8: waiting ${waitMs / 1000}s for commitment to mature...`);
  await new Promise((r) => setTimeout(r, waitMs));

  // --- Step 6: register agentns.eth ---
  console.log(`Step 6/8: registering ${PARENT_LABEL}.eth...`);
  const registerHash = await walletClient.writeContract({
    address: HK.registrar as Address,
    abi: registrarAbi,
    functionName: "register",
    args: [PARENT_LABEL, account.address, secret, subregistryAddress, resolverAddress, DURATION_SECONDS, HK.paymentToken as Address, toHex(0, { size: 32 })],
  });
  const registerReceipt = await publicClient.waitForTransactionReceipt({ hash: registerHash });
  console.log(`  registered (tx ${registerReceipt.transactionHash})`);

  // --- Step 7: register agent1.agentns.eth under our subregistry ---
  console.log(`Step 7/8: registering ${CHILD_LABEL}.${PARENT_LABEL}.eth under our subregistry...`);
  const latestBlock = await publicClient.getBlock();
  const childExpiry = latestBlock.timestamp + DURATION_SECONDS;
  const childRegisterHash = await walletClient.writeContract({
    address: subregistryAddress,
    abi: subregistryAbi,
    functionName: "register",
    args: [CHILD_LABEL, account.address, "0x0000000000000000000000000000000000000000", resolverAddress, CHILD_TOKEN_ROLES_FOR_OPERATOR, childExpiry],
  });
  await publicClient.waitForTransactionReceipt({ hash: childRegisterHash });
  const childTokenId = await publicClient.readContract({
    address: subregistryAddress,
    abi: registryReadAbi,
    functionName: "findTokenId",
    args: [CHILD_LABEL],
  });
  console.log(`  registered, tokenId=${childTokenId} (tx ${childRegisterHash})`);

  // --- Step 8: bind ERC-8004 identity to the child name via Adapter8004 ---
  console.log("Step 8/8: binding ERC-8004 agent identity...");
  const bindHash = await walletClient.writeContract({
    address: HK.adapter8004 as Address,
    abi: adapterAbi,
    functionName: "register",
    args: [0, subregistryAddress, childTokenId, AGENT_URI_PLACEHOLDER], // 0 = TokenStandard.ERC721
  });
  await publicClient.waitForTransactionReceipt({ hash: bindHash });
  console.log(`  bound (tx ${bindHash})`);

  console.log("\nDone.");
  console.log(`  resolver:     ${resolverAddress}`);
  console.log(`  subregistry:  ${subregistryAddress}`);
  console.log(`  agentns.eth:  registered under ${account.address}`);
  console.log(`  ${CHILD_LABEL}.${PARENT_LABEL}.eth: tokenId ${childTokenId}`);
  console.log(`\nAGENT_URI_PLACEHOLDER (${AGENT_URI_PLACEHOLDER}) is not hosted yet -- swap in a real URL once the backend serves agent registration JSON, via Adapter8004.setAgentURI.`);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
