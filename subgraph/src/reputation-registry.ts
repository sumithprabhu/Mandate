import { BigInt } from "@graphprotocol/graph-ts";
import {
  NewFeedback,
  FeedbackRevoked,
  ResponseAppended,
} from "../generated/ReputationRegistry/ReputationRegistry";
import { Agent, Feedback, FeedbackResponse } from "../generated/schema";

const CHAIN_ID = BigInt.fromI32(11155111); // Sepolia

function agentEntityId(agentId: BigInt): string {
  return CHAIN_ID.toString() + ":" + agentId.toString();
}

function feedbackEntityId(agentId: BigInt, clientAddress: string, feedbackIndex: BigInt): string {
  return agentEntityId(agentId) + ":" + clientAddress + ":" + feedbackIndex.toString();
}

export function handleNewFeedback(event: NewFeedback): void {
  let agentId = agentEntityId(event.params.agentId);
  let agent = Agent.load(agentId);
  if (agent == null) return; // feedback for an agent this subgraph hasn't indexed a Registered event for yet

  // uint64/int128 Solidity params both decode as BigInt via graph-ts codegen.
  let feedbackIndex = event.params.feedbackIndex;
  let id = feedbackEntityId(event.params.agentId, event.params.clientAddress.toHexString(), feedbackIndex);

  let feedback = new Feedback(id);
  feedback.agent = agentId;
  feedback.clientAddress = event.params.clientAddress;
  feedback.feedbackIndex = feedbackIndex;
  feedback.value = event.params.value;
  feedback.valueDecimals = event.params.valueDecimals;
  feedback.tag1 = event.params.tag1;
  feedback.tag2 = event.params.tag2;
  feedback.endpoint = event.params.endpoint;
  feedback.feedbackURI = event.params.feedbackURI;
  feedback.feedbackHash = event.params.feedbackHash;
  feedback.isRevoked = false;
  feedback.createdAt = event.block.timestamp;
  feedback.save();

  agent.totalFeedback = agent.totalFeedback.plus(BigInt.fromI32(1));
  agent.updatedAt = event.block.timestamp;
  agent.save();
}

export function handleFeedbackRevoked(event: FeedbackRevoked): void {
  let feedbackIndex = event.params.feedbackIndex;
  let id = feedbackEntityId(event.params.agentId, event.params.clientAddress.toHexString(), feedbackIndex);
  let feedback = Feedback.load(id);
  if (feedback == null) return;
  feedback.isRevoked = true;
  feedback.revokedAt = event.block.timestamp;
  feedback.save();
}

export function handleResponseAppended(event: ResponseAppended): void {
  let feedbackIndex = event.params.feedbackIndex;
  let feedbackId = feedbackEntityId(event.params.agentId, event.params.clientAddress.toHexString(), feedbackIndex);
  let feedback = Feedback.load(feedbackId);
  if (feedback == null) return; // ResponseAppended always follows an existing NewFeedback; defensive only

  let responseId = feedbackId + ":" + event.logIndex.toString();
  let response = new FeedbackResponse(responseId);
  response.feedback = feedbackId;
  response.responder = event.params.responder;
  response.responseURI = event.params.responseURI;
  response.responseHash = event.params.responseHash;
  response.createdAt = event.block.timestamp;
  response.save();
}
