# Mandate

A trust & permissions control-plane for on-chain AI agents (ERC-8004).

ERC-8004 gives AI agents on-chain identities, but ownership transfer and permission
escalation are a single software signature away -- no second check. Mandate makes
that require a physical Ledger confirmation, exposes every agent's permissions
publicly via ENSv2, and makes reputation/validation history queryable across the
whole ecosystem via a standardized Graph subgraph.

Formerly named AgentNS. `agentns.eth` and its original gate are untouched and still live --
but `mandate.eth` is now also genuinely registered on chain, with a freshly deployed
`PermissionGate` whose EIP-712 domain actually says "Mandate PermissionGate" (that name
turned out to be compile-time-baked into the bytecode, not something a redeploy alone
changes -- fixed by making it a constructor parameter, see `docs/mandate.md`). Along the
way, both `docs/backend.md`'s known gaps got fixed for real on the new deployment: the gate
genuinely holds custody of both agents' tokens, and their resolver is writable only by the
gate, not the operator directly.

## Bounty targets

| Bounty | What this repo does to earn it |
|---|---|
| Best Use of ENSv2 (ENS) | Agent capability/permission manifest lives as ENSv2 resolver records (Permissioned Resolver, Enhanced Access Control) -- not a display label |
| AI Agents x Ledger (Ledger) | Ownership transfer + permission escalation are blocked pending a physical Ledger Clear Signing confirmation via the Device Management Kit |
| Best Use of Composable/Standardized Graph Products (The Graph) | One standardized subgraph schema indexes agent registration, ownership/permission changes, and (read-only) ERC-8004 Reputation registry entries, queryable across agents in one pattern. Validation registry entries are not indexed -- confirmed absent upstream, not skipped; see `docs/subgraph.md`. |
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

## Chain target

Sepolia only. ENSv2 deployment: **hackathon** (ENS Labs' dedicated ETHOnline 2026
deployment, `--deployment hackathon` in the `mm ensv2` CLI) -- see
`docs/deployments.json` for the full address table and verification status.

## Verified contracts (source code, not just an address)

- [`PermissionGate`](https://sepolia.etherscan.io/address/0x8DAa03bACaa88a660F29AbCeB1a72cCD0ac50637#code) -- full source, exact match
- [Resolver](https://sepolia.etherscan.io/address/0xFfeee8d04Fe487861a20073E9015dEA42D31a1A3#readProxyContract) -- EIP-1967 proxy, linked to its already-verified implementation (`PermissionedResolver`, deployed by ENS Labs)

## Setup

```bash
cd contracts
forge install foundry-rs/forge-std --no-commit   # not vendored -- see contracts/lib/ in .gitignore
cp .env.example .env                             # fill in SEPOLIA_RPC_URL, ETHERSCAN_API_KEY
forge test
```

## Status

`contracts/` -- `PermissionGate.sol` done: request/approve/reject/execute state machine
for ownership transfer + permission escalation, plus an EIP-712 signature-based approval
path (18 passing tests, `forge test` in `contracts/`). Ownership-transfer execution is
generic (`target.call(data)`, operator-supplied calldata) rather than assuming an ERC-721
shape -- the real agent's identity token turned out to be ERC-1155-shaped (an ENSv2
registry token), which an earlier version of this contract would have gotten wrong.

`scripts/register-agent.ts` -- live on Sepolia (hackathon deployment): registered
`agentns.eth` with its own subregistry, registered `agent1.agentns.eth` under it, deployed
one shared PermissionedResolver, bound the child name to a fresh ERC-8004 identity
(agentId 10158) via Adapter8004, and wrote a real capability-manifest text record
(`agentns:capabilities`) to the resolver. Full addresses, token IDs and tx hashes in
`docs/registered-agents.json`. `AGENT_URI_PLACEHOLDER` is a stub URL, not hosted yet --
swap it once the backend serves real agent registration JSON.

`scripts/phase2-ledger-demo.ts` -- live on Sepolia: deployed `PermissionGate`, deployed a
resolver only the gate can write to, and ran the full request -> sign -> relay -> execute
cycle with the approver as a throwaway keypair that held **zero ETH** the whole time --
it only ever signs an offline EIP-712 message, never sends a transaction. See
`docs/phase2-deployment.json` for addresses/tx hashes and `docs/ledger-integration.md` for
why signatures instead of raw Clear-Signed transactions. `scripts/ledger-approve.ts`
implements the same flow against real Ledger hardware (device-management-kit + node-hid,
no browser needed) -- type-checked against the real SDK but **not yet run**, since no
device or Speculos emulator was available in this session.

`subgraph/` -- **deployed live** at `https://api.studio.thegraph.com/query/1758954/mandate/v0.2.0`,
fully synced, zero indexing errors. Entity shapes follow the Agent0 Subgraphs convention
(The Graph's own standardized ERC-8004 schema, already live on Sepolia against the same
registries) rather than inventing something one-off; `PermissionGateAction` is this
project's own addition, linked to `Agent`. Tracks the canonical `mandate.eth`
`PermissionGate` specifically, with real query output proving `gatedActions` populated for
both agents it protects, correctly distinguished. See `docs/subgraph.md`.

`backend/` -- Express + viem REST API, no database (the chain is the source of truth;
`backend/data/agents.json` just maps known agentIds to contract addresses). Every endpoint
verified against the canonical mandate.eth deployment with real transactions: registered
`agent3.mandate.eth` via `POST /agents` (now takes an explicit `parentAgentId`, was
hardcoded to the original agentns.eth agent), and ran the full propose -> Clear Sign ->
physical confirm -> relay -> subgraph-reflects-it cycle against `agent2.mandate.eth`
end to end. See `docs/backend.md` for two real bugs a verification pass caught and fixed
(a second stale hardcoded EIP-712 domain name, and `/escalate` not falling back to an
agent's own gated `resolver`) -- both would have broken on camera.

`frontend/` -- v1, deliberately nominal (plain forms/lists, no component library --
real design pass comes later). Exercises every backend endpoint. Verified live in headless
Chromium this session: real agent list, graceful subgraph-not-configured handling, and a
permission-escalation request submitted through the actual UI (not curl), landing a real
Sepolia transaction. Wallet connect is a plain injected-provider flow (viem + `window.ethereum`)
rather than wagmi -- also the real path to hardware Clear Signing without DMK/node-hid,
since MetaMask can back an account with a Ledger. See `docs/frontend.md`.

All five build-order phases now have working code, and both deferred manual steps are done:
the subgraph is deployed live to Subgraph Studio (`docs/subgraph.md`), and a real physical
Ledger has approved a real pending action end to end -- connected over USB, signed
`Approval(actionId)` after physical confirmation on the device screen, relayed on chain,
`ActionExecuted` landed (`docs/ledger-integration.md`). The gate's `approver` is now a real
Ledger address, not a stand-in key.

## Build order

1. Chain plumbing (no UI): confirm registry addresses, register a test agent on
   ENSv2 Sepolia, write the permission-gate contract (mocked second signer first).
2. Ledger integration: swap the mocked signer for real Ledger DMK Clear Signing.
3. Subgraph: standardized schema, deployed live to Subgraph Studio.
4. Backend REST API wrapping 1-3.
5. Frontend.
6. Stretch: World Selfie Check at registration.
