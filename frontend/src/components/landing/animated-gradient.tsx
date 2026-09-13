import { motion } from "motion/react";

/** A slow-sweeping radial spotlight over a fixed grid of lines -- reads closer to a
 * ledger/network motif than soft color blobs. Respects prefers-reduced-motion via
 * MotionConfig at the page root. */
export function AnimatedGradient() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.15]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <motion.div
        className="absolute h-[520px] w-[520px] rounded-full bg-brand-purple/50 blur-[110px]"
        animate={{ left: ["-10%", "60%", "-10%"], top: ["-20%", "40%", "-20%"] }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
