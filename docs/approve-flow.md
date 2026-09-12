# In-browser approve/reject: what's proven, and a real limit found along the way

## What works, verified for real

Built a signing bridge for testing: Playwright drives the actual React/wagmi UI in a real
browser, and a fake `window.ethereum` provider forwards `eth_signTypedData_v4` /
`eth_sendTransaction` calls out to a real Node process holding
`LEDGER_STANDIN_PRIVATE_KEY`, which signs/sends with viem exactly like a real wallet would.
This exercises the actual code path end to end, not a simulation of it.

- Connected as the real approver on `selftest3.mandate.eth`'s self-serve gate
  (`0x03b5e79A6367f69b2EbD720439b20b240a8fDdFa`). The approve panel correctly appears only
  for that exact address.
- Clicking Approve built the real EIP-712 typed data (`buildApprovalTypedData`,
  `frontend/src/lib/chain.ts`), signed it for real, and called `approveWithSignature`
  on chain.
- **The signature itself was valid** -- confirmed because the revert that followed was
  `ExecutionFailed()` (from inside `_approveAndExecute`, after signature recovery already
  succeeded), not `NotApprover()`. Cross-checked with a direct static call:
  `cast call ... approveWithSignature(...)` reproduces the identical `ExecutionFailed`
  selector (`0xacfdb444`).
- **Reject verified separately and cleanly**: a static call to `reject(0)` as the real
  approver returns successfully with no revert -- this path needs no signature at all and
  has no dependency on the target contract, so it's unaffected by the issue below.

## The real gap: self-serve gates have no resolver permissions

`ExecutionFailed` happens because `_approveAndExecute` does `target.call(data)` -- here,
`target` is the shared `mandate.eth` resolver and `data` is a `setText(...)` call. The gate
address has never been granted permission to write records on that resolver, so the call
reverts.

Traced this all the way through the resolver's actual verified source
(`PermissionedResolver.sol`), not guessed:
- Granting roles isn't a plain `grantRoles(resource, roleBitmap, account)` call --
  that function is deliberately disabled on this resolver (`revert EACCannotGrantRoles`
  unconditionally). The real entry point is `grantSetterRoles(bytes setter, address account)`,
  which takes **actual setter calldata** (e.g. a real `setText(...)` call) to derive which
  specific resource (name + record key) it's granting against, then checks that the caller
  already holds admin rights over that resource.
- Tried granting the self-serve gate `ROLE_SET_TEXT` for `mandate:capabilities` on
  `selftest3.mandate.eth`, as both the backend operator and the agent's real owner. Both
  reverted with `EACCannotGrantRoles` -- neither address holds admin rights over that
  resource on the shared resolver.
- This resolver was only ever configured (via `scripts/migrate-gate-domain.ts` /
  `rebrand-onchain.ts`) to grant `ROLE_SET_ADDRESS | ROLE_SET_TEXT` to the **original legacy
  gate** at setup time. Nothing in that setup gives any other address -- including the
  operator, including a genuine self-serve owner -- the standing to extend those
  permissions to a new gate.

**Net effect**: permission-escalation actions for self-serve agents can be proposed and
correctly approved (the signature/authorization layer is fully proven), but cannot
currently execute, because the self-serve gate has nowhere to write. Ownership-transfer
actions for self-serve agents are separately unverified for the same class of reason --
the gate never takes custody of the token in the self-serve flow the way the legacy gate
does, so a transfer-away action would need its own investigation, not assumed to work.

Fixing this for real needs either: a resolver-admin key this project doesn't currently
hold, or restructuring self-serve registration to also provision resolver permissions for
the new gate at setup time (which itself needs an address that has standing to grant
them -- not yet identified). Flagging this as a real, traced, unresolved boundary rather
than leaving it silently broken.
