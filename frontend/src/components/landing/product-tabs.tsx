import { useEffect, useState } from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { AnimatePresence, motion } from "motion/react";
import { Send, Clock, CheckCircle2 } from "lucide-react";

import { cn } from "../../lib/utils";

const tabs = [
  { value: "propose", label: "1. Propose", icon: Send },
  { value: "pending", label: "2. Pending", icon: Clock },
  { value: "approved", label: "3. Approved", icon: CheckCircle2 },
] as const;

type TabValue = (typeof tabs)[number]["value"];

/** Illustrates the actual three states an action moves through in the real app
 * (/agents/:name/propose, /actions/:id/pending, /actions/:id/result) -- not live data
 * (that's what the app itself is for), but the real shape of the real flow. */
export function ProductTabs() {
  const [active, setActive] = useState<TabValue>("propose");
  const [autoPlay, setAutoPlay] = useState(true);

  useEffect(() => {
    if (!autoPlay) return;
    const interval = setInterval(() => {
      setActive((current) => tabs[(tabs.findIndex((t) => t.value === current) + 1) % tabs.length].value);
    }, 2600);
    return () => clearInterval(interval);
  }, [autoPlay]);

  function selectTab(value: TabValue) {
    setAutoPlay(false);
    setActive(value);
  }

  return (
    <TabsPrimitive.Root value={active} onValueChange={(v) => selectTab(v as TabValue)} className="w-full max-w-md">
      <TabsPrimitive.List className="mb-4 flex justify-center gap-2">
        {tabs.map((tab) => (
          <TabsPrimitive.Trigger
            key={tab.value}
            value={tab.value}
            className={cn(
              "flex items-center gap-1.5 rounded-full border border-brand-border bg-white px-3.5 py-1.5 text-xs font-semibold text-brand-text-dim transition-colors",
              "data-[state=active]:border-brand-black data-[state=active]:bg-brand-black data-[state=active]:text-white"
            )}
          >
            <tab.icon size={13} strokeWidth={2} />
            {tab.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>

      <div className="overflow-hidden rounded-2xl border border-brand-border bg-white shadow-[0_20px_60px_rgba(24,30,21,0.14)]">
        <div className="flex items-center gap-2 border-b border-brand-border bg-[#f4f6f5] px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ed2d2d]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#b8770f]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#1d9c00]" />
          <span className="ml-2 rounded-full border border-brand-border bg-white px-3 py-0.5 text-[11px] text-brand-text-dim">
            mandate.app
          </span>
        </div>

        <div className="relative h-[168px] p-6">
          <AnimatePresence mode="wait">
            {active === "propose" && (
              <motion.div
                key="propose"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.25 }}
                className="flex h-full flex-col justify-center gap-3"
              >
                <div className="text-sm font-semibold text-brand-black">Ownership transfer</div>
                <div className="rounded-lg border border-brand-border bg-[#f3f5f6] px-3 py-2 font-mono text-xs text-brand-text-dim">
                  0x71C7...9E4b
                </div>
                <div className="w-fit rounded-full bg-brand-black px-4 py-2 text-xs font-semibold text-white">
                  Propose transfer
                </div>
              </motion.div>
            )}
            {active === "pending" && (
              <motion.div
                key="pending"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.25 }}
                className="flex h-full flex-col items-center justify-center gap-3 text-center"
              >
                <motion.span
                  className="h-10 w-10 rounded-full bg-[#b8770f]"
                  animate={{ boxShadow: ["0 0 0 0 rgba(184,119,15,0.4)", "0 0 0 14px rgba(184,119,15,0)"] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
                />
                <div className="text-sm font-semibold text-brand-black">Waiting for approval</div>
                <p className="max-w-[26ch] text-xs text-brand-text-dim">
                  Blocked until the approver signs on hardware.
                </p>
              </motion.div>
            )}
            {active === "approved" && (
              <motion.div
                key="approved"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.25 }}
                className="flex h-full flex-col items-center justify-center gap-3 text-center"
              >
                <motion.div
                  initial={{ scale: 0.7 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 15 }}
                >
                  <CheckCircle2 size={40} strokeWidth={1.5} className="text-[#1d9c00]" />
                </motion.div>
                <div className="text-sm font-semibold text-brand-black">Confirmed</div>
                <p className="max-w-[26ch] text-xs text-brand-text-dim">Signed and relayed on chain. Ownership moved.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </TabsPrimitive.Root>
  );
}
