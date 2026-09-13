import { useState } from "react";
import { Copy, Check } from "lucide-react";

import { truncateAddress } from "../lib/format";

/** Always renders on one line, regardless of container width -- shows the full address
 * on hover (native title tooltip) and lets you grab it exactly via the copy button,
 * rather than ever wrapping or overflowing a 42-character hex string. */
export function CopyableAddress({ address, chars = 4 }: { address: string; chars?: number }) {
  const [copied, setCopied] = useState(false);

  async function copy(e: React.MouseEvent) {
    e.preventDefault();
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <span className="copyable-address mono" title={address}>
      {truncateAddress(address, chars)}
      <button type="button" className="copyable-address__btn" onClick={copy} aria-label="Copy address">
        {copied ? <Check size={12} strokeWidth={2} /> : <Copy size={12} strokeWidth={2} />}
      </button>
    </span>
  );
}
