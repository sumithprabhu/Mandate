import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, MotionConfig } from "motion/react";
import { ArrowRight } from "lucide-react";

import { api } from "../lib/api";
import { fetchAgentsCrossQuery } from "../lib/subgraph";
import { subgraphEntityId } from "../lib/constants";
import { AnimatedCounter } from "../components/AnimatedCounter";
import { LivePreviewCard } from "../components/LivePreviewCard";
import "../landing.css";

const CANONICAL_GATE = "0x8DAa03bACaa88a660F29AbCeB1a72cCD0ac50637";
const MotionLink = motion.create(Link);

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

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
    <MotionConfig reducedMotion="user">
      <div className="landing">
        <div className="landing-band">
          <motion.header
            className="landing-header"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="landing-header__brand">Mandate</span>
            <div className="landing-header__links">
              <Link to="/agents" className="landing-header__link">
                Agents
              </Link>
              <Link to="/trust" className="landing-header__link">
                Trust
              </Link>
              <MotionLink
                to="/agents"
                className="landing-btn landing-btn--primary"
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
              >
                Launch app
                <ArrowRight size={16} strokeWidth={1.5} />
              </MotionLink>
            </div>
          </motion.header>

          <motion.div className="landing-hero" variants={stagger} initial="hidden" animate="show">
            <motion.div className="landing-hero__eyebrow" variants={fadeUp}>
              Sepolia testnet
            </motion.div>
            <motion.h1 variants={fadeUp}>
              A second signature, in hardware, before an agent's owner can change.
            </motion.h1>
            <motion.p variants={fadeUp}>
              Mandate gives on-chain agents an ERC-8004 identity and an ENS name, then puts ownership transfers and
              permission escalations behind a PermissionGate. Nothing executes until an approver signs with a
              physically connected Ledger.
            </motion.p>
            <motion.div className="landing-hero__actions" variants={fadeUp}>
              <MotionLink
                to="/agents"
                className="landing-btn landing-btn--primary"
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
              >
                View agents
                <ArrowRight size={16} strokeWidth={1.5} />
              </MotionLink>
              <motion.a
                className="landing-btn landing-btn--outline"
                href={`https://sepolia.etherscan.io/address/${CANONICAL_GATE}`}
                target="_blank"
                rel="noreferrer"
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
              >
                View contract on Etherscan
              </motion.a>
            </motion.div>
          </motion.div>

          <div className="landing-preview">
            <LivePreviewCard />
          </div>
        </div>

        <section className="landing-section--alt">
          <motion.div
            className="landing-section-inner landing-stats"
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
          >
            <motion.div className="landing-stat" variants={fadeUp} whileHover={{ y: -4 }}>
              <div className="landing-stat__label">Agents registered</div>
              <div className="landing-stat__value">
                {agentCount === null ? "—" : <AnimatedCounter value={agentCount} />}
              </div>
            </motion.div>
            <motion.div className="landing-stat" variants={fadeUp} whileHover={{ y: -4 }}>
              <div className="landing-stat__label">Gated actions recorded</div>
              <div className="landing-stat__value">
                {actionCount === null ? "—" : <AnimatedCounter value={actionCount} />}
              </div>
            </motion.div>
            <motion.div className="landing-stat" variants={fadeUp} whileHover={{ y: -4 }}>
              <div className="landing-stat__label">Awaiting approval now</div>
              <div className="landing-stat__value">
                {pendingCount === null ? "—" : <AnimatedCounter value={pendingCount} />}
              </div>
            </motion.div>
            <motion.div className="landing-stat" variants={fadeUp} whileHover={{ y: -4 }}>
              <div className="landing-stat__label">Chain</div>
              <div className="landing-stat__value landing-stat__value--text">Sepolia</div>
            </motion.div>
          </motion.div>
        </section>

        <section className="landing-section">
          <h2>How a gated action works</h2>
          <motion.div
            className="landing-steps"
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
          >
            <motion.div className="landing-step" variants={fadeUp} whileHover={{ y: -4 }}>
              <div className="landing-step__number">01</div>
              <p>An operator proposes an ownership transfer or a permission escalation for an agent.</p>
            </motion.div>
            <motion.div className="landing-step" variants={fadeUp} whileHover={{ y: -4 }}>
              <div className="landing-step__number">02</div>
              <p>The request sits blocked on the agent's PermissionGate. Nothing has happened on chain yet.</p>
            </motion.div>
            <motion.div className="landing-step" variants={fadeUp} whileHover={{ y: -4 }}>
              <div className="landing-step__number">03</div>
              <p>An approver reviews it and signs with a physically connected Ledger. Only then does it execute.</p>
            </motion.div>
          </motion.div>
        </section>

        <footer className="landing-footer">
          <span>Mandate -- ERC-8004 identity, ENS naming, hardware-gated permission changes.</span>
          <a href={`https://sepolia.etherscan.io/address/${CANONICAL_GATE}`} target="_blank" rel="noreferrer">
            Canonical PermissionGate
          </a>
        </footer>
      </div>
    </MotionConfig>
  );
}
