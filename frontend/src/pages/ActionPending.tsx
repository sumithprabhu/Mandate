import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { Loader2, AlertTriangle, ArrowLeft } from "lucide-react";

import { api, type Agent } from "../lib/api";
import { fetchGateForAgent } from "../lib/subgraph";
import { readGateAction, type OnChainAction } from "../lib/chain";
import { ApprovePanel } from "../components/ApprovePanel";

interface GateInfo {
  address: `0x${string}`;
  approver: string;
  domainName: string;
}

const POLL_MS = 3000;
const RESOLVE_DELAY_MS = 900;

function formatTimestamp(seconds: string): string {
  return new Date(Number(seconds) * 1000).toLocaleString();
}

export function ActionPendingPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const agentName = params.get("agent");
  const navigate = useNavigate();

  const { address: connectedAddress } = useAccount();

  const [agent, setAgent] = useState<Agent | null | undefined>(undefined);
  const [gateInfo, setGateInfo] = useState<GateInfo | null | undefined>(undefined);
  const [action, setAction] = useState<OnChainAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resolvedRef = useRef(false);

  useEffect(() => {
    if (!agentName) {
      setError("No agent specified for this action. Reload from the agent's page.");
      return;
    }
    api
      .listAgents()
      .then(async (r) => {
        const found = r.agents.find((a) => a.name === agentName) ?? null;
        setAgent(found);
        if (found?.gate && found.approver && found.domainName) {
          setGateInfo({ address: found.gate as `0x${string}`, approver: found.approver, domainName: found.domainName });
        } else if (found) {
          const gate = await fetchGateForAgent(found.agentId);
          setGateInfo(
            gate ? { address: gate.id as `0x${string}`, approver: gate.approver, domainName: gate.domainName ?? found.name } : null
          );
        } else {
          setGateInfo(null);
        }
      })
      .catch((e) => setError(e.message));
  }, [agentName]);

  const gateAddress = gateInfo?.address;

  // Reads the gate's action directly on chain -- a plain public view call works
  // identically for the legacy shared gate and any self-serve gate, unlike the backend's
  // getAction endpoint, which requires an agent record with a `gate` field self-serve
  // agents deliberately don't have (see lib/subgraph.ts::fetchGateForAgent).
  useEffect(() => {
    if (!gateAddress || !id) return;

    let cancelled = false;
    async function poll() {
      try {
        const result = await readGateAction(gateAddress!, id!);
        if (cancelled) return;
        setAction(result);
        if (result.status !== "Pending" && !resolvedRef.current) {
          resolvedRef.current = true;
          setTimeout(() => {
            if (!cancelled) navigate(`/actions/${id}/result?agent=${agentName}`);
          }, RESOLVE_DELAY_MS);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }

    poll();
    const interval = setInterval(() => {
      if (!resolvedRef.current) poll();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [gateAddress, id, agentName, navigate]);

  if (error) {
    return (
      <div className="panel error-state">
        <AlertTriangle size={20} strokeWidth={1.5} />
        <span>{error}</span>
      </div>
    );
  }

  if (agent === undefined || agent === null || gateInfo === undefined) {
    return (
      <div className="panel empty-state">
        <Loader2 size={20} strokeWidth={1.5} className="spin" />
        <span>Loading action status.</span>
      </div>
    );
  }

  if (gateInfo === null) {
    return (
      <div className="panel empty-state">
        <span>{agent.name} has no PermissionGate configured, so there's no action to show.</span>
      </div>
    );
  }

  if (!action) {
    return (
      <div className="panel empty-state">
        <Loader2 size={20} strokeWidth={1.5} className="spin" />
        <span>Loading action status.</span>
      </div>
    );
  }

  const ledClass = action.status === "Pending" ? "led--pending" : action.status === "Rejected" ? "led--blocked" : "led--confirmed";
  const headline =
    action.status === "Pending"
      ? "Waiting for approval"
      : action.status === "Rejected"
      ? "Rejected"
      : "Confirmed";
  const description =
    action.status === "Pending"
      ? "This request needs the approver's signature before it can execute. Nothing has happened on chain yet."
      : action.status === "Rejected"
      ? "The approver rejected this request. It will not execute."
      : "The approver signed and it has been relayed on chain.";

  return (
    <>
      <Link to={`/agents/${agent.name}`} className="link-row">
        <ArrowLeft size={14} strokeWidth={1.5} />
        Back to {agent.name}
      </Link>

      <div className="panel action-status">
        <span className={`led ${ledClass}`} />
        <div>
          <h1>{headline}</h1>
          <p>{description}</p>
        </div>
      </div>

      <div className="panel bento">
        <div className="bento__cell--1 detail-row">
          <div className="action-status__label">Action type</div>
          <div>{action.actionType === "OwnershipTransfer" ? "Ownership transfer" : "Permission escalation"}</div>
        </div>
        <div className="bento__cell--1 detail-row">
          <div className="action-status__label">Requested by</div>
          <div className="mono">{action.requestedBy}</div>
        </div>
        <div className="bento__cell--1 detail-row">
          <div className="action-status__label">Requested at</div>
          <div className="mono">{formatTimestamp(action.requestedAt)}</div>
        </div>
        <div className="bento__cell--1 detail-row">
          <div className="action-status__label">Agent</div>
          <div>{agent.name}</div>
        </div>
      </div>

      {action.status === "Pending" && connectedAddress?.toLowerCase() === gateInfo.approver.toLowerCase() && (
        <ApprovePanel gate={gateInfo.address} actionId={id!} domainName={gateInfo.domainName} />
      )}
    </>
  );
}
