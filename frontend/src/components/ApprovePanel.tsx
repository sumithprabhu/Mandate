import { useState } from "react";
import { useSignTypedData, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { CheckCircle2, XCircle, Loader2, AlertTriangle } from "lucide-react";

import { buildApprovalTypedData, permissionGateAbi } from "../lib/chain";

/** Shown on the pending-action page only when the connected wallet is this action's real
 * approver. Approve: sign the EIP-712 struct, then relay approveWithSignature yourself --
 * fully non-custodial, no backend relay needed. Reject: a plain onlyApprover call, no
 * signature required at all. */
export function ApprovePanel({
  gate,
  actionId,
  domainName,
}: {
  gate: `0x${string}`;
  actionId: string;
  domainName: string;
}) {
  const [mode, setMode] = useState<"idle" | "approving" | "rejecting">("idle");
  const [error, setError] = useState<string | null>(null);

  const { signTypedDataAsync } = useSignTypedData();
  const { writeContract, data: txHash, isPending: isTxPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash });

  async function approve() {
    setError(null);
    setMode("approving");
    try {
      const typedData = buildApprovalTypedData(gate, actionId, domainName);
      const signature = await signTypedDataAsync(typedData);
      writeContract({
        address: gate,
        abi: permissionGateAbi,
        functionName: "approveWithSignature",
        args: [BigInt(actionId), signature],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMode("idle");
    }
  }

  function reject() {
    setError(null);
    setMode("rejecting");
    try {
      writeContract({
        address: gate,
        abi: permissionGateAbi,
        functionName: "reject",
        args: [BigInt(actionId)],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMode("idle");
    }
  }

  const busy = isTxPending || isConfirming;

  return (
    <div className="panel">
      <h3>You're the approver for this action</h3>
      <p>Approving signs an EIP-712 message and relays it yourself. Rejecting needs no signature at all.</p>
      {(error || writeError) && (
        <div className="error-state error-state--spaced">
          <AlertTriangle size={16} strokeWidth={1.5} />
          <span>{error || writeError?.message}</span>
        </div>
      )}
      <div className="page-header__actions button-row">
        <button className="btn btn--primary" onClick={approve} disabled={busy}>
          {busy && mode === "approving" && <Loader2 size={16} strokeWidth={1.5} className="spin" />}
          {!(busy && mode === "approving") && <CheckCircle2 size={16} strokeWidth={1.5} />}
          Approve
        </button>
        <button className="btn" onClick={reject} disabled={busy}>
          {busy && mode === "rejecting" && <Loader2 size={16} strokeWidth={1.5} className="spin" />}
          {!(busy && mode === "rejecting") && <XCircle size={16} strokeWidth={1.5} />}
          Reject
        </button>
      </div>
    </div>
  );
}
