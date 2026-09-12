// Read-only on-chain access for the frontend -- no wallet needed for these, they're all
// public view calls. Used for live reads that must not be served from any cache: the
// capability manifest (via the real Universal Resolver entry point, same path proven in
// docs/subgraph.md) and current token ownership.
import {
  createPublicClient,
  http,
  namehash,
  encodeFunctionData,
  decodeFunctionData,
  decodeAbiParameters,
  parseAbi,
  type Address,
} from "viem";
import { sepolia } from "viem/chains";

const RPC_URL = import.meta.env.VITE_SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const UNIVERSAL_RESOLVER = "0xd26f2040D083Af1cD2962ba303F4BEa0c4faf142" as Address; // hackathon deployment, docs/deployments.json

// docs/deployments.json -- the corrected factory (checks Adapter8004.isController, not
// the broken IdentityRegistry.isAuthorizedOrOwner the first deployment used).
export const PERMISSION_GATE_FACTORY = "0xE017191538B7e1BE16a7196D3aF0af7958d94E3d" as Address;

export const permissionGateFactoryAbi = parseAbi([
  "function createGate(uint256 agentId, address approver, string domainName) returns (address)",
]);

export const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });

function toHexString(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function dnsEncode(name: string): `0x${string}` {
  const labels = name.split(".");
  const encoder = new TextEncoder();
  let out = "";
  for (const label of labels) {
    out += label.length.toString(16).padStart(2, "0") + toHexString(encoder.encode(label));
  }
  return `0x${out}00` as `0x${string}`;
}

const textAbi = parseAbi(["function text(bytes32 node, string key) view returns (string)"]);
const universalResolverAbi = parseAbi(["function resolve(bytes name, bytes data) view returns (bytes, address)"]);

/** Live read of a text record through the actual Universal Resolver -- the real ENS
 * resolution path, not a direct call to a resolver address we happen to already know. */
export async function resolveTextRecord(name: string, key: string): Promise<{ value: string | null; resolver: Address | null }> {
  const node = namehash(name);
  const innerData = encodeFunctionData({ abi: textAbi, functionName: "text", args: [node, key] });

  try {
    const [encodedResult, resolver] = await publicClient.readContract({
      address: UNIVERSAL_RESOLVER,
      abi: universalResolverAbi,
      functionName: "resolve",
      args: [dnsEncode(name), innerData],
    });
    const [value] = decodeAbiParameters([{ type: "string" }], encodedResult);
    return { value: value || null, resolver };
  } catch {
    return { value: null, resolver: null };
  }
}

const setTextAbi = parseAbi(["function setText(bytes name, string key, string value)"]);

/** Decodes the real calldata a PermissionEscalation action carries -- same encoding
 * backend/src/chain.ts's encodeSetText produces. */
export function decodeEscalationData(data: `0x${string}`): { key: string; value: string } | null {
  try {
    const decoded = decodeFunctionData({ abi: setTextAbi, data });
    const [, key, value] = decoded.args as [string, string, string];
    return { key, value };
  } catch {
    return null;
  }
}

/** Encodes the exact setText calldata a permission-escalation request carries -- same
 * encoding backend/src/chain.ts's encodeSetText produces, for the connected-wallet path. */
export function encodeSetText(agentName: string, key: string, value: string): `0x${string}` {
  return encodeFunctionData({
    abi: setTextAbi,
    functionName: "setText",
    args: [dnsEncode(agentName), key, value],
  });
}

const erc1155TransferAbi = parseAbi([
  "function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes data)",
]);

/** Encodes the ERC-1155 transfer a gate runs on approval -- the shape real agent
 * registrations use (see contracts/src/PermissionGate.sol's contract-level note). */
export function encodeErc1155TransferCalldata(gate: Address, to: Address, tokenId: string): `0x${string}` {
  return encodeFunctionData({
    abi: erc1155TransferAbi,
    functionName: "safeTransferFrom",
    args: [gate, to, BigInt(tokenId), 1n, "0x"],
  });
}

export const permissionGateAbi = parseAbi([
  "function requestOwnershipTransfer(address registry, uint256 tokenId, address newOwner, bytes transferCalldata) returns (uint256)",
  "function requestPermissionEscalation(address target, bytes data) returns (uint256)",
]);

// getAction returns a single PendingAction struct (one tuple), not 8 separate values --
// the parenthesized tuple syntax below is required for parseAbi to decode it correctly.
const getActionAbi = parseAbi([
  "function getAction(uint256 actionId) view returns ((uint8 actionType, address target, bytes data, address newOwner, uint256 tokenId, address requestedBy, uint256 requestedAt, uint8 status) action)",
]);

const ACTION_TYPES = ["OwnershipTransfer", "PermissionEscalation"] as const;
const ACTION_STATUSES = ["None", "Pending", "Rejected", "Executed"] as const;

export interface OnChainAction {
  actionType: (typeof ACTION_TYPES)[number];
  requestedBy: Address;
  requestedAt: string;
  status: (typeof ACTION_STATUSES)[number];
}

/** Reads a gate's action directly on chain -- works uniformly for the legacy shared gate
 * and any self-serve gate, since it's a plain public view call with no backend dependency.
 * Self-serve gates aren't recorded in the backend's agent directory at all (see
 * frontend/src/lib/subgraph.ts::fetchGateForAgent), so polling through the backend's
 * getAction endpoint -- which requires an agent record with a `gate` field -- doesn't work
 * for them; this does. */
export async function readGateAction(gate: Address, actionId: string): Promise<OnChainAction> {
  const action = await publicClient.readContract({
    address: gate,
    abi: getActionAbi,
    functionName: "getAction",
    args: [BigInt(actionId)],
  });
  return {
    actionType: ACTION_TYPES[action.actionType],
    requestedBy: action.requestedBy,
    requestedAt: action.requestedAt.toString(),
    status: ACTION_STATUSES[action.status],
  };
}

const ownerOfAbi = parseAbi(["function ownerOf(uint256 tokenId) view returns (address)"]);

/** Live ownerOf read against the registry actually holding the token -- not the
 * directory's cached `owner` field. */
export async function readLiveOwner(registry: Address, tokenId: string): Promise<Address | null> {
  try {
    return await publicClient.readContract({
      address: registry,
      abi: ownerOfAbi,
      functionName: "ownerOf",
      args: [BigInt(tokenId)],
    });
  } catch {
    return null;
  }
}
