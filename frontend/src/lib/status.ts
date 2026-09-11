import type { GatedAction } from "./subgraph";

export type Status = "pending" | "confirmed" | "blocked";

/** Real state derived from actual action history, not decoration:
 * pending  -- something is currently awaiting approval
 * blocked  -- the most recent action was rejected
 * confirmed -- most recent action executed cleanly, or there's no history at all */
export function deriveStatus(actions: GatedAction[]): Status {
  if (actions.some((a) => a.status === "Pending")) return "pending";
  const mostRecent = actions[0];
  if (mostRecent && mostRecent.status === "Rejected") return "blocked";
  return "confirmed";
}

export function statusLabel(status: Status): string {
  if (status === "pending") return "Awaiting confirmation";
  if (status === "blocked") return "Blocked";
  return "Confirmed";
}
