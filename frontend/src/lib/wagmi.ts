import { createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";

// injected() picks up any EIP-1193 provider the browser exposes -- MetaMask with a Ledger
// plugged in shows up exactly the same way as a plain hot wallet from here. WalletConnect
// needs a Cloud project ID only the project owner can obtain, so it's deferred rather than
// blocking wallet support entirely.
export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  transports: {
    [sepolia.id]: http(import.meta.env.VITE_SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com"),
  },
});
