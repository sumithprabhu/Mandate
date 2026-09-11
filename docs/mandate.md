# The full on-chain rename

Requested after the code/docs rebrand (`docs/` prose, package names): actually register
`mandate.eth`, and redeploy `PermissionGate` so its EIP-712 domain says "Mandate" too, not
just "AgentNS". `agentns.eth` and its original gate are left exactly as they were --
this is a parallel fresh deployment, not a migration of the old one.

## Canonical addresses (use these)

| | Address |
|---|---|
| `mandate.eth` subregistry | `0xea6F52BB85cf5316ecFd9Fcbe562b4eF6fcCce9b` |
| PermissionGate (domain: "Mandate PermissionGate") | `0x8daa03bacaa88a660f29abceb1a72ccd0ac50637` |
| Resolver (writable only by the gate above) | `0xFfeee8d04Fe487861a20073E9015dEA42D31a1A3` |
| `agent1.mandate.eth` | agentId `10168`, tokenId in the subregistry above |
| `agent2.mandate.eth` | agentId `10169`, tokenId in the subregistry above |

Both agents' token custody is genuinely held by the gate above (verified independently via
`ownerOf` reads, not just trusted from the deploy script's own output) -- fixing the gap
documented in `docs/backend.md` where the original `agentns.eth` gate never received
custody of anything.

## Why two extra redeploys happened

1. **`scripts/rebrand-onchain.ts`** hit `TransferDisallowed`: this registry blocks token
   transfers by default unless the holder has `ROLE_CAN_TRANSFER_ADMIN` -- not included in
   the roles granted at the first registration attempt. Fixed by including it, which meant
   unregistering and re-registering `agent1` (its first tokenId and ERC-8004 agentId
   `10167` are abandoned/orphaned -- harmless, just unused).
2. **`scripts/migrate-gate-domain.ts`**: the EIP-712 domain name turned out to be a
   *compile-time* string baked into the contract bytecode, not something a redeploy alone
   changes -- redeploying the unmodified source just produces a new address with the same
   old domain. Fixed properly: `PermissionGate`'s constructor now takes a `_domainName`
   parameter (see `contracts/src/PermissionGate.sol`), which meant one more gate + resolver
   deployment, with `agent1`/`agent2` migrated onto it via the *intermediate* gate's own
   request/approve flow (clean handoff, no new contract code needed for that part).

Both fixes are real improvements independent of the branding: any future PermissionGate
deployment can now choose its own domain name, and the transfer-role requirement is now
understood and handled correctly.

## What did NOT get touched

- `agentns.eth`, its original resolver/subregistry, and the original gate
  (`0x7308fd71f0d0282465963fe692e082beabbf1a47`) -- untouched, still exactly as documented
  in `docs/registered-agents.json` and `docs/phase2-deployment.json`. Its gate still has the
  original two known gaps (no custody, resolver not actually gated) since nothing there was
  migrated.
- `backend/data/agents.json` -- both old and new agents are listed; nothing removed.

(The subgraph *was* left pointed at the original agentns.eth gate for a while after this
doc was first written -- fixed in a later pass, see `docs/subgraph.md`; it now tracks the
canonical mandate.eth gate and correctly distinguishes both agents it protects.)

## Verified since (2026-09-10/11)

- **Ownership transfer with real hardware, end to end**: proposed a transfer of
  `agent2.mandate.eth`'s token away from the gate via the backend, Clear Signed and
  physically confirmed on a real connected Ledger, relayed on chain, and independently
  confirmed `ownerOf` actually changed (`0x8DAa03bA...` -> the operator wallet). No bug
  found -- worked cleanly. Transferred back afterward (direct operator->gate call) to
  restore the documented demo state (gate holds custody of both agents). See
  `docs/ledger-integration.md`.
- **A third agent, registered through the backend, not a script**:
  `agent3.mandate.eth` (agentId `10189`), via `POST /agents` with `parentAgentId: 10168`
  (the endpoint used to hardcode `agentns.eth`; see `docs/backend.md`).
- **PermissionGate and the resolver are both verified on Sepolia Etherscan.** PermissionGate
  with full source (`forge verify-contract`); the resolver proxy linked to its
  already-verified implementation (`PermissionedResolver`, deployed by ENS Labs) via
  Etherscan's proxy-detection API, so `Read as Proxy` / `Write as Proxy` show the real ABI.
  - https://sepolia.etherscan.io/address/0x8DAa03bACaa88a660F29AbCeB1a72cCD0ac50637#code
  - https://sepolia.etherscan.io/address/0xFfeee8d04Fe487861a20073E9015dEA42D31a1A3#readProxyContract
- **A capability/permission text record on a mandate.eth agent, confirmed genuinely
  publicly resolvable** -- not just readable if you already know the resolver's address.
  `agent1.mandate.eth`'s `mandate:capabilities` = `"read,transact"` resolves correctly
  through the real Universal Resolver `resolve()` entry point (the same path any ENS
  client would use), which also correctly reports which resolver answered. See
  `docs/subgraph.md`.

## Full history

`docs/mandate-deployment.json` (initial `mandate.eth` + `agent1`/`agent2` registration --
reconstructed from terminal output, since the script itself failed before reaching its own
write step; every tx hash in it is real) and `docs/mandate-gate-migration.json` (the
domain-name fix, written by the script itself) are kept as an honest record of what
actually ran, in order -- including the abandoned `agentId 10167`
and the intermediate gate (`0x4c67fbc5ced0d417d418632b18e4cb328198dad2`) that only existed
for a few minutes between the two scripts.
