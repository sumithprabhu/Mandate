// One-time migration: seeds the existing backend/data/agents.json records into MongoDB.
// Run once against a fresh cluster; safe to re-run since saveAgent upserts by agentId.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { saveAgent, type AgentRecord } from "../src/agentDirectory.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(__dirname, "..", "data", "agents.json");
const records: Record<string, AgentRecord> = JSON.parse(readFileSync(file, "utf8"));

for (const record of Object.values(records)) {
  await saveAgent(record);
  console.log(`seeded ${record.name} (agentId ${record.agentId})`);
}

console.log(`done -- ${Object.keys(records).length} agents migrated`);
process.exit(0);
