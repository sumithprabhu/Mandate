import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, Loader2, AlertTriangle, ExternalLink } from "lucide-react";

import { api, type Agent } from "../lib/api";
import { fetchAgent, type SubgraphAgent } from "../lib/subgraph";
import { resolveTextRecord, readLiveOwner } from "../lib/chain";
import { deriveStatus, statusLabel } from "../lib/status";
import { subgraphEntityId } from "../lib/constants";
import { StatusDot } from "../components/StatusDot";

const CAPABILITY_KEY = "mandate:capabilities";

function formatTimestamp(seconds: string | null): string {
  if (!seconds) return "—";
  return new Date(Number(seconds) * 1000).toLocaleString();
}

export function AgentDetailPage() {
  const { name } = useParams<{ name: string }>();
  const [agent, setAgent] = useState<Agent | null | undefined>(undefined);
  const [sub, setSub] = useState<SubgraphAgent | null>(null);
  const [liveOwner, setLiveOwner] = useState<string | null>(null);
  const [capability, setCapability] = useState<{ value: string | null; resolver: string | null } | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAgent(undefined);
    setSub(null);
    setLiveOwner(null);
    setCapability(undefined);
    setError(null);

    api
      .listAgents()
      .then((r) => {
        const found = r.agents.find((a) => a.name === name) ?? null;
        setAgent(found);
        if (!found) return;

        readLiveOwner(found.subregistry as `0x${string}`, found.tokenId).then(setLiveOwner);
        resolveTextRecord(found.name, CAPABILITY_KEY).then(setCapability);
        fetchAgent(subgraphEntityId(found.agentId))
          .then(setSub)
          .catch((e) => setError(e.message));
      })
      .catch((e) => setError(e.message));
  }, [name]);

  if (error) {
    return (
      <div className="panel error-state">
        <AlertTriangle size={20} strokeWidth={1.5} />
        <span>Could not load this agent: {error}</span>
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

  const actions = sub?.gatedActions ?? [];
  const status = sub ? deriveStatus(actions) : "confirmed";

  return (
    <>
      <div className="page-header">
        <div className="page-header__eyebrow">Agent profile</div>
        <h1>{agent.name}</h1>
        <p>Registered under {agent.parentName}, agent ID {agent.agentId}.</p>
        {agent.gate && (
          <div className="page-header__actions">
            <Link to={`/agents/${agent.name}/propose`} className="btn btn--primary">
              Propose action
              <ArrowRight size={16} strokeWidth={1.5} />
            </Link>
          </div>
        )}
      </div>

      <div className="bento">
        <div className="panel bento__cell--1">
          <div className="compare-pair__label">Current owner</div>
          {liveOwner === null ? (
            <div className="status-row">
              <Loader2 size={16} strokeWidth={1.5} className="spin" />
              Reading live owner.
            </div>
          ) : (
            <>
              <div className="mono">{liveOwner}</div>
              <div className="field__hint">Live-read from {agent.subregistry}</div>
            </>
          )}
        </div>

        <div className="panel bento__cell--1">
          <div className="compare-pair__label">Status</div>
          <div className="status-row">
            <StatusDot status={status} />
            {statusLabel(status)}
          </div>
        </div>

        <div className="panel bento__cell--2">
          <div className="compare-pair__label">Capability manifest</div>
          {capability === undefined ? (
            <div className="status-row">
              <Loader2 size={16} strokeWidth={1.5} className="spin" />
              Resolving through the Universal Resolver.
            </div>
          ) : capability.value ? (
            <>
              <div className="mono">{capability.value}</div>
              <div className="field__hint">
                Resolved key {CAPABILITY_KEY}, answered by <span className="mono">{capability.resolver}</span>
              </div>
            </>
          ) : (
            <div className="field__hint">No capability manifest set for this name.</div>
          )}
        </div>
      </div>

      <div className="panel panel--tight">
        <h3>Gated-action history</h3>
        {!sub && !error && (
          <div className="empty-state">
            <Loader2 size={16} strokeWidth={1.5} className="spin" />
            <span>Loading action history from the subgraph.</span>
          </div>
        )}
        {sub && actions.length === 0 && (
          <div className="empty-state">
            <span>No gated actions have been requested for this agent yet.</span>
          </div>
        )}
        {sub && actions.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Status</th>
                <th>Requested by</th>
                <th>Approved by</th>
                <th>Requested at</th>
                <th>Executed at</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((a, i) => (
                <tr key={i}>
                  <td>{a.actionType === "OwnershipTransfer" ? "Ownership transfer" : "Permission escalation"}</td>
                  <td>
                    <span className={`pill pill--${a.status === "Pending" ? "pending" : a.status === "Rejected" ? "blocked" : "confirmed"}`}>
                      {a.status}
                    </span>
                  </td>
                  <td className="mono">{a.requestedBy}</td>
                  <td className="mono">{a.approvedBy ?? "—"}</td>
                  <td className="mono">{formatTimestamp(a.requestedAt)}</td>
                  <td className="mono">{formatTimestamp(a.executedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {agent.gate && (
        <a
          className="link-row"
          href={`https://sepolia.etherscan.io/address/${agent.gate}`}
          target="_blank"
          rel="noreferrer"
        >
          View the PermissionGate on Etherscan
          <ExternalLink size={14} strokeWidth={1.5} />
        </a>
      )}
    </>
  );
}
