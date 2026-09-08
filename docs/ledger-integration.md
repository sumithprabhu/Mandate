# Ledger integration (Phase 2)

## What's real, what's not

**Deployed and proven live on Sepolia** (docs/phase2-deployment.json): `PermissionGate`
with an EIP-712 signature-based approval path, a resolver only the gate can write to, and a
full request -> sign -> relay -> execute cycle where the approver held **zero ETH** the
entire time.

**Not yet run**: against real Ledger hardware or the Speculos emulator. Neither was
available in the session that built this (no Docker installed to run Speculos, no
physical device connected). `scripts/ledger-approve.ts` implements the real path -- built
from Ledger's own reference CLI source (`github.com/LedgerHQ/device-sdk-ts`,
`apps/ldmk-cli`), type-checked against the real published `@ledgerhq/*` types -- but has
not itself been executed. Swapping it in is a config change, not new code: see below.

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
domain:  { name: "AgentNS PermissionGate", version: "1", chainId: 11155111, verifyingContract: <gate address> }
types:   { Approval: [{ name: "actionId", type: "uint256" }] }
message: { actionId: <the pending action's id> }
```

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

### To actually run it

1. `cd scripts && npm install` (already includes the `@ledgerhq/*` packages)
2. Connect the Ledger, unlock it, open the Ethereum app
3. Get its address at `44'/60'/0'/0/0` (the script does this and checks it against the
   gate's current `approver`)
4. If it doesn't match yet: call `PermissionGate.setApprover(<ledger address>)` from the
   *current* approver (the throwaway key in `contracts/.env`, for the existing deployment
   in `docs/phase2-deployment.json`)
5. Have the operator call `requestOwnershipTransfer` or `requestPermissionEscalation` to
   create a pending action (see `phase2-ledger-demo.ts` Step 3 for the pattern)
6. `npx tsx ledger-approve.ts <gateAddress> <actionId>` -- review on the device screen,
   confirm, done

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
