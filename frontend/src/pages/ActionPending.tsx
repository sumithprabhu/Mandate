import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { Loader2, AlertTriangle, ArrowLeft } from "lucide-react";

import { api, type Agent, type GateAction } from "../lib/api";

const POLL_MS = 3000;
const RESOLVE_DELAY_MS = 900;

function formatTimestamp(seconds: string): string {
  return new Date(Number(seconds) * 1000).toLocaleString();
}

export function ActionPendingPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const agentName = params.get("agent");
  const navigate = useNavigate();

  const [agent, setAgent] = useState<Agent | null | undefined>(undefined);
  const [action, setAction] = useState<GateAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resolvedRef = useRef(false);

  useEffect(() => {
    if (!agentName) {
      setError("No agent specified for this action -- reload from the agent's page.");
      return;
    }
    api
      .listAgents()
      .then((r) => setAgent(r.agents.find((a) => a.name === agentName) ?? null))
      .catch((e) => setError(e.message));
  }, [agentName]);

  useEffect(() => {
    if (!agent || !id) return;

    let cancelled = false;
    async function poll() {
      try {
        const r = await api.getAction(agent!.agentId, id!);
        if (cancelled) return;
        setAction(r.action);
        if (r.action.status !== "Pending" && !resolvedRef.current) {
          resolvedRef.current = true;
          setTimeout(() => {
            if (!cancelled) navigate(`/actions/${id}/result?agent=${agentName}`);
          }, RESOLVE_DELAY_MS);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }

    poll();
    const interval = setInterval(() => {
      if (!resolvedRef.current) poll();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [agent, id, agentName, navigate]);

  if (error) {
    return (
      <div className="panel error-state">
        <AlertTriangle size={20} strokeWidth={1.5} />
        <span>{error}</span>
      </div>
    );
  }

  if (agent === undefined || agent === null || !action) {
    return (
      <div className="panel empty-state">
        <Loader2 size={20} strokeWidth={1.5} className="spin" />
        <span>Loading action status.</span>
      </div>
    );
  }

  const ledClass = action.status === "Pending" ? "led--pending" : action.status === "Rejected" ? "led--blocked" : "led--confirmed";
  const headline =
    action.status === "Pending"
      ? "Waiting for approval"
      : action.status === "Rejected"
      ? "Rejected"
      : "Confirmed";
  const description =
    action.status === "Pending"
      ? "This request needs the approver's signature before it can execute. Nothing has happened on chain yet."
      : action.status === "Rejected"
      ? "The approver rejected this request. It will not execute."
      : "The approver signed and it has been relayed on chain.";

  return (
    <>
      <Link to={`/agents/${agent.name}`} className="link-row">
        <ArrowLeft size={14} strokeWidth={1.5} />
        Back to {agent.name}
      </Link>

      <div className="panel action-status">
        <span className={`led ${ledClass}`} />
        <div>
          <h1>{headline}</h1>
          <p>{description}</p>
        </div>
      </div>

      <div className="panel bento">
        <div className="bento__cell--1 detail-row">
          <div className="action-status__label">Action type</div>
          <div>{action.actionType === "OwnershipTransfer" ? "Ownership transfer" : "Permission escalation"}</div>
        </div>
        <div className="bento__cell--1 detail-row">
          <div className="action-status__label">Requested by</div>
          <div className="mono">{action.requestedBy}</div>
        </div>
        <div className="bento__cell--1 detail-row">
          <div className="action-status__label">Requested at</div>
          <div className="mono">{formatTimestamp(action.requestedAt)}</div>
        </div>
        <div className="bento__cell--1 detail-row">
          <div className="action-status__label">Agent</div>
          <div>{agent.name}</div>
        </div>
      </div>
    </>
  );
}
