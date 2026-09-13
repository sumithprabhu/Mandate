import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  encodeFunctionData,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { config } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// This file is the bare ABI array (copied from subgraph/abis/), not a full forge artifact.
const gateAbiJson = JSON.parse(
  readFileSync(path.join(__dirname, "..", "abis", "PermissionGate.json"), "utf8")
);

export const operator = privateKeyToAccount(config.operatorPrivateKey as Hex);

export const publicClient = createPublicClient({ chain: sepolia, transport: http(config.rpcUrl) });
export const operatorClient = createWalletClient({ account: operator, chain: sepolia, transport: http(config.rpcUrl) });

export const gateAbi = gateAbiJson;

const resolverAbi = parseAbi(["function setText(bytes name, string key, string value)"]);
const subregistryAbi = parseAbi([
  "function register(string label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256)",
  "function findTokenId(string label) view returns (uint256)",
  "function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes data)",
]);
const adapter8004Abi = parseAbi([
  "function register(uint8 standard, address tokenContract, uint256 tokenId, string agentURI) returns (uint256)",
]);

// Same bundle granted to the operator on every child name at registration -- see
// docs/registered-agents.json and RegistryRolesLib in the ENSv2 hackathon contracts.
// Includes ROLE_CAN_TRANSFER_ADMIN ((1<<28)<<128, confirmed against the real verified
// PermissionedRegistry source -- see docs/self-serve-registration.md): without it,
// PermissionedRegistry.safeTransferFrom reverts with TransferDisallowed regardless of
// caller, since transfer permission is a role on the token itself, not an owner default.
const CHILD_TOKEN_ROLES =
  (1n << 20n) | (1n << 24n) | (1n << 16n) | (1n << 12n) | ((1n << 28n) << 128n); // SET_SUBREGISTRY | SET_RESOLVER | RENEW | UNREGISTER | CAN_TRANSFER_ADMIN

/// Registers `${label}.agentns.eth` under the project's existing subregistry (set up once
/// in scripts/register-agent.ts -- not redeployed per agent) and binds it to a fresh
/// ERC-8004 identity via Adapter8004.
///
/// `owner`, if given, is the resulting token's real final owner -- e.g. a connected
/// wallet's address for self-serve registration. It's handed the token in a third
/// transaction *after* binding, not passed as the ENS owner directly: Adapter8004.register
/// reverts with NotController(address,uint256) unless the operator itself still controls
/// the token at bind time (confirmed by hitting this for real -- see
/// docs/self-serve-registration.md), so the operator has to hold it just long enough to
/// bind, then transfer it immediately. Omit `owner` to leave it with the operator (the
/// legacy demo-agent behavior).
export async function registerChildAgent(
  subregistry: Address,
  resolver: Address,
  adapter8004: Address,
  label: string,
  agentURI: string,
  owner?: Address,
  durationSeconds = 31536000n
): Promise<{ tokenId: bigint; agentId: bigint; registerTx: Hex; bindTx: Hex; transferTx?: Hex }> {
  const latestBlock = await publicClient.getBlock();
  const expiry = latestBlock.timestamp + durationSeconds;

  const registerSim = await publicClient.simulateContract({
    account: operator,
    address: subregistry,
    abi: subregistryAbi,
    functionName: "register",
    args: [label, operator.address, "0x0000000000000000000000000000000000000000", resolver, CHILD_TOKEN_ROLES, expiry],
  });
  const registerTx = await operatorClient.writeContract(registerSim.request);
  await publicClient.waitForTransactionReceipt({ hash: registerTx });
  const tokenId = registerSim.result as bigint;

  const bindSim = await publicClient.simulateContract({
    account: operator,
    address: adapter8004,
    abi: adapter8004Abi,
    functionName: "register",
    args: [0, subregistry, tokenId, agentURI], // 0 = TokenStandard.ERC721
  });
  const bindTx = await operatorClient.writeContract(bindSim.request);
  const bindReceipt = await publicClient.waitForTransactionReceipt({ hash: bindTx });

  // AgentBound's first indexed topic (after the event signature) is the agentId.
  const bindLog = bindReceipt.logs.find((l) => l.address.toLowerCase() === adapter8004.toLowerCase());
  if (!bindLog || !bindLog.topics[1]) throw new Error("AgentBound event not found in bind receipt");
  const agentId = BigInt(bindLog.topics[1]);

  let transferTx: Hex | undefined;
  if (owner && owner.toLowerCase() !== operator.address.toLowerCase()) {
    try {
      const transferSim = await publicClient.simulateContract({
        account: operator,
        address: subregistry,
        abi: subregistryAbi,
        functionName: "safeTransferFrom",
        args: [operator.address, owner, tokenId, 1n, "0x"],
      });
      transferTx = await operatorClient.writeContract(transferSim.request);
      await publicClient.waitForTransactionReceipt({ hash: transferTx });
    } catch (err) {
      // The identity is already registered and bound on chain at this point (both prior
      // txs are confirmed, not rolled back by this failure) -- it's just still owned by
      // the operator instead of `owner`. safeTransferFrom is an ERC1155 call, which
      // requires a contract recipient to implement onERC1155Received; a growing class of
      // wallets (EIP-7702 "smart EOAs") have code but don't implement it, and the raw
      // revert here gives no useful signal as to why. Check for that specific case and
      // say so plainly instead of surfacing viem's generic "execution reverted" dump.
      const code = await publicClient.getBytecode({ address: owner });
      if (code && code !== "0x") {
        throw new Error(
          `Registered and bound on chain, but the handoff to your wallet failed: ${owner} has contract code ` +
            "(likely an EIP-7702 smart account) that doesn't implement the ERC1155 receiver hook this transfer " +
            "requires. The identity now exists but is still held by the operator -- try again with a plain EOA " +
            "wallet (no smart-account features enabled), or a different wallet extension."
        );
      }
      throw err;
    }
  }

  return { tokenId, agentId, registerTx, bindTx, transferTx };
}

export function dnsEncode(name: string): Hex {
  const labels = name.split(".");
  let out = "";
  for (const label of labels) {
    out += label.length.toString(16).padStart(2, "0") + Buffer.from(label).toString("hex");
  }
  return `0x${out}00` as Hex;
}

export function encodeSetText(agentName: string, key: string, value: string): Hex {
  return encodeFunctionData({
    abi: resolverAbi,
    functionName: "setText",
    args: [dnsEncode(agentName), key, value],
  });
}

export function encodeErc1155TransferCalldata(gate: Address, to: Address, tokenId: bigint): Hex {
  return encodeFunctionData({
    abi: parseAbi(["function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes data)"]),
    functionName: "safeTransferFrom",
    args: [gate, to, tokenId, 1n, "0x"],
  });
}

export async function requestOwnershipTransfer(
  gate: Address,
  registry: Address,
  tokenId: bigint,
  newOwner: Address,
  transferCalldata: Hex
): Promise<{ actionId: bigint; txHash: Hex }> {
  const sim = await publicClient.simulateContract({
    account: operator,
    address: gate,
    abi: gateAbi,
    functionName: "requestOwnershipTransfer",
    args: [registry, tokenId, newOwner, transferCalldata],
  });
  const txHash = await operatorClient.writeContract(sim.request);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return { actionId: sim.result as bigint, txHash };
}

export async function requestPermissionEscalation(
  gate: Address,
  target: Address,
  data: Hex
): Promise<{ actionId: bigint; txHash: Hex }> {
  const sim = await publicClient.simulateContract({
    account: operator,
    address: gate,
    abi: gateAbi,
    functionName: "requestPermissionEscalation",
    args: [target, data],
  });
  const txHash = await operatorClient.writeContract(sim.request);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return { actionId: sim.result as bigint, txHash };
}

export async function getAction(gate: Address, actionId: bigint) {
  return publicClient.readContract({
    address: gate,
    abi: gateAbi,
    functionName: "getAction",
    args: [actionId],
  });
}

export function buildApprovalTypedData(gate: Address, actionId: bigint, domainName: string) {
  return {
    domain: {
      name: domainName,
      version: "1",
      chainId: sepolia.id,
      verifyingContract: gate,
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
}

export async function relayApproval(gate: Address, actionId: bigint, signature: Hex): Promise<Hex> {
  const sim = await publicClient.simulateContract({
    account: operator,
    address: gate,
    abi: gateAbi,
    functionName: "approveWithSignature",
    args: [actionId, signature],
  });
  const txHash = await operatorClient.writeContract(sim.request);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return txHash;
}
