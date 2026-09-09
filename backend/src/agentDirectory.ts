// No database for this project -- the chain is already the source of truth for
// everything that matters (ownership, resolver records, pending actions). This file just
// maps a known agentId to the contract addresses involved, so routes don't need those
// passed on every request. Persisted as JSON so `POST /agents` can append new agents
// without a real datastore.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { config } from "./config.js";

export interface AgentRecord {
  agentId: number;
  name: string;
  parentName: string;
  owner: string;
  identityRegistry: string;
  adapter8004: string;
  resolver: string;
  subregistry: string;
  tokenId: string;
  gate?: string;
  gatedResolver?: string;
  approver?: string;
  domainName?: string; // this gate's EIP-712 domain name -- required to build a valid typed-data payload; see docs/mandate.md
  note?: string;
}

const FILE_PATH = path.join(config.dataDir, "agents.json");

function load(): Record<string, AgentRecord> {
  if (!existsSync(FILE_PATH)) return {};
  return JSON.parse(readFileSync(FILE_PATH, "utf8"));
}

function persist(records: Record<string, AgentRecord>): void {
  writeFileSync(FILE_PATH, JSON.stringify(records, null, 2) + "\n");
}

export function getAgent(agentId: number | string): AgentRecord | null {
  const records = load();
  return records[String(agentId)] ?? null;
}

export function listAgents(): AgentRecord[] {
  return Object.values(load());
}

export function saveAgent(record: AgentRecord): void {
  const records = load();
  records[String(record.agentId)] = record;
  persist(records);
}
