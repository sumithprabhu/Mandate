import type { Status } from "../lib/status";

export function StatusDot({ status }: { status: Status }) {
  return <span className={`status-dot status-dot--${status}`} />;
}

export function StatusPill({ status }: { status: Status }) {
  const label = status === "pending" ? "Pending" : status === "blocked" ? "Blocked" : "Confirmed";
  return (
    <span className={`pill pill--${status}`}>
      <StatusDot status={status} />
      {label}
    </span>
  );
}
