import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  OwnershipTransferRequested,
  PermissionEscalationRequested,
  ActionApproved,
  ActionRejected,
  ActionExecuted,
} from "../generated/PermissionGate/PermissionGate";
import { PermissionGateAction } from "../generated/schema";

// The canonical mandate.eth gate (0x8DAa03bACaa88a660F29AbCeB1a72cCD0ac50637, see
// docs/mandate.md) protects exactly two known agents. PermissionGate itself is
// deliberately registry-agnostic (contracts/src/PermissionGate.sol) and doesn't carry an
// agentId in its events, so the link has to be derived out of band -- kept to the simplest
// thing that's actually correct for these two agents, not a generic multi-agent resolver:
//   - OwnershipTransferRequested carries `tokenId` directly -- exact match against the two
//     known tokenIds.
//   - PermissionEscalationRequested only carries the resolver call's raw calldata. Its
//     `data` is always `setText(bytes dnsName, string key, string value)` (see
//     backend/src/chain.ts encodeSetText), and the DNS wire encoding of "agent1.mandate.eth"
//     / "agent2.mandate.eth" contains the unbroken ASCII label "agent1" / "agent2" nowhere
//     else in that calldata -- searching for that 6-byte sequence is sufficient here.
const CHAIN_ID = BigInt.fromI32(11155111); // Sepolia
const AGENT1_TOKEN_ID = BigInt.fromString(
  "12574331500417930745150951692014312166842720674563136141102103973686872637441"
);
const AGENT2_TOKEN_ID = BigInt.fromString(
  "12914604233378511217194968470333727029220150315766677847302245112977196843008"
);
const AGENT1_ID = BigInt.fromI32(10168);
const AGENT2_ID = BigInt.fromI32(10169);

function agentEntityId(agentId: BigInt): string {
  return CHAIN_ID.toString() + ":" + agentId.toString();
}

function actionEntityId(gate: string, actionId: BigInt): string {
  return gate + ":" + actionId.toString();
}

// Empty string means "unknown agent" throughout -- a `BigInt | null` return here crashed
// the AssemblyScript compiler (an internal compiler bug, not a logic error: isolated by
// bisection, reproduces with nothing more than one function returning `BigInt | null` and
// one call site checking it against `null`). String + length check sidesteps it.
function agentEntityIdForTokenId(tokenId: BigInt): string {
  if (tokenId.equals(AGENT1_TOKEN_ID)) return agentEntityId(AGENT1_ID);
  if (tokenId.equals(AGENT2_TOKEN_ID)) return agentEntityId(AGENT2_ID);
  return "";
}

// True if `needle` (ASCII) appears as a contiguous byte sequence anywhere in `haystack`.
function bytesContain(haystack: Bytes, needle: string): bool {
  let n = Bytes.fromUTF8(needle);
  if (n.length > haystack.length) return false;
  for (let i = 0; i <= haystack.length - n.length; i++) {
    let match = true;
    for (let j = 0; j < n.length; j++) {
      if (haystack[i + j] != n[j]) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}

function agentEntityIdForEscalationData(data: Bytes): string {
  if (bytesContain(data, "agent1")) return agentEntityId(AGENT1_ID);
  if (bytesContain(data, "agent2")) return agentEntityId(AGENT2_ID);
  return "";
}

export function handleOwnershipTransferRequested(event: OwnershipTransferRequested): void {
  let gate = event.address.toHexString();
  let id = actionEntityId(gate, event.params.actionId);

  let action = new PermissionGateAction(id);
  action.gate = event.address;
  action.actionId = event.params.actionId;
  action.actionType = "OwnershipTransfer";
  action.tokenId = event.params.tokenId;
  action.newOwner = event.params.newOwner;
  action.requestedBy = event.params.requestedBy;
  action.requestedAt = event.block.timestamp;
  action.status = "Pending";
  let agentId = agentEntityIdForTokenId(event.params.tokenId);
  if (agentId.length > 0) action.agent = agentId;
  action.save();
}

export function handlePermissionEscalationRequested(event: PermissionEscalationRequested): void {
  let gate = event.address.toHexString();
  let id = actionEntityId(gate, event.params.actionId);

  let action = new PermissionGateAction(id);
  action.gate = event.address;
  action.actionId = event.params.actionId;
  action.actionType = "PermissionEscalation";
  action.escalationTarget = event.params.target;
  action.escalationData = event.params.data;
  action.requestedBy = event.params.requestedBy;
  action.requestedAt = event.block.timestamp;
  action.status = "Pending";
  let agentId = agentEntityIdForEscalationData(event.params.data);
  if (agentId.length > 0) action.agent = agentId;
  action.save();
}

export function handleActionApproved(event: ActionApproved): void {
  let gate = event.address.toHexString();
  let id = actionEntityId(gate, event.params.actionId);
  let action = PermissionGateAction.load(id);
  if (action == null) return;
  action.approvedBy = event.params.approver;
  action.save();
}

export function handleActionRejected(event: ActionRejected): void {
  let gate = event.address.toHexString();
  let id = actionEntityId(gate, event.params.actionId);
  let action = PermissionGateAction.load(id);
  if (action == null) return;
  action.status = "Rejected";
  action.save();
}

export function handleActionExecuted(event: ActionExecuted): void {
  let gate = event.address.toHexString();
  let id = actionEntityId(gate, event.params.actionId);
  let action = PermissionGateAction.load(id);
  if (action == null) return;
  action.status = "Executed";
  action.executedAt = event.block.timestamp;
  action.save();
}
