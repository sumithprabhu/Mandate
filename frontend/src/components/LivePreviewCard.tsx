import { useEffect, useState } from "react";
import { motion } from "motion/react";

import { api, type Agent } from "../lib/api";
import { fetchAgentsCrossQuery, type SubgraphAgent } from "../lib/subgraph";
import { deriveStatus, statusLabel } from "../lib/status";
import { subgraphEntityId } from "../lib/constants";
import { StatusDot } from "./StatusDot";

/** A real, live preview of the app -- not a mocked screenshot. Same backend +
 * subgraph calls the /agents page makes, trimmed to a few rows for the hero. */
export function LivePreviewCard() {
  const [rows, setRows] = useState<{ agent: Agent; sub: SubgraphAgent | undefined }[] | null>(null);

  useEffect(() => {
    api
      .listAgents()
      .then(async (r) => {
        const top = r.agents.slice(0, 3);
        const ids = top.map((a) => subgraphEntityId(a.agentId));
        const results = await fetchAgentsCrossQuery(ids);
        const byId: Record<string, SubgraphAgent> = {};
        for (const a of results) byId[a.agentId] = a;
        setRows(top.map((agent) => ({ agent, sub: byId[String(agent.agentId)] })));
      })
      .catch(() => setRows([]));
  }, []);

  return (
    <motion.div
      className="preview-window-wrap"
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      <motion.div
        className="preview-window"
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="preview-window__chrome">
          <span className="preview-window__dot" data-c="1" />
          <span className="preview-window__dot" data-c="2" />
          <span className="preview-window__dot" data-c="3" />
          <span className="preview-window__url">mandate.app/agents</span>
        </div>
        <div className="preview-window__body">
          {rows === null && <div className="preview-window__loading">Loading live agents.</div>}
          {rows !== null &&
            rows.map(({ agent, sub }) => {
              const status = sub ? deriveStatus(sub.gatedActions) : "confirmed";
              return (
                <div className="preview-row" key={agent.agentId}>
                  <div className="preview-row__left">
                    <StatusDot status={status} />
                    <span className="preview-row__name">{agent.name}</span>
                  </div>
                  <span className="preview-row__status">{statusLabel(status)}</span>
                </div>
              );
            })}
        </div>
      </motion.div>
    </motion.div>
  );
}
