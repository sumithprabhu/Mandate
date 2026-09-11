import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, Loader2, AlertTriangle } from "lucide-react";

import { api, type Agent } from "../lib/api";
import { fetchAgentsCrossQuery, type SubgraphAgent } from "../lib/subgraph";
import { deriveStatus } from "../lib/status";
import { StatusDot } from "../components/StatusDot";
import { subgraphEntityId } from "../lib/constants";

export function AgentsPage() {
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
          <Bot size={16} strokeWidth={1.5} />
          Registered agents
        </div>
        <h1>Agents</h1>
        <p>Every agent registered under this project, with its current gated-action state.</p>
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
            const span = actionCount >= 2 ? 2 : 1;
            return (
              <Link key={agent.agentId} to={`/agents/${agent.name}`} className={`panel bento__cell--${span} agent-card`}>
                <div className="status-row">
                  <StatusDot status={status} />
                  {status === "pending" ? "Awaiting confirmation" : status === "blocked" ? "Blocked" : "Confirmed"}
                </div>
                <div className="agent-card__name">{agent.name}</div>
                <div className="agent-card__meta">
                  <span>
                    Owner: <span className="mono">{agent.owner}</span>
                  </span>
                  <span>
                    Agent ID: <span className="mono">{agent.agentId}</span>
                  </span>
                </div>
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
