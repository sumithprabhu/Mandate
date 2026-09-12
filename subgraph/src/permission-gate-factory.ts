import { GateDeployed } from "../generated/PermissionGateFactory/PermissionGateFactory";
import { Gate } from "../generated/schema";
import { PermissionGate } from "../generated/templates";

// Every gate from here on is created through the factory, so this is the one place that
// ever needs to know a gate's agentId -- permission-gate.ts just reads it back off the
// Gate entity, no calldata inspection required for any gate deployed after this point.
export function handleGateDeployed(event: GateDeployed): void {
  let gate = new Gate(event.params.gate.toHexString());
  gate.agentId = event.params.agentId;
  gate.domainName = event.params.domainName;
  gate.operator = event.params.operator;
  gate.approver = event.params.approver;
  gate.createdAt = event.block.timestamp;
  gate.save();

  PermissionGate.create(event.params.gate);
}
