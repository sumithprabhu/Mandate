import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, AlertTriangle, Network } from "lucide-react";

import { api, type Agent } from "../lib/api";
import { fetchAgentsCrossQuery, type SubgraphAgent } from "../lib/subgraph";
import { deriveStatus, statusLabel } from "../lib/status";
import { subgraphEntityId } from "../lib/constants";
import { StatusDot } from "../components/StatusDot";

export function TrustPage() {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [subgraphData, setSubgraphData] = useState<Record<string, SubgraphAgent>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listAgents()
      .then(async (r) => {
        setAgents(r.agents);
        const ids = r.agents.map((a) => subgraphEntityId(a.agentId));
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
          <Network size={16} strokeWidth={1.5} />
          Cross-agent trust
        </div>
        <h1>Trust</h1>
        <p>Reputation feedback and gated-action history for every agent, in one query against the subgraph.</p>
      </div>

      {error && (
        <div className="panel error-state">
          <AlertTriangle size={20} strokeWidth={1.5} />
          <span>Could not load trust data: {error}</span>
        </div>
      )}

      {!error && agents === null && (
        <div className="panel empty-state">
          <Loader2 size={20} strokeWidth={1.5} className="spin" />
          <span>Loading agents and reputation data.</span>
        </div>
      )}

      {agents !== null && agents.length === 0 && (
        <div className="panel empty-state">
          <span>No agents registered yet. There is nothing to compare.</span>
        </div>
      )}

      {agents !== null && agents.length > 0 && (
        <div className="bento">
          {agents.map((agent) => {
            const sub = subgraphData[String(agent.agentId)];
            const actionCount = sub?.gatedActions.length ?? 0;
            const feedbackCount = sub?.feedback.length ?? 0;
            const status = sub ? deriveStatus(sub.gatedActions) : "confirmed";
            const span = actionCount + feedbackCount >= 2 ? 2 : 1;

            return (
              <div key={agent.agentId} className={`panel bento__cell--${span} agent-card`}>
                <div className="status-row">
                  <StatusDot status={status} />
                  {statusLabel(status)}
                </div>
                <Link to={`/agents/${agent.name}`} className="agent-card__name">
                  {agent.name}
                </Link>
                <div className="agent-card__meta">
                  <span>
                    Owner: <span className="mono">{agent.owner}</span>
                  </span>
                </div>

                <div className="detail-row">
                  <div className="action-status__label">Feedback</div>
                  {!sub ? (
                    <span className="field__hint">Loading.</span>
                  ) : sub.feedback.length === 0 ? (
                    <span className="field__hint">No feedback submitted yet.</span>
                  ) : (
                    <ul className="feedback-list">
                      {sub.feedback.map((f, i) => (
                        <li key={i}>
                          <span className={f.isRevoked ? "field__hint" : ""}>
                            {f.value}
                            {f.tag1 ? ` -- ${f.tag1}` : ""}
                            {f.isRevoked ? " (revoked)" : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="agent-card__count">
                  {actionCount === 0 ? "No gated actions" : `${actionCount} gated action${actionCount === 1 ? "" : "s"}`}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
