import { config } from "./config.js";

const PROFILE_QUERY = `
  query AgentProfile($id: ID!) {
    agent(id: $id) {
      agentId
      agentURI
      owner
      totalFeedback
      feedback(first: 10, orderBy: createdAt, orderDirection: desc) {
        value
        valueDecimals
        tag1
        tag2
        isRevoked
        responses {
          responder
          responseURI
        }
      }
      gatedActions(orderBy: requestedAt, orderDirection: desc) {
        actionType
        status
        requestedBy
        approvedBy
        newOwner
        escalationTarget
        requestedAt
        executedAt
      }
    }
  }
`;

export class SubgraphNotConfiguredError extends Error {
  constructor() {
    super(
      "SUBGRAPH_URL is not set -- the subgraph hasn't been deployed to Subgraph Studio yet " +
        "(manual step, see docs/subgraph.md). Set SUBGRAPH_URL in backend/.env once it has been."
    );
    this.name = "SubgraphNotConfiguredError";
  }
}

export async function queryAgentProfile(chainId: number, agentId: number | string) {
  if (!config.subgraphUrl) throw new SubgraphNotConfiguredError();

  const id = `${chainId}:${agentId}`;
  const res = await fetch(config.subgraphUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: PROFILE_QUERY, variables: { id } }),
  });

  if (!res.ok) {
    throw new Error(`Subgraph query failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { data?: { agent: unknown }; errors?: unknown[] };
  if (body.errors) {
    throw new Error(`Subgraph returned errors: ${JSON.stringify(body.errors)}`);
  }
  return body.data?.agent ?? null;
}
