import { createWalletClient, custom, type Address } from "viem";
import { sepolia } from "viem/chains";
import type { TypedData } from "./api";

// Plain injected-provider wallet connect (MetaMask, or anything else that injects
// window.ethereum) via viem's custom transport -- deliberately not wagmi/RainbowKit for a
// v1 this thin. This is also the real path to hardware Clear Signing without DMK/node-hid:
// MetaMask supports a Ledger as its signing backend, so connecting a Ledger-backed
// MetaMask account here routes signTypedData below through the actual device.

declare global {
  interface Window {
    ethereum?: unknown;
  }
}

export function hasInjectedWallet(): boolean {
  return typeof window !== "undefined" && Boolean(window.ethereum);
}

export async function connectWallet(): Promise<Address> {
  if (!hasInjectedWallet()) throw new Error("No injected wallet found (install MetaMask or similar)");
  const client = createWalletClient({ chain: sepolia, transport: custom(window.ethereum as any) });
  const [address] = await client.requestAddresses();
  return address;
}

export async function signApproval(account: Address, typedData: TypedData): Promise<`0x${string}`> {
  const client = createWalletClient({ chain: sepolia, transport: custom(window.ethereum as any) });
  return client.signTypedData({
    account,
    domain: { ...typedData.domain, verifyingContract: typedData.domain.verifyingContract as Address },
    types: typedData.types,
    primaryType: typedData.primaryType as "Approval",
    message: { actionId: BigInt(typedData.message.actionId) },
  });
}
