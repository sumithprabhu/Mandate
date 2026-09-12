# Self-serve registration: a real on-chain constraint found by testing

While wiring `POST /agents` to accept an explicit `owner` (the connecting user's wallet
address, instead of always defaulting to the backend's operator key), the first real test
against Sepolia reverted:

```
NotController(address,uint256)
```
from Adapter8004 (`0x7621630cB63a73a194f45A3E6801B8C6A7eC2f92`, selector `0xa9d48768`,
confirmed via `cast sig "NotController(address,uint256)"`).

## What happened

The original attempt registered the ENS subname (`selftest.mandate.eth`) with the real
user's address as owner directly, then tried to call `Adapter8004.register` (binding that
token to a fresh ERC-8004 identity) from the operator's key. Adapter8004 requires the
caller to control the token being bound -- reasonable, since binding an identity to a token
you don't own would let anyone squat on someone else's NFT. Since ownership had already
moved to the user, the operator no longer qualified, and the bind reverted.

The ENS subname registration itself is a separate, already-committed transaction (it
doesn't roll back when a later step reverts), so this test left a real, harmless orphan on
Sepolia: `selftest.mandate.eth` is registered with no ERC-8004 identity bound to it.

## Fix, part 1

`backend/src/chain.ts::registerChildAgent` now always registers the ENS subname with the
operator as owner (so it can bind), then -- only if a different final `owner` was
requested -- transfers the token to that address in a third transaction immediately after
binding. The operator holds the token for exactly the two transactions it takes to
register and bind it, never longer.

## Fix, part 2: the handoff itself also reverted the first time

The transfer call then reverted too, with `TransferDisallowed(uint256,address)` from
`PermissionedRegistry` (verified source, `0x47B442d0CF617c41CAbAFf5f02f44DD1e5f72546`).
The real cause, read straight from the verified contract:

```solidity
// only check ROLE_CAN_TRANSFER_ADMIN on original owner (from)
// ROLE_CAN_TRANSFER_ADMIN is technically a property of the token
if (!hasRoles(tokenId, RegistryRolesLib.ROLE_CAN_TRANSFER_ADMIN, from)) {
    revert TransferDisallowed(tokenId, from);
}
```

Transfer permission is a **role bit on the token itself**, not a default any owner has --
`CHILD_TOKEN_ROLES` (the bitmap granted at registration) didn't include it, so nobody could
ever transfer these tokens, regardless of caller. `scripts/rebrand-onchain.ts` had already
independently discovered and worked around this for the AgentNS -> Mandate rebrand
(`ROLE_CAN_TRANSFER_ADMIN = (1n << 28n) << 128n`); `CHILD_TOKEN_ROLES` now includes it too,
so every newly registered child token can be transferred later -- needed for the self-serve
handoff, harmless for the legacy demo-agent path that never transfers.

With both fixes, `POST /agents { label, parentAgentId, owner }` now genuinely works end to
end: registered `selftest3.mandate.eth` (agentId 10242), confirmed on chain that the
underlying subregistry token really moved to the requested owner and that the operator no
longer controls it.

## Fix, part 3: PermissionGateFactory's ownership check was checking the wrong thing

`isController` on Adapter8004 is the only ownership check that comes out correct for
ENS-bound agents. `IdentityRegistry.ownerOf`/`isAuthorizedOrOwner` -- what
`PermissionGateFactory.createGate` (Phase 1, deployed before self-serve registration was
ever tested for real) actually checks -- resolve to the **adapter contract itself**, not the
real backing owner, for any identity bound through Adapter8004. Confirmed directly against
Sepolia, including against the legacy gate (a definitely-real, definitely-correct owner):

| check | `10168` (legacy gate is real owner) | `10242` (test user is real owner post-transfer) |
|---|---|---|
| `IdentityRegistry.isAuthorizedOrOwner(realOwner, id)` | `false` (wrong) | `false` (wrong) |
| `Adapter8004.isController(id, realOwner)` | `true` (correct) | `true` (correct) |

Every self-serve agent under the decided model (backend-issued `mandate.eth` subname, then
bound via Adapter8004) is exactly this adapter-bound shape -- meaning the **already-deployed**
factory (`0xD02B75D4EAde44866c930e9ffBE660e01866f245`) would revert `NotAgentOwner` for
every real registration, including ones by their genuine owner. This was caught by testing
against real Sepolia state before it shipped further, not left for a user to hit.

`PermissionGateFactory.sol` now takes both `agentIdentityRegistry` and `agentAdapter8004`
in its constructor and checks `Adapter8004.isController(agentId, msg.sender)` instead. All
24 Foundry tests pass against the fix (free, local -- no chain interaction). **Not yet
redeployed**: the fix needs a fresh factory deployment (~0.007 ETH at current gas prices),
and the deployer wallet is down to ~0.002 ETH after this round of real on-chain testing
(three registrations, a gate deployment, and a live action on it, all genuinely sent to
Sepolia). The old factory address should be treated as broken and not used for real
registrations until the corrected one is deployed and documented here.
