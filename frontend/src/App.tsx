import { useEffect, useState } from "react";
import { api, type Agent } from "./lib/api";
import { connectWallet, hasInjectedWallet, signApproval } from "./lib/wallet";

// v1: nominal UI, just enough to exercise every backend endpoint. Not designed -- plain
// forms and lists, no component library. Real design pass comes later.

function useAgents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    setLoading(true);
    api
      .listAgents()
      .then((r) => setAgents(r.agents))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);
  return { agents, loading, error, refresh };
}

function RegisterAgentForm({ onRegistered }: { onRegistered: () => void }) {
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!label) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await api.registerAgent(label);
      setResult(`Registered ${r.agent.name} -- agentId ${r.agent.agentId} (tx ${r.registerTx.slice(0, 10)}...)`);
      setLabel("");
      onRegistered();
    } catch (e) {
      setResult(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel">
      <h3>Register new agent</h3>
      <p className="hint">Registers &lt;label&gt;.agentns.eth under the project's existing namespace. Real Sepolia transaction, ~15-30s.</p>
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="label, e.g. agent3" disabled={busy} />
      <button type="submit" disabled={busy || !label}>
        {busy ? "Registering..." : "Register"}
      </button>
      {result && <p className="result">{result}</p>}
    </form>
  );
}

function ActionRow({
  agentId,
  actionId,
  action,
  wallet,
  onUpdated,
}: {
  agentId: number;
  actionId: string;
  action: Awaited<ReturnType<typeof api.getAction>>["action"];
  wallet: string | null;
  onUpdated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    if (!wallet) return setError("connect a wallet first");
    setBusy(true);
    setError(null);
    try {
      const { typedData } = await api.getTypedData(agentId, actionId);
      const signature = await signApproval(wallet as `0x${string}`, typedData);
      await api.approveAction(agentId, actionId, signature);
      onUpdated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={`action action-${action.status.toLowerCase()}`}>
      <div>
        <strong>#{actionId}</strong> {action.actionType} -- <span className="status">{action.status}</span>
      </div>
      <div className="hint">
        requested by {action.requestedBy.slice(0, 10)}...
        {action.actionType === "OwnershipTransfer" && action.newOwner !== "0x0000000000000000000000000000000000000000" && (
          <> -&gt; new owner {action.newOwner.slice(0, 10)}...</>
        )}
      </div>
      {action.status === "Pending" && (
        <button onClick={approve} disabled={busy}>
          {busy ? "Signing + relaying..." : "Approve (sign with connected wallet)"}
        </button>
      )}
      {error && <p className="error">{error}</p>}
    </li>
  );
}

function AgentDetail({ agent, wallet, onDirectoryChange }: { agent: Agent; wallet: string | null; onDirectoryChange: () => void }) {
  const [profile, setProfile] = useState<unknown>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [actions, setActions] = useState<Record<string, Awaited<ReturnType<typeof api.getAction>>["action"]>>({});
  const [escalateKey, setEscalateKey] = useState("");
  const [escalateValue, setEscalateValue] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setProfile(null);
    setProfileError(null);
    api
      .getProfile(agent.agentId)
      .then((r) => setProfile(r.profile))
      .catch((e) => setProfileError(e.message));
  }, [agent.agentId]);

  async function refreshAction(actionId: string) {
    const r = await api.getAction(agent.agentId, actionId);
    setActions((prev) => ({ ...prev, [actionId]: r.action }));
  }

  async function submitEscalate(e: React.FormEvent) {
    e.preventDefault();
    setBusy("escalate");
    setMessage(null);
    try {
      const r = await api.requestEscalation(agent.agentId, escalateKey, escalateValue);
      setMessage(`Requested, actionId ${r.actionId} (target ${r.target.slice(0, 10)}...) -- pending approval below`);
      await refreshAction(r.actionId);
      setEscalateKey("");
      setEscalateValue("");
    } catch (e) {
      setMessage(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function submitTransfer(e: React.FormEvent) {
    e.preventDefault();
    setBusy("transfer");
    setMessage(null);
    try {
      const r = await api.requestTransfer(agent.agentId, transferTo);
      setMessage(`Requested, actionId ${r.actionId} -- ${r.note}`);
      await refreshAction(r.actionId);
      setTransferTo("");
    } catch (e) {
      setMessage(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="panel">
      <h2>{agent.name}</h2>
      <p className="hint">agentId {agent.agentId} -- owner {agent.owner}</p>

      <section>
        <h3>Profile (subgraph)</h3>
        {profileError && <p className="hint">{profileError}</p>}
        {!profileError && !profile && <p className="hint">Loading...</p>}
        {profile !== null && profile !== undefined && (
          <pre className="json">{JSON.stringify(profile, null, 2)}</pre>
        )}
      </section>

      <section>
        <h3>Request permission escalation</h3>
        <p className="hint">
          Writes a resolver text record, gated behind approval. Targets {agent.gatedResolver ? "the gate-only-writable demo resolver" : "no configured gated resolver"}.
        </p>
        <form onSubmit={submitEscalate}>
          <input value={escalateKey} onChange={(e) => setEscalateKey(e.target.value)} placeholder="record key" disabled={busy === "escalate"} />
          <input value={escalateValue} onChange={(e) => setEscalateValue(e.target.value)} placeholder="record value" disabled={busy === "escalate"} />
          <button type="submit" disabled={busy === "escalate" || !escalateKey || !escalateValue}>
            {busy === "escalate" ? "Requesting..." : "Request"}
          </button>
        </form>
      </section>

      <section>
        <h3>Request ownership transfer</h3>
        <p className="hint">
          {agent.gate
            ? "The gate must hold custody of the token for this to actually execute -- see docs/backend.md. The request itself always succeeds."
            : "No PermissionGate configured for this agent."}
        </p>
        <form onSubmit={submitTransfer}>
          <input value={transferTo} onChange={(e) => setTransferTo(e.target.value)} placeholder="new owner address" disabled={busy === "transfer"} />
          <button type="submit" disabled={busy === "transfer" || !transferTo}>
            {busy === "transfer" ? "Requesting..." : "Request"}
          </button>
        </form>
      </section>

      {message && <p className="result">{message}</p>}

      {Object.keys(actions).length > 0 && (
        <section>
          <h3>Pending actions</h3>
          <ul className="actions">
            {Object.entries(actions).map(([actionId, action]) => (
              <ActionRow
                key={actionId}
                agentId={agent.agentId}
                actionId={actionId}
                action={action}
                wallet={wallet}
                onUpdated={() => {
                  refreshAction(actionId);
                  onDirectoryChange();
                }}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default function App() {
  const { agents, loading, error, refresh } = useAgents();
  const [selected, setSelected] = useState<number | null>(null);
  const [wallet, setWallet] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);

  async function onConnect() {
    setWalletError(null);
    try {
      const address = await connectWallet();
      setWallet(address);
    } catch (e) {
      setWalletError((e as Error).message);
    }
  }

  const selectedAgent = agents.find((a) => a.agentId === selected) ?? null;

  return (
    <div className="app">
      <header>
        <h1>AgentNS</h1>
        <div className="wallet">
          {wallet ? (
            <span className="hint">
              connected: {wallet.slice(0, 6)}...{wallet.slice(-4)}
            </span>
          ) : (
            <button onClick={onConnect} disabled={!hasInjectedWallet()}>
              {hasInjectedWallet() ? "Connect wallet" : "No injected wallet found"}
            </button>
          )}
          {walletError && <p className="error">{walletError}</p>}
        </div>
      </header>

      <main>
        <div className="panel">
          <h3>Agents</h3>
          {loading && <p className="hint">Loading...</p>}
          {error && <p className="error">{error}</p>}
          <ul className="agent-list">
            {agents.map((a) => (
              <li key={a.agentId}>
                <button className={a.agentId === selected ? "selected" : ""} onClick={() => setSelected(a.agentId)}>
                  {a.name} <span className="hint">#{a.agentId}</span>
                </button>
              </li>
            ))}
          </ul>
          <RegisterAgentForm onRegistered={refresh} />
        </div>

        {selectedAgent ? (
          <AgentDetail agent={selectedAgent} wallet={wallet} onDirectoryChange={refresh} />
        ) : (
          <div className="panel">
            <p className="hint">Select an agent to view its profile and pending actions.</p>
          </div>
        )}
      </main>
    </div>
  );
}
