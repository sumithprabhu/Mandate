import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(__dirname, "..", ".env") });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} missing in backend/.env`);
  return value;
}

export const config = {
  port: Number(process.env.PORT || 3001),
  rpcUrl: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
  operatorPrivateKey: required("OPERATOR_PRIVATE_KEY"),
  // Not configured until the Phase 3 manual deploy step (docs/subgraph.md) happens.
  subgraphUrl: process.env.SUBGRAPH_URL || null,
  dataDir: path.join(__dirname, "..", "data"),
  // Agent directory storage -- a real database, not the local JSON file, since serverless
  // deploys (Vercel) have a read-only filesystem outside /tmp.
  mongodbUri: required("MONGODB_URI"),
};
