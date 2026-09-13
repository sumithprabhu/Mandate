import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, Loader2, AlertTriangle, MessageSquare, Info } from "lucide-react";

import { api, type Agent } from "../lib/api";
import { fetchAgentsCrossQuery, type SubgraphAgent } from "../lib/subgraph";
import { deriveStatus, statusLabel } from "../lib/status";
import { scaleFeedbackValue } from "../lib/format";
import { StatusDot } from "../components/StatusDot";
import { CopyableAddress } from "../components/CopyableAddress";
import { subgraphEntityId } from "../lib/constants";

// The one legacy deployment (docs/mandate.md) with known gaps -- its gate doesn't hold
// custody and its resolver is writable directly by the owner. Kept in the backend
// directory for internal comparison, not shown in the product-facing list.
const LEGACY_PARENT = "agentns.eth";

const STATUS_LEGEND_TEXT =
  "Confirmed -- no action pending\nAwaiting confirmation -- awaiting the approver's signature\nBlocked -- last request was rejected";

function ReputationSummary({ agent }: { agent: SubgraphAgent | undefined }) {
  if (!agent) return <span className="field__hint">Loading feedback.</span>;

  const live = agent.feedback.filter((f) => !f.isRevoked);
  if (live.length === 0) return <span className="field__hint">No feedback yet.</span>;

  const avg = live.reduce((sum, f) => sum + scaleFeedbackValue(f.value, f.valueDecimals), 0) / live.length;
  const tag = live.find((f) => f.tag1)?.tag1;

  return (
    <span className="reputation">
      <MessageSquare size={13} strokeWidth={1.5} />
      <span className="reputation__score">{avg.toFixed(0)}</span>
      <span className="field__hint">
        avg of {agent.totalFeedback} review{agent.totalFeedback === "1" ? "" : "s"}
        {tag ? ` · "${tag}"` : ""}
      </span>
    </span>
  );
}

export function AgentsPage() {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [subgraphData, setSubgraphData] = useState<Record<string, SubgraphAgent>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listAgents()
      .then(async (r) => {
        const visible = r.agents.filter((a) => a.parentName !== LEGACY_PARENT);
        setAgents(visible);
        const ids = visible.map((a) => subgraphEntityId(a.agentId));
        const results = await fetchAgentsCrossQuery(ids);
        const byId: Record<string, SubgraphAgent> = {};
        for (const a of results) byId[a.agentId] = a;
        setSubgraphData(byId);
      })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <div className="page-header">
        <div className="page-header__eyebrow">
          <Bot size={16} strokeWidth={1.5} />
          Registered agents
        </div>
        <h1>Agents</h1>
        <p>
          AI agents with an on-chain identity. Sensitive actions on any agent below require a second, hardware-signed
          approval before they take effect -- that approval state is what "Confirmed / Pending / Blocked" describes.{" "}
          <span className="info-hint" title={STATUS_LEGEND_TEXT}>
            <Info size={14} strokeWidth={1.5} />
            What do these mean?
          </span>
        </p>
      </div>

      {error && (
        <div className="panel error-state">
          <AlertTriangle size={20} strokeWidth={1.5} />
          <span>Could not load the agent list: {error}</span>
        </div>
      )}

      {!error && agents === null && (
        <div className="panel empty-state">
          <Loader2 size={20} strokeWidth={1.5} className="spin" />
          <span>Loading agents from the backend.</span>
        </div>
      )}

      {agents !== null && agents.length === 0 && (
        <div className="panel empty-state">
          <span>No agents registered yet. Register one from the backend before anything shows up here.</span>
        </div>
      )}

      {agents !== null && agents.length > 0 && (
        <div className="bento">
          {agents.map((agent) => {
            const sub = subgraphData[String(agent.agentId)];
            const actionCount = sub?.gatedActions.length ?? 0;
            const status = sub ? deriveStatus(sub.gatedActions) : "confirmed";
            return (
              <Link key={agent.agentId} to={`/agents/${agent.name}`} className="panel bento__cell--1 agent-card">
                <div className="status-row">
                  <StatusDot status={status} />
                  {statusLabel(status)}
                </div>
                <div className="agent-card__name">{agent.name}</div>
                <div className="agent-card__meta">
                  <span>
                    Owner: <CopyableAddress address={agent.owner} />
                  </span>
                </div>
                <ReputationSummary agent={sub} />
                <div className="agent-card__count">
                  {actionCount === 0 ? "No gated actions yet" : `${actionCount} gated action${actionCount === 1 ? "" : "s"}`}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
