// No relational database for this project -- the chain is already the source of truth for
// everything that matters (ownership, resolver records, pending actions). This is just a
// lookup from a known agentId to the contract addresses involved, so routes don't need
// those passed on every request. Backed by MongoDB (not a local file) because serverless
// deploys have a read-only filesystem outside /tmp -- a JSON file on disk doesn't survive
// a cold start there.

import { MongoClient, type Collection, type Document } from "mongodb";
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

let collectionPromise: Promise<Collection<AgentRecord>> | null = null;

// Lazy singleton connection -- one client for the life of the process (or the life of a
// warm serverless instance), not one per request.
function getCollection(): Promise<Collection<AgentRecord>> {
  if (!collectionPromise) {
    const client = new MongoClient(config.mongodbUri);
    collectionPromise = client
      .connect()
      .then((c) => c.db("mandate").collection<AgentRecord>("agents"));
  }
  return collectionPromise;
}

const noId: { projection: Document } = { projection: { _id: 0 } };

export async function getAgent(agentId: number | string): Promise<AgentRecord | null> {
  const col = await getCollection();
  return col.findOne({ agentId: Number(agentId) }, noId);
}

export async function listAgents(): Promise<AgentRecord[]> {
  const col = await getCollection();
  return col.find({}, noId).sort({ agentId: 1 }).toArray();
}

export async function saveAgent(record: AgentRecord): Promise<void> {
  const col = await getCollection();
  await col.updateOne({ agentId: record.agentId }, { $set: record }, { upsert: true });
}
