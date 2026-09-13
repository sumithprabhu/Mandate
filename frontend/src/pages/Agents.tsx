import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, AlertTriangle, MessageSquare, Info, Search } from "lucide-react";

import { api, type Agent } from "../lib/api";
import { fetchAgentsCrossQuery, type SubgraphAgent } from "../lib/subgraph";
import { deriveStatus, statusLabel, type Status } from "../lib/status";
import { scaleFeedbackValue } from "../lib/format";
import { StatusDot } from "../components/StatusDot";
import { CopyableAddress } from "../components/CopyableAddress";
import { subgraphEntityId } from "../lib/constants";

// The one legacy deployment (docs/mandate.md) with known gaps -- its gate doesn't hold
// custody and its resolver is writable directly by the owner. Kept in the backend
// directory for internal comparison, not shown in the product-facing list.
const LEGACY_PARENT = "agentns.eth";

const STATUS_LEGEND: { status: Status; hint: string }[] = [
  { status: "confirmed", hint: "no action pending" },
  { status: "pending", hint: "awaiting the approver's signature" },
  { status: "blocked", hint: "last request was rejected" },
];

function StatusLegendHint() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <span className="info-hint" ref={ref}>
      <button type="button" className="info-hint__trigger" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Info size={14} strokeWidth={1.5} />
        What do these mean?
      </button>
      {open && (
        <div className="info-popover">
          {STATUS_LEGEND.map(({ status, hint }) => (
            <div key={status} className="info-popover__item">
              <StatusDot status={status} />
              <span>
                <strong>{statusLabel(status)}:</strong> {hint}
              </span>
            </div>
          ))}
        </div>
      )}
    </span>
  );
}

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

const STATUS_FILTERS: { value: "all" | Status; label: string }[] = [
  { value: "all", label: "All" },
  { value: "confirmed", label: "Confirmed" },
  { value: "pending", label: "Pending" },
  { value: "blocked", label: "Blocked" },
];

export function AgentsPage() {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [subgraphData, setSubgraphData] = useState<Record<string, SubgraphAgent>>({});
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");

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

  const visibleAgents = useMemo(() => {
    if (!agents) return null;
    const q = search.trim().toLowerCase();
    return agents.filter((agent) => {
      const sub = subgraphData[String(agent.agentId)];
      const status = sub ? deriveStatus(sub.gatedActions) : "confirmed";
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (q && !agent.name.toLowerCase().includes(q) && !agent.owner.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [agents, subgraphData, search, statusFilter]);

  return (
    <>
      <div className="page-header">
        <h1>Agents</h1>
        <p>
          AI agents with an on-chain identity. Sensitive actions on any agent below require a second, hardware-signed
          approval before they take effect. That approval state is what "Confirmed / Pending / Blocked" describes.{" "}
          <StatusLegendHint />
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
        <div className="agents-toolbar">
          <div className="search-input">
            <Search size={16} strokeWidth={1.5} />
            <input
              type="text"
              placeholder="Search by name or owner address"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="filter-pills">
            {STATUS_FILTERS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={`filter-pill${statusFilter === value ? " active" : ""}`}
                onClick={() => setStatusFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {visibleAgents !== null && visibleAgents.length === 0 && agents !== null && agents.length > 0 && (
        <div className="panel empty-state">
          <span>
            No agents match
            {search ? ` "${search}"` : ""}
            {statusFilter !== "all" ? `${search ? " with status" : " status"} ${statusFilter}` : ""}.
          </span>
        </div>
      )}

      {visibleAgents !== null && visibleAgents.length > 0 && (
        <div className="bento">
          {visibleAgents.map((agent) => {
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
