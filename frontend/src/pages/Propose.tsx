import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useAccount, useBalance, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ArrowLeftRight, KeyRound, Loader2, AlertTriangle, ArrowLeft } from "lucide-react";

import { api, type Agent } from "../lib/api";
import { fetchGateForAgent, type Gate } from "../lib/subgraph";
import { permissionGateAbi, encodeErc1155TransferCalldata, encodeSetText } from "../lib/chain";
import { ConnectWalletButton } from "../components/ConnectWalletButton";

type ActionKind = "transfer" | "escalate";

export function ProposePage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const { address: connectedAddress } = useAccount();
  const { data: balance } = useBalance({ address: connectedAddress });

  const [agent, setAgent] = useState<Agent | null | undefined>(undefined);
  const [selfServeGate, setSelfServeGate] = useState<Gate | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [kind, setKind] = useState<ActionKind>("transfer");
  const [newOwner, setNewOwner] = useState("");
  const [key, setKey] = useState("mandate:capabilities");
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { writeContract, data: txHash, isPending: isTxPending, error: writeError } = useWriteContract();
  const { data: receipt, isLoading: isTxConfirming } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    api
      .listAgents()
      .then(async (r) => {
        const found = r.agents.find((a) => a.name === name) ?? null;
        setAgent(found);
        if (found && !found.gate) {
          setSelfServeGate(await fetchGateForAgent(found.agentId));
        } else {
          setSelfServeGate(null);
        }
      })
      .catch((e) => setLoadError(e.message));
  }, [name]);

  useEffect(() => {
    if (!receipt || !agent) return;
    const gateAddress = (agent.gate ?? selfServeGate?.id ?? "").toLowerCase();
    const log = receipt.logs.find((l) => l.address.toLowerCase() === gateAddress);
    if (!log || !log.topics[1]) return;
    const actionId = BigInt(log.topics[1]).toString();
    navigate(`/actions/${actionId}/pending?agent=${agent.name}`);
  }, [receipt, agent, selfServeGate, navigate]);

  if (loadError) {
    return (
      <div className="panel error-state">
        <AlertTriangle size={20} strokeWidth={1.5} />
        <span>Could not load this agent: {loadError}</span>
      </div>
    );
  }

  if (agent === undefined || selfServeGate === undefined) {
    return (
      <div className="panel empty-state">
        <Loader2 size={20} strokeWidth={1.5} className="spin" />
        <span>Loading agent.</span>
      </div>
    );
  }

  if (agent === null) {
    return (
      <div className="panel empty-state">
        <span>No agent named {name}. Check the agents list for the exact registered name.</span>
      </div>
    );
  }

  const walletDirect = !agent.gate && !!selfServeGate;
  const gateAddress = agent.gate ?? selfServeGate?.id;

  if (!gateAddress) {
    return (
      <div className="panel empty-state">
        <span>{agent.name} has no PermissionGate configured. Actions cannot be proposed for it.</span>
      </div>
    );
  }

  if (walletDirect && selfServeGate && connectedAddress?.toLowerCase() !== selfServeGate.operator.toLowerCase()) {
    return (
      <div className="panel empty-state">
        <span>
          This agent's gate only accepts proposals from its operator (<span className="mono">{selfServeGate.operator}</span>
          ). Connect that wallet to propose an action.
        </span>
        <div className="page-header__actions">
          <ConnectWalletButton />
        </div>
      </div>
    );
  }

  async function submitLegacy() {
    setSubmitError(null);
    setSubmitting(true);
    try {
      if (kind === "transfer") {
        if (!newOwner) throw new Error("New owner address is required.");
        const r = await api.requestTransfer(agent!.agentId, newOwner);
        navigate(`/actions/${r.actionId}/pending?agent=${agent!.name}`);
      } else {
        if (!key || !value) throw new Error("Record key and value are both required.");
        const r = await api.requestEscalation(agent!.agentId, key, value);
        navigate(`/actions/${r.actionId}/pending?agent=${agent!.name}`);
      }
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  function submitWalletDirect() {
    setSubmitError(null);
    const gate = gateAddress as `0x${string}`;
    try {
      if (kind === "transfer") {
        if (!newOwner) throw new Error("New owner address is required.");
        const transferCalldata = encodeErc1155TransferCalldata(gate, newOwner as `0x${string}`, agent!.tokenId);
        writeContract({
          address: gate,
          abi: permissionGateAbi,
          functionName: "requestOwnershipTransfer",
          args: [agent!.subregistry as `0x${string}`, BigInt(agent!.tokenId), newOwner as `0x${string}`, transferCalldata],
        });
      } else {
        if (!key || !value) throw new Error("Record key and value are both required.");
        const data = encodeSetText(agent!.name, key, value);
        writeContract({
          address: gate,
          abi: permissionGateAbi,
          functionName: "requestPermissionEscalation",
          args: [agent!.resolver as `0x${string}`, data],
        });
      }
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    }
  }

  const submit = walletDirect ? submitWalletDirect : submitLegacy;
  const isSubmitting = walletDirect ? isTxPending || isTxConfirming : submitting;
  const error = submitError || writeError?.message;

  return (
    <>
      <Link to={`/agents/${agent.name}`} className="link-row">
        <ArrowLeft size={14} strokeWidth={1.5} />
        Back to {agent.name}
      </Link>

      <div className="page-header">
        <div className="page-header__eyebrow">Propose an action</div>
        <h1>{agent.name}</h1>
        <p>
          {walletDirect
            ? "This request is signed by your own wallet and blocked until the approver signs too. Nothing executes on submit."
            : "This request is blocked until the approver signs it. Nothing executes on submit."}
        </p>
      </div>

      {walletDirect && balance !== undefined && balance.value === 0n && (
        <div className="panel error-state">
          <AlertTriangle size={20} strokeWidth={1.5} />
          <span>
            Your connected wallet has no Sepolia ETH, so it can't pay gas for this transaction. Get free testnet ETH
            from a{" "}
            <a href="https://cloud.google.com/application/web3/faucet/ethereum/sepolia" target="_blank" rel="noreferrer">
              Sepolia faucet
            </a>
            .
          </span>
        </div>
      )}

      <div className="radio-group">
        <div
          className={`panel radio-option${kind === "transfer" ? " selected" : ""}`}
          onClick={() => setKind("transfer")}
        >
          <div className="radio-option__title">
            <ArrowLeftRight size={16} strokeWidth={1.5} />
            Ownership transfer
          </div>
          <div className="radio-option__desc">Move this agent's token to a new owner address.</div>
        </div>
        <div
          className={`panel radio-option${kind === "escalate" ? " selected" : ""}`}
          onClick={() => setKind("escalate")}
        >
          <div className="radio-option__title">
            <KeyRound size={16} strokeWidth={1.5} />
            Permission escalation
          </div>
          <div className="radio-option__desc">Write a text record through the gate's escalation path.</div>
        </div>
      </div>

      <div className="panel">
        {kind === "transfer" ? (
          <div className="field">
            <label htmlFor="new-owner">New owner address</label>
            <input
              id="new-owner"
              className="mono"
              value={newOwner}
              onChange={(e) => setNewOwner(e.target.value)}
              placeholder="0x…"
            />
            <div className="field__hint">The address that will own this agent's token once approved.</div>
          </div>
        ) : (
          <>
            <div className="field">
              <label htmlFor="record-key">Record key</label>
              <input id="record-key" className="mono" value={key} onChange={(e) => setKey(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="record-value">Record value</label>
              <input id="record-value" className="mono" value={value} onChange={(e) => setValue(e.target.value)} />
              <div className="field__hint">Written to the agent's resolver once the approver signs.</div>
            </div>
          </>
        )}
      </div>

      {error && (
        <div className="panel error-state">
          <AlertTriangle size={20} strokeWidth={1.5} />
          <span>{error}</span>
        </div>
      )}

      <div className="page-header__actions">
        <button className="btn btn--primary" onClick={submit} disabled={isSubmitting}>
          {isSubmitting && <Loader2 size={16} strokeWidth={1.5} className="spin" />}
          {kind === "transfer" ? "Propose transfer" : "Propose escalation"}
        </button>
      </div>
    </>
  );
}
