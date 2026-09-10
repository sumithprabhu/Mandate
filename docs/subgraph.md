# Subgraph (Phase 3)

## What's real

**Deployed and live**: `https://api.studio.thegraph.com/query/1758954/mandate/v0.2.0`,
fully synced to chain head, zero indexing errors. Tracks the canonical `mandate.eth`
deployment specifically -- `PermissionGate` at `0x8DAa03bACaa88a660F29AbCeB1a72cCD0ac50637`
(`docs/mandate.md`), not the earlier `agentns.eth` gate.

## Why this schema, not an invented one

Entity names and field shapes for `Agent`, `Feedback`, `FeedbackResponse`, and `Protocol`
follow the [Agent0 Subgraphs](https://thegraph.com/docs/en/subgraphs/existing-subgraphs/agent0)
convention -- The Graph's own standardized ERC-8004 indexing schema, already live on
Sepolia against the exact same `IdentityRegistry`/`ReputationRegistry` addresses this
subgraph indexes (`0x8004A818...` / `0x8004B663...`). That's what makes this "standardized"
rather than a one-off schema invented for this project alone: a query written against this
subgraph reads the same way a query against Agent0's would, for the entities they share.

The code itself (schema.graphql wording, the three .ts mapping files) is independently
written against the real contract ABIs, not copied -- `agent0lab/subgraph` carries no
LICENSE file, so this project treats it as a naming/shape convention to align with and
credit, not a source to redistribute.

`PermissionGateAction` is this project's own addition on top: an agent's ownership-transfer
and permission-escalation history, gated behind a second approval. No standardized schema
exists yet for that, because Mandate is what's proposing this history should exist and be
indexed at all -- see `docs/ledger-integration.md` and `contracts/src/PermissionGate.sol`.

## Data sources

| Contract | Address | Events indexed |
|---|---|---|
| IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | `Registered`, `MetadataSet`, `URIUpdated`, `Transfer` |
| ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | `NewFeedback`, `FeedbackRevoked`, `ResponseAppended` |
| PermissionGate (**mandate.eth, canonical**) | `0x8DAa03bACaa88a660F29AbCeB1a72cCD0ac50637` | `OwnershipTransferRequested`, `PermissionEscalationRequested`, `ActionApproved`, `ActionRejected`, `ActionExecuted` |

IdentityRegistry and ReputationRegistry are global (not deployment-specific), so any
agentId's identity/reputation is indexed regardless of namespace. PermissionGate is
deployment-specific -- this subgraph only tracks the mandate.eth gate, deliberately (see
below), not the earlier agentns.eth one.

**Two agents share this one gate**, and the contract itself carries no agentId in its
events (`contracts/src/PermissionGate.sol` is deliberately registry-agnostic), so
`subgraph/src/permission-gate.ts` derives the link per event: exact `tokenId` match for
ownership-transfer actions (carried directly in the event), and a byte-search for the
agent's DNS-encoded name inside the escalation calldata for permission-escalation actions.
Scoped to exactly these two known agents, not a general solution -- see the code comment.

ValidationRegistry is omitted, matching Agent0's own subgraph (their `ValidationRegistry`
data source is present but commented out as "PAUSED") -- per
`erc-8004/erc-8004-contracts`, that registry has no fixed address yet and is still under
active revision with the TEE community (see `docs/deployments.json`).

## The "full trust profile in one query" proof point -- real returned data

Query (agent2.mandate.eth, agentId 10169, after a real Ledger-approved escalation):

```graphql
{
  agent(id: "11155111:10169") {
    agentId
    agentURI
    owner
    totalFeedback
    gatedActions(orderBy: requestedAt, orderDirection: desc) {
      actionType
      status
      requestedBy
      approvedBy
      requestedAt
      executedAt
      escalationTarget
    }
  }
}
```

Actual response:

```json
{
  "data": {
    "agent": {
      "agentId": "10169",
      "agentURI": "https://mandate.example/agents/agent2.json",
      "owner": "0x7621630cb63a73a194f45a3e6801b8c6a7ec2f92",
      "totalFeedback": "0",
      "gatedActions": [
        {
          "actionType": "PermissionEscalation",
          "status": "Executed",
          "requestedBy": "0x0fe68c895aaff3fd16d236a20c1f9113f26e7486",
          "approvedBy": "0x5b0fb1547704deaa7ba4caf614154e7184ff226d",
          "requestedAt": "1788957840",
          "executedAt": "1789017120",
          "escalationTarget": "0xffeee8d04fe487861a20073e9015dea42d31a1a3"
        }
      ]
    }
  }
}
```

`approvedBy` is the real physical Ledger's address. `agent1.mandate.eth` (10168) queried
the same way returns its own three actions, not this one -- confirmed the per-agent
attribution actually distinguishes the two, not just defaulting everything to one.

One query, one round trip: identity (`agentURI`, `owner`), reputation (`feedback` +
`responses`, empty here since nobody's given these agents feedback), and this project's own
gated-permission history (`gatedActions`) -- composed from three separate on-chain data
sources into one entity graph.

## Redeploying

```bash
cd subgraph
npx graph auth <DEPLOY_KEY>       # from thegraph.com/studio
npx graph codegen && npx graph build
npx graph deploy mandate --version-label vX.Y.Z
```

Note: every deploy is a fresh full resync from each data source's `startBlock`, even for
data sources that didn't change (~1.7M blocks, took roughly 10-15 minutes end to end when
this was last done) -- not incremental. Budget for that when timing a redeploy against a
demo recording.

### AssemblyScript compiler gotcha

A mapping function returning `BigInt | null` crashed the AssemblyScript compiler outright
(no diagnostic -- an internal crash) while building this. Isolated by bisection to the
minimal repro: one function returning `BigInt | null` plus one call site checking the
result against `null`. Worked around by returning an empty-string sentinel instead of
`null` and checking `.length > 0`. If a future mapping change reintroduces a nullable class
return type and `graph build` crashes instead of giving a normal type error, this is why.
