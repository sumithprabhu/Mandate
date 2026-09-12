// Direct subgraph access for the frontend -- used where a real cross-agent query is the
// point (Trust page), not a per-agent proxy through the backend.
const SUBGRAPH_URL =
  import.meta.env.VITE_SUBGRAPH_URL || "https://api.studio.thegraph.com/query/1758954/mandate/v0.4.0";

export interface GatedAction {
  actionType: "OwnershipTransfer" | "PermissionEscalation";
  status: "Pending" | "Rejected" | "Executed";
  requestedBy: string;
  approvedBy: string | null;
  requestedAt: string;
  executedAt: string | null;
  newOwner: string | null;
  escalationTarget: string | null;
  escalationData: string | null;
}

export interface SubgraphAgent {
  agentId: string;
  agentURI: string | null;
  owner: string;
  totalFeedback: string;
  gatedActions: GatedAction[];
  feedback: { value: string; tag1: string | null; isRevoked: boolean }[];
}

async function query<T>(gql: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(SUBGRAPH_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: gql, variables }),
  });
  const body = await res.json();
  if (body.errors) throw new Error(body.errors[0]?.message || "subgraph query failed");
  return body.data as T;
}

// One real cross-agent query -- the same pattern verified in docs/subgraph.md, not N
// separate per-agent requests stitched together client-side.
export async function fetchAgentsCrossQuery(agentEntityIds: string[]): Promise<SubgraphAgent[]> {
  if (agentEntityIds.length === 0) return [];
  const data = await query<{ agents: SubgraphAgent[] }>(
    `query($ids: [ID!]!) {
      agents(where: { id_in: $ids }, orderBy: agentId) {
        agentId
        agentURI
        owner
        totalFeedback
        feedback(first: 5) { value tag1 isRevoked }
        gatedActions(orderBy: requestedAt, orderDirection: desc) {
          actionType
          status
          requestedBy
          approvedBy
          requestedAt
          executedAt
          newOwner
          escalationTarget
          escalationData
        }
      }
    }`,
    { ids: agentEntityIds }
  );
  return data.agents;
}

export interface FullGatedAction extends GatedAction {
  id: string;
  actionId: string;
  escalationData: string | null;
  agentId: string | null;
}

// Actions are scoped to a single PermissionGate contract, not to one agent -- every
// mandate.eth agent in this demo shares one canonical gate (docs/mandate.md), so the
// caller-supplied "which agent" hint can be wrong. This resolves the real owner via the
// indexed event data, not the hint.
export async function fetchGatedAction(gate: string, actionId: string): Promise<FullGatedAction | null> {
  const data = await query<{ permissionGateAction: (FullGatedAction & { agent: { agentId: string } | null }) | null }>(
    `query($id: ID!) {
      permissionGateAction(id: $id) {
        id
        actionId
        actionType
        status
        requestedBy
        approvedBy
        requestedAt
        executedAt
        newOwner
        escalationTarget
        escalationData
        agent { agentId }
      }
    }`,
    { id: `${gate.toLowerCase()}:${actionId}` }
  );
  const action = data.permissionGateAction;
  if (!action) return null;
  return { ...action, agentId: action.agent?.agentId ?? null };
}

export interface Gate {
  id: string;
  agentId: string;
  domainName: string | null;
  operator: string;
  approver: string;
}

// Self-serve gates (Phase 4) are deliberately NOT recorded in the backend's agent
// directory -- the subgraph's Gate entity (indexed off the real GateDeployed event) is the
// only place to find one. Legacy demo agents still carry `agent.gate` in the backend
// record instead; callers check that first and only fall back to this for agents that
// don't have one.
export async function fetchGateForAgent(agentId: number | string): Promise<Gate | null> {
  const data = await query<{ gates: Gate[] }>(
    `query($agentId: BigInt!) {
      gates(where: { agentId: $agentId }, first: 1) {
        id
        agentId
        domainName
        operator
        approver
      }
    }`,
    { agentId: String(agentId) }
  );
  return data.gates[0] ?? null;
}

export async function fetchAgent(agentEntityId: string): Promise<SubgraphAgent | null> {
  const data = await query<{ agent: SubgraphAgent | null }>(
    `query($id: ID!) {
      agent(id: $id) {
        agentId
        agentURI
        owner
        totalFeedback
        feedback(first: 5) { value tag1 isRevoked }
        gatedActions(orderBy: requestedAt, orderDirection: desc) {
          actionType
          status
          requestedBy
          approvedBy
          requestedAt
          executedAt
          newOwner
          escalationTarget
          escalationData
        }
      }
    }`,
    { id: agentEntityId }
  );
  return data.agent;
}
