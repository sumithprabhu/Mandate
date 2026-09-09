# Backend (Phase 4)

Single Node/TypeScript service, no database -- the chain is already the source of truth
for ownership, resolver records, and pending actions, so routes read/write it directly via
viem. `backend/data/agents.json` is the only local state: a small file mapping a known
`agentId` to the contract addresses involved (gate, resolver, subregistry, adapter), so
routes don't need those passed on every request. `POST /agents` appends to it.

## Endpoints (all live-tested on Sepolia this session, real transactions)

| Method | Path | What it does |
|---|---|---|
| GET | `/agents` | list known agents |
| GET | `/agents/:agentId` | one agent's directory record |
| GET | `/agents/:agentId/profile` | subgraph query (identity + reputation + gated-action history) |
| POST | `/agents` | register a new child agent under the project's existing `agentns.eth` namespace |
| POST | `/agents/:agentId/transfer` | request an ownership transfer (blocked pending approval) |
| POST | `/agents/:agentId/escalate` | request a permission escalation (blocked pending approval) |
| GET | `/agents/:agentId/actions/:actionId` | read a pending/executed action's on-chain state |
| GET | `/agents/:agentId/actions/:actionId/typed-data` | the exact EIP-712 payload the approver needs to sign |
| POST | `/agents/:agentId/actions/:actionId/approve` | relay a signed approval on chain |

## Proven live this session

- `POST /agents/10158/escalate` -> `actionId 1`, real tx
- Signed `actionId 1`'s typed-data with the throwaway approver key (same key `scripts/phase2-ledger-demo.ts` used, standing in for the future Ledger)
- `POST /agents/10158/actions/1/approve` -> relayed on chain, action flipped to `Executed`, resolver record written
- `POST /agents/10158/transfer` -> `actionId 2` created and correctly left `Pending` (see gap below)
- `POST /agents { "label": "agent2" }` -> registered `agent2.agentns.eth`, agentId `10164`, real registration + ERC-8004 bind

## Two known, documented gaps

**`/transfer` won't complete for `agent1.agentns.eth` (agentId 10158) yet.** `PermissionGate`
can only move a token it holds custody of, and the gate deployed in Phase 2 never received
custody of the real agent's token (it was only wired up against a separate demo resolver).
The request path works correctly (proven above, `actionId 2`), but approving it would revert
at execution. Fixing this for real means transferring the agent's actual ownership token
into the gate -- a genuinely consequential, semi-irreversible move (the project stops being
able to touch that token directly) that deserves its own explicit go-ahead rather than being
folded into "build the backend."

**`/escalate` targets a separate demo resolver, not the agent's live one.** The agent's real
resolver (`0x4BEB48CE6c91DDFC259fF964D01Ef35f6E17ae57`, holding the real
`agentns:capabilities` record) is writable directly by the operator wallet, not gated --
delegating that role to the gate isn't possible without a fresh resolver deployment (no
admin rights over the existing grant; see `contracts/src/PermissionGate.sol`'s ownership-
transfer generalization note for the same class of issue). `agent.gatedResolver` in the
directory is a separate resolver, from the Phase 2 demo, that the gate can genuinely write
to -- that's what `/escalate` defaults to. Making the agent's *actual* resolver gated would
mean deploying a new one with the gate granted write roles at init time and repointing the
name at it via `subregistry.setResolver` -- doable, not done here.

## Verification pass (2026-09-09) -- two more real bugs found and fixed

1. **`buildApprovalTypedData` hardcoded the domain name** to `"AgentNS PermissionGate"`
   regardless of which gate was passed. `GET /agents/10168/actions/:id/typed-data` (the
   mandate.eth gate, domain `"Mandate PermissionGate"`) returned a payload that would
   recover to the wrong signer -- anyone who signed and relayed it would hit `NotApprover`.
   Same bug class already fixed once in `scripts/ledger-approve.ts`; this was the same
   thing left unfixed in the backend. `domainName` is now required per-agent directory
   data (`backend/data/agents.json`).
2. **`/escalate` only defaulted to `agent.gatedResolver`**, never `agent.resolver` -- broke
   for the mandate.eth agents specifically, since their `resolver` field *is* the gated one
   and they have no separate `gatedResolver`. Fixed: falls back to `agent.resolver` too.

Both would have broken the real demo flow on the mandate.eth agents specifically -- the
ones where the underlying gaps are actually fixed. Caught by running the full flow with a
real Ledger, not by reading the code.

**Known limitation, not yet fixed**: `POST /agents` hardcodes reading shared
subregistry/resolver/adapter8004 addresses from `getAgent(10158)` -- the original
`agentns.eth` agent. Registering a new agent via this endpoint today always creates it
under `agentns.eth`, never under the canonical `mandate.eth` deployment, regardless of
which namespace you'd want. `agent2.mandate.eth` was never registered this way -- only
`scripts/rebrand-onchain.ts` did that, directly. This is a real gap, not yet fixed.

## Running it

```bash
cd backend
cp .env.example .env   # OPERATOR_PRIVATE_KEY -- reuse the same key as contracts/.env
npm install
npm run dev
```

`SUBGRAPH_URL` stays empty until the Phase 3 manual deploy step (`docs/subgraph.md`)
happens; `/profile` returns a 503 with a clear message until then (verified this session).
