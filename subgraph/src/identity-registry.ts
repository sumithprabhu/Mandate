import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  Registered,
  MetadataSet,
  URIUpdated,
  Transfer,
} from "../generated/IdentityRegistry/IdentityRegistry";
import { Agent, AgentMetadata, Protocol } from "../generated/schema";

const CHAIN_ID = BigInt.fromI32(11155111); // Sepolia
const IDENTITY_REGISTRY = Bytes.fromHexString("0x8004A818BFB912233c491871b3d84c89A494BD9e");
const REPUTATION_REGISTRY = Bytes.fromHexString("0x8004B663056A597Dffe9eCcC1965A193B7388713");
const PERMISSION_GATE = Bytes.fromHexString("0x7308fd71f0d0282465963fe692e082beabbf1a47");

function agentEntityId(agentId: BigInt): string {
  return CHAIN_ID.toString() + ":" + agentId.toString();
}

function loadOrCreateProtocol(timestamp: BigInt): Protocol {
  let id = CHAIN_ID.toString();
  let protocol = Protocol.load(id);
  if (protocol == null) {
    protocol = new Protocol(id);
    protocol.chainId = CHAIN_ID;
    protocol.name = "AgentNS (Sepolia, ENSv2 hackathon deployment)";
    protocol.identityRegistry = IDENTITY_REGISTRY;
    protocol.reputationRegistry = REPUTATION_REGISTRY;
    protocol.permissionGate = PERMISSION_GATE;
    protocol.createdAt = timestamp;
  }
  protocol.updatedAt = timestamp;
  protocol.save();
  return protocol as Protocol;
}

export function handleRegistered(event: Registered): void {
  loadOrCreateProtocol(event.block.timestamp);

  let id = agentEntityId(event.params.agentId);
  let agent = new Agent(id);
  agent.chainId = CHAIN_ID;
  agent.agentId = event.params.agentId;
  agent.agentURI = event.params.agentURI;
  agent.owner = event.params.owner;
  agent.createdAt = event.block.timestamp;
  agent.updatedAt = event.block.timestamp;
  agent.totalFeedback = BigInt.zero();
  agent.save();
}

export function handleMetadataSet(event: MetadataSet): void {
  let agentId = agentEntityId(event.params.agentId);
  let agent = Agent.load(agentId);
  if (agent == null) return; // MetadataSet before Registered shouldn't happen; defensive only

  let metadataId = agentId + ":" + event.params.metadataKey;
  let metadata = AgentMetadata.load(metadataId);
  if (metadata == null) {
    metadata = new AgentMetadata(metadataId);
    metadata.agent = agentId;
    metadata.key = event.params.metadataKey;
  }
  metadata.value = event.params.metadataValue;
  metadata.updatedAt = event.block.timestamp;
  metadata.save();

  agent.updatedAt = event.block.timestamp;
  agent.save();
}

export function handleUriUpdated(event: URIUpdated): void {
  let id = agentEntityId(event.params.agentId);
  let agent = Agent.load(id);
  if (agent == null) return;
  agent.agentURI = event.params.newURI;
  agent.updatedAt = event.block.timestamp;
  agent.save();
}

export function handleTransfer(event: Transfer): void {
  // mint (from == 0) is handled by handleRegistered's owner field; only re-point owner on
  // a real transfer, since IdentityRegistry emits both Transfer and Registered on mint and
  // Registered already carries the correct initial owner.
  if (event.params.from.equals(Address.zero())) return;

  let id = agentEntityId(event.params.tokenId);
  let agent = Agent.load(id);
  if (agent == null) return;
  agent.owner = event.params.to;
  agent.updatedAt = event.block.timestamp;
  agent.save();
}
