import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  OwnershipTransferRequested,
  PermissionEscalationRequested,
  ActionApproved,
  ActionRejected,
  ActionExecuted,
} from "../generated/PermissionGate/PermissionGate";
import { PermissionGateAction, Gate } from "../generated/schema";

const CHAIN_ID = BigInt.fromI32(11155111); // Sepolia

// The one gate that predates PermissionGateFactory (see docs/deployments.json) -- deployed
// before agentId existed on the contract and before GateDeployed existed as an event, so it
// has no Gate entity the way every gate from here on will. It also happens to protect two
// agents, not one, unlike every factory-deployed gate -- so per-ACTION disambiguation is
// still genuinely required here, not just per-gate. This fallback is scoped to exactly this
// one already-immutable address and cannot grow to a third case: every other gate resolves
// generically through the Gate entity below.
const LEGACY_GATE = "0x8daa03bacaa88a660f29abceb1a72ccd0ac50637";
const LEGACY_AGENT1_TOKEN_ID = BigInt.fromString(
  "12574331500417930745150951692014312166842720674563136141102103973686872637441"
);
const LEGACY_AGENT2_TOKEN_ID = BigInt.fromString(
  "12914604233378511217194968470333727029220150315766677847302245112977196843008"
);
const LEGACY_AGENT1_ID = BigInt.fromI32(10168);
const LEGACY_AGENT2_ID = BigInt.fromI32(10169);

function agentEntityId(agentId: BigInt): string {
  return CHAIN_ID.toString() + ":" + agentId.toString();
}

function actionEntityId(gate: string, actionId: BigInt): string {
  return gate + ":" + actionId.toString();
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

// Empty string means "unknown agent" throughout -- a `BigInt | null` return here crashed
// the AssemblyScript compiler (an internal compiler bug, isolated by bisection). String +
// length check sidesteps it.
function legacyAgentIdForTokenId(tokenId: BigInt): string {
  if (tokenId.equals(LEGACY_AGENT1_TOKEN_ID)) return agentEntityId(LEGACY_AGENT1_ID);
  if (tokenId.equals(LEGACY_AGENT2_TOKEN_ID)) return agentEntityId(LEGACY_AGENT2_ID);
  return "";
}

function legacyAgentIdForEscalationData(data: Bytes): string {
  if (bytesContain(data, "agent1")) return agentEntityId(LEGACY_AGENT1_ID);
  if (bytesContain(data, "agent2")) return agentEntityId(LEGACY_AGENT2_ID);
  return "";
}

// The general path: every factory-deployed gate has exactly one agent, recorded on its
// Gate entity the moment GateDeployed fired (see permission-gate-factory.ts).
function agentIdForGate(gateAddress: string): string {
  let gate = Gate.load(gateAddress);
  if (gate == null) return "";
  return agentEntityId(gate.agentId);
}

function resolveAgentIdForTransfer(gateAddress: string, tokenId: BigInt): string {
  if (gateAddress == LEGACY_GATE) return legacyAgentIdForTokenId(tokenId);
  return agentIdForGate(gateAddress);
}

function resolveAgentIdForEscalation(gateAddress: string, data: Bytes): string {
  if (gateAddress == LEGACY_GATE) return legacyAgentIdForEscalationData(data);
  return agentIdForGate(gateAddress);
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
  let agentId = resolveAgentIdForTransfer(gate, event.params.tokenId);
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
  let agentId = resolveAgentIdForEscalation(gate, event.params.data);
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
