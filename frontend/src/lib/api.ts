const BASE = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `${res.status} ${res.statusText}`);
  return body;
}

export interface Agent {
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
  note?: string;
}

export interface GateAction {
  actionType: "OwnershipTransfer" | "PermissionEscalation";
  target: string;
  newOwner: string;
  tokenId: string;
  data: string;
  requestedBy: string;
  requestedAt: string;
  status: "None" | "Pending" | "Rejected" | "Executed";
}

export interface TypedData {
  domain: { name: string; version: string; chainId: number; verifyingContract: string };
  types: Record<string, { name: string; type: string }[]>;
  primaryType: string;
  message: { actionId: string };
}

export const api = {
  listAgents: () => request<{ agents: Agent[] }>("/agents"),
  getAgent: (agentId: number | string) => request<{ agent: Agent }>(`/agents/${agentId}`),
  getProfile: (agentId: number | string) => request<{ profile: unknown }>(`/agents/${agentId}/profile`),
  registerAgent: (label: string, agentURI?: string) =>
    request<{ agent: Agent; registerTx: string; bindTx: string }>("/agents", {
      method: "POST",
      body: JSON.stringify({ label, agentURI }),
    }),
  requestTransfer: (agentId: number | string, newOwner: string) =>
    request<{ actionId: string; requestTx: string; status: string; note: string }>(`/agents/${agentId}/transfer`, {
      method: "POST",
      body: JSON.stringify({ newOwner }),
    }),
  requestEscalation: (agentId: number | string, key: string, value: string, target?: string) =>
    request<{ actionId: string; requestTx: string; status: string; target: string }>(`/agents/${agentId}/escalate`, {
      method: "POST",
      body: JSON.stringify({ key, value, target }),
    }),
  getAction: (agentId: number | string, actionId: string) =>
    request<{ action: GateAction }>(`/agents/${agentId}/actions/${actionId}`),
  getTypedData: (agentId: number | string, actionId: string) =>
    request<{ typedData: TypedData; note: string }>(`/agents/${agentId}/actions/${actionId}/typed-data`),
  approveAction: (agentId: number | string, actionId: string, signature: string) =>
    request<{ txHash: string; status: string }>(`/agents/${agentId}/actions/${actionId}/approve`, {
      method: "POST",
      body: JSON.stringify({ signature }),
    }),
};
