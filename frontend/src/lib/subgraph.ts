// Direct subgraph access for the frontend -- used where a real cross-agent query is the
// point (Trust page), not a per-agent proxy through the backend.
const SUBGRAPH_URL =
  import.meta.env.VITE_SUBGRAPH_URL || "https://api.studio.thegraph.com/query/1758954/mandate/v0.2.0";

export interface GatedAction {
  actionType: "OwnershipTransfer" | "PermissionEscalation";
  status: "Pending" | "Rejected" | "Executed";
  requestedBy: string;
  approvedBy: string | null;
  requestedAt: string;
  executedAt: string | null;
  newOwner: string | null;
  escalationTarget: string | null;
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
        }
      }
    }`,
    { ids: agentEntityIds }
  );
  return data.agents;
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
        }
      }
    }`,
    { id: agentEntityId }
  );
  return data.agent;
}
