// Read-only on-chain access for the frontend -- no wallet needed for these, they're all
// public view calls. Used for live reads that must not be served from any cache: the
// capability manifest (via the real Universal Resolver entry point, same path proven in
// docs/subgraph.md) and current token ownership.
import { createPublicClient, http, namehash, encodeFunctionData, decodeAbiParameters, parseAbi, type Address } from "viem";
import { sepolia } from "viem/chains";

const RPC_URL = import.meta.env.VITE_SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const UNIVERSAL_RESOLVER = "0xd26f2040D083Af1cD2962ba303F4BEa0c4faf142" as Address; // hackathon deployment, docs/deployments.json

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
