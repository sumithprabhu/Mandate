import { BigInt } from "@graphprotocol/graph-ts";
import {
  OwnershipTransferRequested,
  PermissionEscalationRequested,
  ActionApproved,
  ActionRejected,
  ActionExecuted,
} from "../generated/PermissionGate/PermissionGate";
import { PermissionGateAction } from "../generated/schema";

// This gate protects exactly one agent for now (agentId 10158, "agent1.agentns.eth" -- see
// docs/registered-agents.json). PermissionGate itself is deliberately registry-agnostic
// (contracts/src/PermissionGate.sol) and doesn't carry an agentId in its events, so the
// link has to be supplied out of band. A gate protecting multiple agents, or a second
// gate instance, would need either a second data source (with its own known agentId) or a
// real on-chain lookup from (target, tokenId) to agentId; out of scope for this demo.
const CHAIN_ID = BigInt.fromI32(11155111); // Sepolia
const KNOWN_AGENT_ID = BigInt.fromI32(10158);

function knownAgentEntityId(): string {
  return CHAIN_ID.toString() + ":" + KNOWN_AGENT_ID.toString();
}

function actionEntityId(gate: string, actionId: BigInt): string {
  return gate + ":" + actionId.toString();
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
  action.agent = knownAgentEntityId();
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
  action.agent = knownAgentEntityId();
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
