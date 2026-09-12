import { useAccount, useConnect, useDisconnect } from "wagmi";
import { Wallet } from "lucide-react";

function truncate(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function ConnectWalletButton({ variant = "app" }: { variant?: "app" | "landing" }) {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  const baseClass = variant === "landing" ? "landing-btn" : "btn";
  const primaryClass = variant === "landing" ? "landing-btn landing-btn--primary" : "btn btn--primary";

  if (isConnected && address) {
    return (
      <button className={baseClass} onClick={() => disconnect()}>
        <span className="mono">{truncate(address)}</span>
        Disconnect
      </button>
    );
  }

  const injectedConnector = connectors.find((c) => c.id === "injected") ?? connectors[0];

  return (
    <button
      className={primaryClass}
      disabled={!injectedConnector || isPending}
      onClick={() => injectedConnector && connect({ connector: injectedConnector })}
    >
      <Wallet size={16} strokeWidth={1.5} />
      {isPending ? "Connecting…" : "Connect wallet"}
    </button>
  );
}
