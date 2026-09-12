import { useState } from "react";
import { Link } from "react-router-dom";
import { useAccount, useBalance, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { AlertTriangle, ArrowRight, Loader2 } from "lucide-react";

import { api } from "../lib/api";
import { PERMISSION_GATE_FACTORY, permissionGateFactoryAbi } from "../lib/chain";
import { ConnectWalletButton } from "../components/ConnectWalletButton";

const PARENT_AGENT_ID = 10168; // agent1.mandate.eth -- shares mandate.eth's subregistry/resolver/adapter8004

type Step = "identity" | "gate" | "done";

export function RegisterPage() {
  const { address, isConnected } = useAccount();
  const { data: balance } = useBalance({ address });

  const [step, setStep] = useState<Step>("identity");
  const [label, setLabel] = useState("");
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<number | null>(null);
  const [agentName, setAgentName] = useState<string | null>(null);

  const [approver, setApprover] = useState("");
  const { writeContract, data: gateTxHash, isPending: isGateTxPending, error: gateWriteError } = useWriteContract();
  const { isLoading: isGateTxConfirming, isSuccess: gateTxConfirmed } = useWaitForTransactionReceipt({
    hash: gateTxHash,
  });

  async function submitIdentity() {
    if (!address || !label) return;
    setRegistering(true);
    setRegisterError(null);
    try {
      const r = await api.registerAgent(label, address, PARENT_AGENT_ID);
      setAgentId(r.agent.agentId);
      setAgentName(r.agent.name);
      setStep("gate");
    } catch (e) {
      setRegisterError(e instanceof Error ? e.message : String(e));
    } finally {
      setRegistering(false);
    }
  }

  function submitGate() {
    if (!agentId || !approver || !agentName) return;
    writeContract({
      address: PERMISSION_GATE_FACTORY,
      abi: permissionGateFactoryAbi,
      functionName: "createGate",
      args: [BigInt(agentId), approver as `0x${string}`, agentName],
    });
  }

  if (gateTxConfirmed && step !== "done") setStep("done");

  const showFaucetBanner = isConnected && balance !== undefined && balance.value === 0n;

  return (
    <>
      <div className="page-header">
        <div className="page-header__eyebrow">Self-serve registration</div>
        <h1>Register an agent</h1>
        <p>
          Every step below is signed by your own connected wallet, not a backend key. The only thing done on your
          behalf is binding the ENS name -- everything that touches ownership or approval is yours.
        </p>
      </div>

      {!isConnected && (
        <div className="panel empty-state">
          <span>Connect a wallet to register an agent.</span>
          <div className="page-header__actions">
            <ConnectWalletButton />
          </div>
        </div>
      )}

      {isConnected && showFaucetBanner && (
        <div className="panel error-state">
          <AlertTriangle size={20} strokeWidth={1.5} />
          <span>
            Your connected wallet has no Sepolia ETH, so it can't pay gas for these transactions. Get free testnet
            ETH from a{" "}
            <a href="https://cloud.google.com/application/web3/faucet/ethereum/sepolia" target="_blank" rel="noreferrer">
              Sepolia faucet
            </a>{" "}
            first.
          </span>
        </div>
      )}

      {isConnected && step === "identity" && (
        <div className="panel">
          <h3>1. Register your identity</h3>
          <div className="field field--spaced">
            <label htmlFor="label">Label</label>
            <input
              id="label"
              value={label}
              onChange={(e) => setLabel(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              placeholder="alice"
            />
            <div className="field__hint">Your agent will be named {label || "…"}.mandate.eth</div>
          </div>
          {registerError && (
            <div className="error-state error-state--spaced">
              <AlertTriangle size={16} strokeWidth={1.5} />
              <span>{registerError}</span>
            </div>
          )}
          <div className="page-header__actions">
            <button className="btn btn--primary" disabled={!label || registering} onClick={submitIdentity}>
              {registering && <Loader2 size={16} strokeWidth={1.5} className="spin" />}
              Register identity
            </button>
          </div>
        </div>
      )}

      {step === "gate" && agentName && (
        <div className="panel">
          <h3>2. Deploy your gate</h3>
          <p>
            {agentName} is registered. Now name an approver -- a separate address, ideally a hardware wallet, that
            must sign off before this agent's ownership or permissions can change.
          </p>
          <div className="field field--spaced">
            <label htmlFor="approver">Approver address</label>
            <input
              id="approver"
              className="mono"
              value={approver}
              onChange={(e) => setApprover(e.target.value)}
              placeholder="0x…"
            />
            <div className="field__hint">
              Paste your Ledger's address here. MetaMask with a Ledger connected works the same as any wallet --
              direct browser-to-Ledger connections only work on desktop Chrome or Edge.
            </div>
          </div>
          {gateWriteError && (
            <div className="error-state error-state--spaced">
              <AlertTriangle size={16} strokeWidth={1.5} />
              <span>{gateWriteError.message}</span>
            </div>
          )}
          <div className="page-header__actions">
            <button
              className="btn btn--primary"
              disabled={!approver || isGateTxPending || isGateTxConfirming}
              onClick={submitGate}
            >
              {(isGateTxPending || isGateTxConfirming) && <Loader2 size={16} strokeWidth={1.5} className="spin" />}
              Deploy gate
            </button>
          </div>
        </div>
      )}

      {step === "done" && agentName && (
        <div className="panel">
          <h3>Done</h3>
          <p>{agentName} is registered and its gate is live. Ownership transfers and permission escalations for it now need your approver's signature.</p>
          <div className="page-header__actions">
            <Link to={`/agents/${agentName}`} className="btn btn--primary">
              View agent
              <ArrowRight size={16} strokeWidth={1.5} />
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
