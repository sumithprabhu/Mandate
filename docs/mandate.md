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
- The subgraph -- still indexes only the original `agentns.eth` gate and agentId `10158`
  (`subgraph/src/permission-gate.ts`'s `KNOWN_AGENT_ID` is hardcoded per data source, a
  documented simplification). Extending it to the new gate/agents would need either two
  more hardcoded data sources or a `context`-parameterized mapping -- not done here, out of
  scope for "rename the project," a reasonable follow-up if the new agents need to show up
  in trust-profile queries too.
- `backend/data/agents.json` -- both old and new agents are listed; nothing removed.

## Full history

`docs/mandate-deployment.json` (initial `mandate.eth` + `agent1`/`agent2` registration --
reconstructed from terminal output, since the script itself failed before reaching its own
write step; every tx hash in it is real) and `docs/mandate-gate-migration.json` (the
domain-name fix, written by the script itself) are kept as an honest record of what
actually ran, in order -- including the abandoned `agentId 10167`
and the intermediate gate (`0x4c67fbc5ced0d417d418632b18e4cb328198dad2`) that only existed
for a few minutes between the two scripts.
