import express, { type Request, type Response, type NextFunction } from "express";
import type { Address, Hex } from "viem";
import { config } from "./config.js";
import { getAgent, listAgents, saveAgent } from "./agentDirectory.js";
import {
  registerChildAgent,
  requestOwnershipTransfer,
  requestPermissionEscalation,
  getAction,
  buildApprovalTypedData,
  relayApproval,
  encodeSetText,
  encodeErc1155TransferCalldata,
  operator,
} from "./chain.js";
import { queryAgentProfile, SubgraphNotConfiguredError } from "./subgraph.js";

const CHAIN_ID = 11155111;

const app = express();
app.use(express.json());

// Minimal CORS for the local frontend dev server -- no separate `cors` dependency needed
// for a single-origin, header-only allowance like this.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") return void res.sendStatus(204);
  next();
});

function asyncHandler(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
}

function requireAgent(req: Request, res: Response) {
  const agent = getAgent(req.params.agentId);
  if (!agent) {
    res.status(404).json({ error: `unknown agentId ${req.params.agentId}` });
    return null;
  }
  return agent;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, operator: operator.address, chainId: CHAIN_ID });
});

app.get("/agents", (_req, res) => {
  res.json({ agents: listAgents() });
});

app.get("/agents/:agentId", (req, res) => {
  const agent = requireAgent(req, res);
  if (!agent) return;
  res.json({ agent });
});

app.get(
  "/agents/:agentId/profile",
  asyncHandler(async (req, res) => {
    const agent = requireAgent(req, res);
    if (!agent) return;
    const profile = await queryAgentProfile(CHAIN_ID, agent.agentId);
    res.json({ profile });
  })
);

app.post(
  "/agents",
  asyncHandler(async (req, res) => {
    const { label, agentURI, parentAgentId, owner } = req.body as {
      label?: string;
      agentURI?: string;
      parentAgentId?: number | string;
      owner?: Address;
    };
    if (!label) return void res.status(400).json({ error: "label is required, e.g. 'agent3'" });
    if (parentAgentId === undefined) {
      return void res.status(400).json({
        error: "parentAgentId is required -- the agentId of an existing agent whose subregistry/resolver/adapter8004 this one should share, e.g. 10168 for mandate.eth",
      });
    }

    // Registers under an existing namespace's shared subregistry/resolver -- see
    // docs/mandate.md for how that infra was set up (one-time per namespace, not per-agent).
    const parent = getAgent(parentAgentId);
    if (!parent) return void res.status(404).json({ error: `unknown parentAgentId ${parentAgentId}` });

    // Self-serve path: `owner` is the caller's own connected-wallet address, not the
    // backend's operator key. The operator still holds the subregistry permissions needed
    // to mint the ENS label -- that ENS-issuing role is the backend's one remaining trusted
    // job in the self-serve flow -- but the resulting identity is genuinely owned by the
    // caller. The parent's shared legacy gate is NOT carried forward here: that gate belongs
    // to the operator-controlled demo agents, not to an independently-owned one, which
    // deploys its own gate via PermissionGateFactory instead (see frontend/src/pages/Register.tsx).
    const isSelfServe = owner !== undefined;

    const result = await registerChildAgent(
      parent.subregistry as Address,
      parent.resolver as Address,
      parent.adapter8004 as Address,
      label,
      agentURI || `https://mandate.example/agents/${label}.json`,
      owner
    );

    const record = {
      agentId: Number(result.agentId),
      name: `${label}.${parent.parentName}`,
      parentName: parent.parentName,
      owner: owner || operator.address,
      identityRegistry: parent.identityRegistry,
      adapter8004: parent.adapter8004,
      resolver: parent.resolver,
      subregistry: parent.subregistry,
      tokenId: result.tokenId.toString(),
      // Carried forward from the parent record so this agent's escalations/transfers can
      // go through the same gate its siblings use, if the namespace has one configured --
      // only for backend-operated (non-self-serve) children. The gate does NOT automatically
      // hold custody of this new token, and the subgraph's agent-attribution lookup
      // (subgraph/src/permission-gate.ts) only knows about the two demo agents by name for
      // this legacy gate -- both are known, documented limitations, not silently assumed away.
      ...(!isSelfServe && parent.gate ? { gate: parent.gate } : {}),
      ...(!isSelfServe && parent.approver ? { approver: parent.approver } : {}),
      ...(!isSelfServe && parent.domainName ? { domainName: parent.domainName } : {}),
    };
    saveAgent(record);

    res.status(201).json({
      agent: record,
      registerTx: result.registerTx,
      bindTx: result.bindTx,
      ...(result.transferTx ? { transferTx: result.transferTx } : {}),
    });
  })
);

app.post(
  "/agents/:agentId/transfer",
  asyncHandler(async (req, res) => {
    const agent = requireAgent(req, res);
    if (!agent) return;
    if (!agent.gate) return void res.status(400).json({ error: "agent has no PermissionGate configured" });

    const { newOwner } = req.body as { newOwner?: Address };
    if (!newOwner) return void res.status(400).json({ error: "newOwner is required" });

    const registry = agent.subregistry as Address;
    const tokenId = BigInt(agent.tokenId);
    const transferCalldata = encodeErc1155TransferCalldata(agent.gate as Address, newOwner, tokenId);

    const { actionId, txHash } = await requestOwnershipTransfer(
      agent.gate as Address,
      registry,
      tokenId,
      newOwner,
      transferCalldata
    );

    res.status(202).json({
      actionId: actionId.toString(),
      requestTx: txHash,
      status: "Pending",
      note:
        "blocked until the approver signs and someone relays -- GET the typed-data endpoint, sign it, POST it to /approve. " +
        "Will only actually execute once the gate holds custody of this token (see backend/data/agents.json note).",
    });
  })
);

app.post(
  "/agents/:agentId/escalate",
  asyncHandler(async (req, res) => {
    const agent = requireAgent(req, res);
    if (!agent) return;
    if (!agent.gate) return void res.status(400).json({ error: "agent has no PermissionGate configured" });

    const { key, value, target } = req.body as { key?: string; value?: string; target?: Address };
    if (!key || value === undefined) return void res.status(400).json({ error: "key and value are required" });

    // Prefer a dedicated gate-only-writable resolver if this agent has one configured
    // (older agentns.eth agents, docs/phase2-deployment.json); otherwise fall back to the
    // agent's own `resolver` -- for mandate.eth agents that field IS the gated one
    // (docs/mandate.md), so there's no separate gatedResolver to point at.
    const escalationTarget = target || (agent.gatedResolver as Address | undefined) || (agent.resolver as Address | undefined);
    if (!escalationTarget) {
      return void res.status(400).json({ error: "no target resolver -- pass one explicitly, or configure agent.gatedResolver/agent.resolver" });
    }

    const data = encodeSetText(agent.name, key, value);
    const { actionId, txHash } = await requestPermissionEscalation(agent.gate as Address, escalationTarget, data);

    res.status(202).json({
      actionId: actionId.toString(),
      requestTx: txHash,
      status: "Pending",
      target: escalationTarget,
    });
  })
);

app.get(
  "/agents/:agentId/actions/:actionId",
  asyncHandler(async (req, res) => {
    const agent = requireAgent(req, res);
    if (!agent) return;
    if (!agent.gate) return void res.status(400).json({ error: "agent has no PermissionGate configured" });

    const action = (await getAction(agent.gate as Address, BigInt(req.params.actionId))) as Record<string, unknown>;
    res.json({
      action: {
        actionType: action.actionType === 0 ? "OwnershipTransfer" : "PermissionEscalation",
        target: action.target,
        newOwner: action.newOwner,
        tokenId: (action.tokenId as bigint).toString(),
        data: action.data,
        requestedBy: action.requestedBy,
        requestedAt: (action.requestedAt as bigint).toString(),
        status: ["None", "Pending", "Rejected", "Executed"][action.status as number],
      },
    });
  })
);

app.get(
  "/agents/:agentId/actions/:actionId/typed-data",
  (req, res) => {
    const agent = getAgent(req.params.agentId);
    if (!agent) return void res.status(404).json({ error: `unknown agentId ${req.params.agentId}` });
    if (!agent.gate) return void res.status(400).json({ error: "agent has no PermissionGate configured" });
    if (!agent.domainName) {
      return void res.status(500).json({ error: "agent has a gate but no domainName configured -- cannot build a valid typed-data payload, see docs/mandate.md" });
    }

    const typedData = buildApprovalTypedData(agent.gate as Address, BigInt(req.params.actionId), agent.domainName);
    res.json({
      typedData,
      note: "sign this with the approver key (e.g. scripts/ledger-approve.ts for real Ledger hardware) and POST the resulting signature to .../approve",
    });
  }
);

app.post(
  "/agents/:agentId/actions/:actionId/approve",
  asyncHandler(async (req, res) => {
    const agent = requireAgent(req, res);
    if (!agent) return;
    if (!agent.gate) return void res.status(400).json({ error: "agent has no PermissionGate configured" });

    const { signature } = req.body as { signature?: Hex };
    if (!signature) return void res.status(400).json({ error: "signature is required -- GET the typed-data endpoint first" });

    const txHash = await relayApproval(agent.gate as Address, BigInt(req.params.actionId), signature);
    res.json({ txHash, status: "Executed" });
  })
);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof SubgraphNotConfiguredError) {
    return void res.status(503).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: err.message });
});

app.listen(config.port, () => {
  console.log(`Mandate backend listening on :${config.port} (operator ${operator.address})`);
});
