# Frontend (Phase 5, v1)

Deliberately nominal: plain forms and lists, no component library, minimal CSS. Exercises
every backend endpoint from `docs/backend.md`. A real design pass comes later.

## Wallet / signing approach

Plain injected-provider connect (`window.ethereum`) via viem's `custom` transport --
no wagmi/RainbowKit for a UI this thin. This is also the real path to hardware Clear
Signing without the Device Management Kit's node-hid transport (`docs/ledger-integration.md`):
MetaMask supports a Ledger as its signing backend, so connecting a Ledger-backed MetaMask
account here routes `signTypedData` through the actual device. No separate integration
needed for that case.

## Verified this session (headless Chromium via Playwright, screenshots + console check)

- Agent list loads real data from the live backend (`agent1.agentns.eth`, `agent2.agentns.eth`)
- Selecting an agent renders identity info; the profile section shows the subgraph's
  not-yet-deployed message gracefully (503, handled, not a crash) -- confirmed via
  `console --errors`-equivalent check, only network-level 503 log lines, no JS exceptions
- Submitted the permission-escalation form for real through the actual UI (not curl):
  created `actionId 3` on Sepolia, rendered in the pending-actions list with an Approve
  button
- No injected wallet in the headless test environment -- "Connect wallet" correctly shows
  as unavailable rather than erroring; the Approve flow (sign via connected wallet, relay
  through the backend) is wired but wasn't exercised end-to-end here since that requires an
  actual wallet extension

## Running it

```bash
cd backend && npm run dev     # :3001
cd frontend && npm run dev    # :5173, VITE_BACKEND_URL defaults to localhost:3001
```
