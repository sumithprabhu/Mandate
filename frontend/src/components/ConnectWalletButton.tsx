import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Wallet, AlertTriangle } from "lucide-react";

function truncate(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function ConnectWalletButton({ variant = "app" }: { variant?: "app" | "landing" }) {
  const baseClass = variant === "landing" ? "landing-btn" : "btn";
  const primaryClass = variant === "landing" ? "landing-btn landing-btn--primary" : "btn btn--primary";

  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        if (!ready) {
          return (
            <button className={primaryClass} disabled aria-hidden>
              <Wallet size={16} strokeWidth={1.5} />
              Connect wallet
            </button>
          );
        }

        if (!connected) {
          return (
            <button className={primaryClass} onClick={openConnectModal}>
              <Wallet size={16} strokeWidth={1.5} />
              Connect wallet
            </button>
          );
        }

        if (chain.unsupported) {
          return (
            <button className={baseClass} onClick={openChainModal}>
              <AlertTriangle size={16} strokeWidth={1.5} />
              Wrong network
            </button>
          );
        }

        return (
          <button className={baseClass} onClick={openAccountModal}>
            <span className="mono">{truncate(account.address)}</span>
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}
