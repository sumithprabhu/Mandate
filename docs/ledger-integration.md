# Ledger integration (Phase 2)

## What's real, what's not

**Deployed and proven live on Sepolia** (docs/phase2-deployment.json): `PermissionGate`
with an EIP-712 signature-based approval path, a resolver only the gate can write to, and a
full request -> sign -> relay -> execute cycle where the approver held **zero ETH** the
entire time.

**Verified against real hardware (2026-09-09).** `scripts/ledger-approve.ts` -- connected
over USB (node-hid, no browser), derived the device's address, sent
`Approval(actionId=1)` for Clear Signing, physically confirmed on the device screen, relayed
the resulting signature on chain. `ActionApproved` and `ActionExecuted` both landed and the
resolver record was written -- [tx `0x539d74f...`](https://sepolia.etherscan.io/tx/0x539d74fef72b17b2eaee1b1bafe520b003ccdf5f5df378a17ff85195c153cc3c).
The gate's `approver` was rotated from the throwaway stand-in key to the real Ledger address
(`0x5B0Fb1547704DeAA7Ba4caF614154E7184ff226d`) via `setApprover` first -- see "To actually
run it" below.

One real bug surfaced on the first attempt: `ledger-approve.ts` still had the domain name
hardcoded to the original `"AgentNS PermissionGate"`, left over from before
`contracts/src/PermissionGate.sol`'s domain name became a constructor parameter (see
`docs/mandate.md`). Signed against the wrong domain, so `approveWithSignature` recovered the
wrong address and reverted `NotApprover` -- fixed by making the domain name a script
argument (defaults to `"Mandate PermissionGate"`, the current canonical gate).

## Why signatures, not raw transactions

The original plan (per the build spec) was: operator constructs an ownership-transfer or
permission-escalation transaction, the Ledger's Ethereum app displays it via **Clear
Signing** (ERC-7730), the human confirms, the Ledger broadcasts it directly. Two things
changed that:

1. **Clear Signing for raw contract calldata requires an ERC-7730 descriptor**, and none
   exists for a brand-new contract like `PermissionGate` in Ledger's public registry.
   Getting one merged there is a slow PR process, not realistic on a hackathon timeline.
2. **The approver would need its own ETH** to broadcast `approve()` directly -- an
   awkward requirement for a hardware key that should only ever need to *authorize*
   things, not fund them.

The fix addresses both: `PermissionGate.approveWithSignature(actionId, signature)` accepts
an **EIP-712 typed-data signature** instead of a direct call. EIP-712 is natively
human-readable on Ledger's Ethereum app -- it shows the domain name and every struct field
as plain text, no descriptor needed, because typed-data display isn't gated behind the
ERC-7730 registry the way raw calldata is. And because it's *just a signature*, anyone
(the operator) can relay it on chain and pay the gas -- the approver never needs funds.

The direct-call `approve()` path from Phase 1 still exists (tested, 18/18 passing in
`contracts/test/PermissionGate.t.sol`) for cases where the approver wants to pay its own
gas, but `approveWithSignature()` is the one Ledger will actually use.

## The typed-data structure

```
domain:  { name: <the gate's domain name, e.g. "Mandate PermissionGate">, version: "1", chainId: 11155111, verifyingContract: <gate address> }
types:   { Approval: [{ name: "actionId", type: "uint256" }] }
message: { actionId: <the pending action's id> }
```

The domain name isn't a fixed string -- it's a constructor parameter on `PermissionGate`
(`docs/mandate.md`), so it's part of what has to match exactly between what you sign and
what the target gate's `DOMAIN_SEPARATOR` was built with. Get it wrong and every signature
recovers to the wrong address (`ledger-approve.ts <gate> <actionId> [domainName]` takes it
as an explicit argument for exactly this reason -- learned from a real revert, not
hypothetically).

Bound to the gate's address and the chain id, so a signature can't be replayed against a
different deployment or network. Bound to the specific `actionId`, so it can't be replayed
against a different action, and can't be reused after the action executes (its status
moves out of `Pending`).

## Swapping in a real device

`scripts/phase2-ledger-demo.ts` signs with a throwaway local key
(`LEDGER_STANDIN_PRIVATE_KEY` in `contracts/.env`) via viem's `account.signTypedData(...)`.
`scripts/ledger-approve.ts` is the same signature, produced instead by:

```ts
import { DeviceManagementKitBuilder } from "@ledgerhq/device-management-kit";
import { nodeHidTransportFactory } from "@ledgerhq/device-transport-kit-node-hid";
import { SignerEthBuilder } from "@ledgerhq/device-signer-kit-ethereum";

const dmk = new DeviceManagementKitBuilder().addTransport(nodeHidTransportFactory).build();
// ...discover + connect to get a sessionId...
const signer = new SignerEthBuilder({ dmk, sessionId }).build();
const { observable } = signer.signTypedData(derivationPath, typedData, { skipOpenApp: false });
// subscribe; DeviceActionStatus.Pending carries requiredUserInteraction text while
// the human reviews on screen, DeviceActionStatus.Completed carries { r, s, v }
```

No browser or WebHID needed -- `@ledgerhq/device-transport-kit-node-hid` talks to the
device over USB directly from a terminal script, which is how Ledger's own `ldmk-cli`
reference tool works.

### To actually run it (this is the real sequence that worked)

1. `cd scripts && npm install` (already includes the `@ledgerhq/*` packages)
2. Connect the Ledger, unlock it, open the Ethereum app
3. `npx tsx ledger-approve.ts <gate> <anyActionId>` once just to get the device's address
   printed (it fails cleanly at the approver-mismatch check before signing anything --
   safe, read-only, no transaction)
4. **`setApprover` needs the current approver to pay its own gas**, which the throwaway
   stand-in key doesn't have by design (it's meant to never need ETH). Send it a small
   amount first (`cast send <throwawayAddress> --value 0.001ether --private-key
   $DEPLOYER_PRIVATE_KEY ...`), then `cast send <gate> "setApprover(address)" <ledgerAddress>
   --private-key $LEDGER_STANDIN_PRIVATE_KEY ...`
5. Create a pending action -- e.g. `POST /agents/:agentId/escalate` on the backend (pass
   `target` explicitly if the agent has no `gatedResolver` configured; its own `resolver`
   field works if that's the one actually gated -- see `backend/data/agents.json`)
6. `npx tsx ledger-approve.ts <gateAddress> <actionId>` -- review on the device screen,
   confirm, done. Domain name defaults to `"Mandate PermissionGate"`; pass a third arg to
   override for a different gate.

### If Speculos becomes available instead of physical hardware

`@ledgerhq/device-transport-kit-speculos` exists for exactly this. Not set up in this
session (needs Docker + the Ethereum app's ELF binary, neither in place). Would let the
same flow run against a software-emulated device for repeatable testing before the final
physical-hardware demo run.

## Genuine ERC-7730 Clear Signing (deferred)

If a raw-transaction flow is wanted later (e.g. the approver broadcasting `approve()`
directly with its own gas, or gating some other contract's calldata), a local ERC-7730
descriptor plus a custom `ContextModule` (per Ledger's docs, `withContextModule` on the
signer builder) would let the device show human-readable calldata without a registry PR.
Not needed for the signature-based path above, since EIP-712 display doesn't go through
that mechanism -- deferred unless the project actually needs raw-tx Clear Signing.
