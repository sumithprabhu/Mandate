export const CHAIN_ID = 11155111;

export function subgraphEntityId(agentId: number | string): string {
  return `${CHAIN_ID}:${agentId}`;
}
