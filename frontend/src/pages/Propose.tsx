import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeftRight, KeyRound, Loader2, AlertTriangle, ArrowLeft } from "lucide-react";

import { api, type Agent } from "../lib/api";

type ActionKind = "transfer" | "escalate";

export function ProposePage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();

  const [agent, setAgent] = useState<Agent | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [kind, setKind] = useState<ActionKind>("transfer");
  const [newOwner, setNewOwner] = useState("");
  const [key, setKey] = useState("mandate:capabilities");
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listAgents()
      .then((r) => setAgent(r.agents.find((a) => a.name === name) ?? null))
      .catch((e) => setLoadError(e.message));
  }, [name]);

  if (loadError) {
    return (
      <div className="panel error-state">
        <AlertTriangle size={20} strokeWidth={1.5} />
        <span>Could not load this agent: {loadError}</span>
      </div>
    );
  }

  if (agent === undefined) {
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

  if (!agent.gate) {
    return (
      <div className="panel empty-state">
        <span>{agent.name} has no PermissionGate configured. Actions cannot be proposed for it.</span>
      </div>
    );
  }

  async function submit() {
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

  return (
    <>
      <Link to={`/agents/${agent.name}`} className="link-row">
        <ArrowLeft size={14} strokeWidth={1.5} />
        Back to {agent.name}
      </Link>

      <div className="page-header">
        <div className="page-header__eyebrow">Propose an action</div>
        <h1>{agent.name}</h1>
        <p>This request is blocked until the approver signs it. Nothing executes on submit.</p>
      </div>

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

      {submitError && (
        <div className="panel error-state">
          <AlertTriangle size={20} strokeWidth={1.5} />
          <span>{submitError}</span>
        </div>
      )}

      <div className="page-header__actions">
        <button className="btn btn--primary" onClick={submit} disabled={submitting}>
          {submitting && <Loader2 size={16} strokeWidth={1.5} className="spin" />}
          {kind === "transfer" ? "Propose transfer" : "Propose escalation"}
        </button>
      </div>
    </>
  );
}
