import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

import { api } from "../lib/api";
import { fetchAgentsCrossQuery } from "../lib/subgraph";
import { subgraphEntityId } from "../lib/constants";
import "../landing.css";

const CANONICAL_GATE = "0x8DAa03bACaa88a660F29AbCeB1a72cCD0ac50637";

export function HomePage() {
  const [agentCount, setAgentCount] = useState<number | null>(null);
  const [actionCount, setActionCount] = useState<number | null>(null);
  const [pendingCount, setPendingCount] = useState<number | null>(null);

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
      .catch(() => {
        setAgentCount(0);
        setActionCount(0);
        setPendingCount(0);
      });
  }, []);

  return (
    <div className="landing">
      <header className="landing-header">
        <span className="landing-header__brand">Mandate</span>
        <div className="landing-header__links">
          <Link to="/agents" className="landing-header__link">
            Agents
          </Link>
          <Link to="/trust" className="landing-header__link">
            Trust
          </Link>
          <Link to="/agents" className="landing-btn landing-btn--primary">
            Launch app
            <ArrowRight size={16} strokeWidth={1.5} />
          </Link>
        </div>
      </header>

      <div className="landing-hero">
        <div className="landing-hero__eyebrow">Sepolia testnet</div>
        <h1>A second signature, in hardware, before an agent's owner can change.</h1>
        <p>
          Mandate gives on-chain agents an ERC-8004 identity and an ENS name, then puts ownership transfers and
          permission escalations behind a PermissionGate. Nothing executes until an approver signs with a physically
          connected Ledger.
        </p>
        <div className="landing-hero__actions">
          <Link to="/agents" className="landing-btn landing-btn--primary">
            View agents
            <ArrowRight size={16} strokeWidth={1.5} />
          </Link>
          <a
            className="landing-btn landing-btn--outline"
            href={`https://sepolia.etherscan.io/address/${CANONICAL_GATE}`}
            target="_blank"
            rel="noreferrer"
          >
            View contract on Etherscan
          </a>
        </div>
      </div>

      <section className="landing-section--alt">
        <div className="landing-section-inner landing-stats">
          <div className="landing-stat">
            <div className="landing-stat__label">Agents registered</div>
            <div className="landing-stat__value">{agentCount === null ? "—" : agentCount}</div>
          </div>
          <div className="landing-stat">
            <div className="landing-stat__label">Gated actions recorded</div>
            <div className="landing-stat__value">{actionCount === null ? "—" : actionCount}</div>
          </div>
          <div className="landing-stat">
            <div className="landing-stat__label">Awaiting approval now</div>
            <div className="landing-stat__value">{pendingCount === null ? "—" : pendingCount}</div>
          </div>
          <div className="landing-stat">
            <div className="landing-stat__label">Chain</div>
            <div className="landing-stat__value landing-stat__value--text">Sepolia</div>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <h2>How a gated action works</h2>
        <div className="landing-steps">
          <div className="landing-step">
            <div className="landing-step__number">01</div>
            <p>An operator proposes an ownership transfer or a permission escalation for an agent.</p>
          </div>
          <div className="landing-step">
            <div className="landing-step__number">02</div>
            <p>The request sits blocked on the agent's PermissionGate. Nothing has happened on chain yet.</p>
          </div>
          <div className="landing-step">
            <div className="landing-step__number">03</div>
            <p>An approver reviews it and signs with a physically connected Ledger. Only then does it execute.</p>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <span>Mandate -- ERC-8004 identity, ENS naming, hardware-gated permission changes.</span>
        <a href={`https://sepolia.etherscan.io/address/${CANONICAL_GATE}`} target="_blank" rel="noreferrer">
          Canonical PermissionGate
        </a>
      </footer>
    </div>
  );
}
