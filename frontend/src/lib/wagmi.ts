import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { sepolia } from "wagmi/chains";

// getDefaultConfig wires up RainbowKit's wallet list (injected/MetaMask/Rainbow/Coinbase
// etc.) plus WalletConnect as one connector, so a Ledger behind MetaMask still shows up
// exactly like before. WalletConnect needs a real Cloud project ID to work (get one free at
// https://cloud.walletconnect.com) -- without it that one connector just won't complete a
// QR-code connection, everything else (injected wallets) still works.
export const wagmiConfig = getDefaultConfig({
  appName: "Mandate",
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "00000000000000000000000000000000",
  chains: [sepolia],
  transports: {
    [sepolia.id]: http(import.meta.env.VITE_SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com"),
  },
  ssr: false,
});
