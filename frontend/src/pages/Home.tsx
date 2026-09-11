import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Loader2, AlertTriangle } from "lucide-react";

import { api } from "../lib/api";
import { fetchAgentsCrossQuery } from "../lib/subgraph";
import { subgraphEntityId } from "../lib/constants";

const CANONICAL_GATE = "0x8DAa03bACaa88a660F29AbCeB1a72cCD0ac50637";

export function HomePage() {
  const [agentCount, setAgentCount] = useState<number | null>(null);
  const [actionCount, setActionCount] = useState<number | null>(null);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listAgents()
      .then(async (r) => {
        setAgentCount(r.agents.length);
        const ids = r.agents.map((a) => subgraphEntityId(a.agentId));
        const results = await fetchAgentsCrossQuery(ids);
        const allActions = results.flatMap((a) => a.gatedActions);
        setActionCount(allActions.length);
        setPendingCount(allActions.filter((a) => a.status === "Pending").length);
      })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <div className="page-header">
        <div className="page-header__eyebrow">Sepolia testnet</div>
        <h1>Mandate</h1>
        <p>
          Agent identity on ERC-8004, named through ENS, with a second gate in front of ownership transfers and
          permission escalations. Nothing executes until an approver signs on hardware -- a Ledger, not a hot key.
        </p>
        <div className="page-header__actions">
          <Link to="/agents" className="btn btn--primary">
            View agents
            <ArrowRight size={16} strokeWidth={1.5} />
          </Link>
        </div>
      </div>

      {error && (
        <div className="panel error-state">
          <AlertTriangle size={20} strokeWidth={1.5} />
          <span>Could not load live stats: {error}</span>
        </div>
      )}

      {!error && (
        <div className="bento">
          <div className="panel bento__cell--1 detail-row">
            <div className="action-status__label">Agents registered</div>
            <h2>{agentCount === null ? <Loader2 size={20} strokeWidth={1.5} className="spin" /> : agentCount}</h2>
          </div>
          <div className="panel bento__cell--1 detail-row">
            <div className="action-status__label">Gated actions recorded</div>
            <h2>{actionCount === null ? <Loader2 size={20} strokeWidth={1.5} className="spin" /> : actionCount}</h2>
          </div>
          <div className="panel bento__cell--1 detail-row">
            <div className="action-status__label">Awaiting approval right now</div>
            <h2>{pendingCount === null ? <Loader2 size={20} strokeWidth={1.5} className="spin" /> : pendingCount}</h2>
          </div>
          <Link to="/trust" className="panel bento__cell--1 detail-row">
            <div className="action-status__label">Cross-agent reputation</div>
            <div className="link-row">
              Open Trust
              <ArrowRight size={14} strokeWidth={1.5} />
            </div>
          </Link>
        </div>
      )}

      <div className="panel">
        <h3>How a gated action works</h3>
        <div className="step-list">
          <div className="step-list__item">1. An operator proposes an ownership transfer or a permission escalation for an agent.</div>
          <div className="step-list__item">2. The request sits blocked on the agent's PermissionGate. Nothing has happened on chain yet.</div>
          <div className="step-list__item">3. An approver reviews it and signs with a physically connected Ledger. Only then does it execute.</div>
        </div>
      </div>

      <a className="link-row" href={`https://sepolia.etherscan.io/address/${CANONICAL_GATE}`} target="_blank" rel="noreferrer">
        View the canonical PermissionGate on Etherscan
        <ArrowRight size={14} strokeWidth={1.5} />
      </a>
    </>
  );
}
