# Subgraph (Phase 3)

## What's real, what's manual

**Built and verified locally**: `subgraph/` -- schema, manifest, and three AssemblyScript
mappings, all compiling cleanly (`graph codegen && graph build`, both pass with zero
errors) against the real deployed contracts' ABIs. Not yet deployed to Subgraph Studio --
that needs a Graph account and a deploy key, which is this project's next manual step
(same pattern as the Ledger hardware tap: build and verify everything code-side, defer the
one step that needs a human with credentials).

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
exists yet for that, because AgentNS is what's proposing this history should exist and be
indexed at all -- see `docs/ledger-integration.md` and `contracts/src/PermissionGate.sol`.

## Data sources

| Contract | Address | Events indexed |
|---|---|---|
| IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | `Registered`, `MetadataSet`, `URIUpdated`, `Transfer` |
| ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | `NewFeedback`, `FeedbackRevoked`, `ResponseAppended` |
| PermissionGate | `0x7308fd71f0d0282465963fe692e082beabbf1a47` | `OwnershipTransferRequested`, `PermissionEscalationRequested`, `ActionApproved`, `ActionRejected`, `ActionExecuted` |

ValidationRegistry is omitted, matching Agent0's own subgraph (their `ValidationRegistry`
data source is present but commented out as "PAUSED") -- per
`erc-8004/erc-8004-contracts`, that registry has no fixed address yet and is still under
active revision with the TEE community (see `docs/deployments.json`).

## The "full trust profile in one query" proof point

```graphql
{
  agent(id: "11155111:10158") {
    agentId
    agentURI
    owner
    totalFeedback
    feedback(first: 10) {
      value
      valueDecimals
      tag1
      isRevoked
      responses {
        responder
        responseURI
      }
    }
    gatedActions(orderBy: requestedAt, orderDirection: desc) {
      actionType
      status
      requestedBy
      approvedBy
      newOwner
      escalationTarget
      requestedAt
      executedAt
    }
  }
}
```

One query, one round trip: identity (`agentURI`, `owner`), reputation (`feedback` +
`responses`), and this project's own gated-permission history (`gatedActions`) --
composed from three separate on-chain data sources into one entity graph.

## Deploying (manual step)

```bash
cd subgraph
npx graph auth --studio <DEPLOY_KEY>          # from thegraph.com/studio, after creating
                                                # a subgraph there named "agentns"
npm run deploy                                 # graph deploy agentns
```

Requires a Subgraph Studio account (thegraph.com/studio) and a subgraph created there
named `agentns` (or update the `deploy` script in `package.json` to match whatever name
is chosen) -- not something this session has credentials for. Once deployed, update this
file with the live query URL.
