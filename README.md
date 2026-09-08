# AgentNS

A trust & permissions control-plane for on-chain AI agents (ERC-8004).

ERC-8004 gives AI agents on-chain identities, but ownership transfer and permission
escalation are a single software signature away -- no second check. AgentNS makes
that require a physical Ledger confirmation, exposes every agent's permissions
publicly via ENSv2, and makes reputation/validation history queryable across the
whole ecosystem via a standardized Graph subgraph.

## Bounty targets

| Bounty | What this repo does to earn it |
|---|---|
| Best Use of ENSv2 (ENS) | Agent capability/permission manifest lives as ENSv2 resolver records (Permissioned Resolver, Enhanced Access Control) -- not a display label |
| AI Agents x Ledger (Ledger) | Ownership transfer + permission escalation are blocked pending a physical Ledger Clear Signing confirmation via the Device Management Kit |
| Best Use of Composable/Standardized Graph Products (The Graph) | One standardized subgraph schema indexes agent registration, ownership/permission changes, and (read-only) ERC-8004 Reputation/Validation registry entries, queryable across agents in one pattern |
| *(stretch)* Selfie Check (World) | Ties agent registration to one verified human |

Explicitly out of scope: agent marketplace/discovery UI, Validation Registry gating,
multi-chain support, any token/payment flow.

## Repo layout

- `contracts/` -- Solidity: the permission-gate contract (the one piece of custom
  Solidity this project writes). Does not redeploy ERC-8004 or ENSv2 contracts.
- `backend/` -- Node/TypeScript orchestration service: agent registry, permission/
  ownership change state machine, Ledger approval bridge, REST API.
- `subgraph/` -- graph-cli subgraph, deployed to Subgraph Studio.
- `frontend/` -- thin React UI exercising the backend API (built last).
- `scripts/` -- one-off chain scripts (agent registration, etc.), no UI.
- `docs/deployments.json` -- pinned chain addresses (ERC-8004 registries, ENSv2
  deployment) with provenance and independent on-chain verification notes. Update
  this file, not hardcoded addresses in code, when a deployment changes.

## Status

Early scaffold. See open tasks / build order below.

## Build order

1. Chain plumbing (no UI): confirm registry addresses, register a test agent on
   ENSv2 Sepolia, write the permission-gate contract (mocked second signer first).
2. Ledger integration: swap the mocked signer for real Ledger DMK Clear Signing.
3. Subgraph: standardized schema, deployed live to Subgraph Studio.
4. Backend REST API wrapping 1-3.
5. Frontend.
6. Stretch: World Selfie Check at registration.
