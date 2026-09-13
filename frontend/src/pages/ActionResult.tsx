import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { ArrowRight, ArrowLeft, Loader2, AlertTriangle, ExternalLink } from "lucide-react";

import { api, type Agent } from "../lib/api";
import { fetchGatedAction, fetchAgent, fetchGateForAgent, type FullGatedAction } from "../lib/subgraph";
import { decodeEscalationData } from "../lib/chain";
import { subgraphEntityId } from "../lib/constants";

function formatTimestamp(seconds: string | null): string {
  if (!seconds) return "—";
  return new Date(Number(seconds) * 1000).toLocaleString();
}

export function ActionResultPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const agentHint = params.get("agent");

  const [hintAgent, setHintAgent] = useState<Agent | null | undefined>(undefined);
  const [action, setAction] = useState<FullGatedAction | null | undefined>(undefined);
  const [resolvedAgent, setResolvedAgent] = useState<Agent | null>(null);
  const [resolvedGate, setResolvedGate] = useState<string | null>(null);
  const [before, setBefore] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!agentHint || !id) {
      setError("No agent specified for this action. Reload from the agent's page.");
      return;
    }

    api
      .listAgents()
      .then(async (r) => {
        const hint = r.agents.find((a) => a.name === agentHint) ?? null;
        setHintAgent(hint);
        if (!hint) {
          setAction(null);
          return;
        }

        // Self-serve gates aren't recorded on the backend agent record at all (see
        // lib/subgraph.ts::fetchGateForAgent) -- fall back to the subgraph's Gate entity.
        const gate = hint.gate ?? (await fetchGateForAgent(hint.agentId))?.id ?? null;
        setResolvedGate(gate);
        if (!gate) {
          setAction(null);
          return;
        }

        const found = await fetchGatedAction(gate, id);
        setAction(found);
        if (!found) return;

        // Actions belong to a PermissionGate, not to one agent -- every legacy mandate.eth
        // agent shares one canonical gate, so the URL's agent hint can point at the wrong
        // one. Trust the indexed attribution instead where it's available.
        const real = found.agentId ? r.agents.find((a) => String(a.agentId) === found.agentId) ?? hint : hint;
        setResolvedAgent(real);

        const history = await fetchAgent(subgraphEntityId(real.agentId));
        if (!history) return;
        const sameType = history.gatedActions.filter((a) => a.actionType === found.actionType);
        const idx = sameType.findIndex((a) => a.requestedAt === found.requestedAt && a.requestedBy === found.requestedBy);
        const older = sameType[idx + 1];

        if (found.actionType === "OwnershipTransfer") {
          setBefore(older?.newOwner ?? gate ?? null);
        } else if (found.escalationData) {
          const olderDecoded = older?.escalationData ? decodeEscalationData(older.escalationData as `0x${string}`) : null;
          setBefore(olderDecoded?.value ?? null);
        }
      })
      .catch((e) => setError(e.message));
  }, [agentHint, id]);

  if (error) {
    return (
      <div className="panel error-state">
        <AlertTriangle size={20} strokeWidth={1.5} />
        <span>{error}</span>
      </div>
    );
  }

  if (hintAgent === undefined || action === undefined) {
    return (
      <div className="panel empty-state">
        <Loader2 size={20} strokeWidth={1.5} className="spin" />
        <span>Loading result.</span>
      </div>
    );
  }

  if (!hintAgent || !action) {
    return (
      <div className="panel empty-state">
        <span>No record of action {id} for {agentHint}.</span>
      </div>
    );
  }

  const agent = resolvedAgent ?? hintAgent;
  const isRejected = action.status === "Rejected";
  const escalation = action.escalationData ? decodeEscalationData(action.escalationData as `0x${string}`) : null;
  const afterValue = action.actionType === "OwnershipTransfer" ? action.newOwner : escalation?.value ?? null;

  return (
    <>
      <Link to={`/agents/${agent.name}`} className="link-row">
        <ArrowLeft size={14} strokeWidth={1.5} />
        Back to {agent.name}
      </Link>

      <div className="panel action-status">
        <span className={`led ${isRejected ? "led--blocked" : "led--confirmed"}`} />
        <div>
          <h1>{isRejected ? "Rejected" : "Confirmed"}</h1>
          <p>
            {isRejected
              ? "The approver rejected this request. It did not execute."
              : "The approver signed and this executed on chain."}
          </p>
        </div>
      </div>

      {!isRejected && afterValue && (
        <div className="panel">
          <h3>{action.actionType === "OwnershipTransfer" ? "Ownership" : escalation?.key ?? "Record"}</h3>
          <div className="compare-pair">
            <div>
              <div className="compare-pair__label">Before</div>
              <div className="compare-pair__value mono">{before ?? "Not previously set"}</div>
            </div>
            <ArrowRight size={20} strokeWidth={1.5} />
            <div>
              <div className="compare-pair__label">After</div>
              <div className="compare-pair__value mono">{afterValue}</div>
            </div>
          </div>
        </div>
      )}

      <div className="panel bento">
        <div className="bento__cell--1 detail-row">
          <div className="action-status__label">Requested by</div>
          <div className="mono">{action.requestedBy}</div>
        </div>
        <div className="bento__cell--1 detail-row">
          <div className="action-status__label">Approved by</div>
          <div className="mono">{action.approvedBy ?? "—"}</div>
        </div>
        <div className="bento__cell--1 detail-row">
          <div className="action-status__label">Requested at</div>
          <div className="mono">{formatTimestamp(action.requestedAt)}</div>
        </div>
        <div className="bento__cell--1 detail-row">
          <div className="action-status__label">Executed at</div>
          <div className="mono">{formatTimestamp(action.executedAt)}</div>
        </div>
      </div>

      {resolvedGate && (
        <a className="link-row" href={`https://sepolia.etherscan.io/address/${resolvedGate}`} target="_blank" rel="noreferrer">
          View the PermissionGate on Etherscan
          <ExternalLink size={14} strokeWidth={1.5} />
        </a>
      )}
    </>
  );
}
