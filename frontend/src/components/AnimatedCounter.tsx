import { useEffect, useRef } from "react";
import { motion, useInView, useMotionValue, useTransform, animate } from "motion/react";

export function AnimatedCounter({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20px" });
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => Math.round(v).toString());

  useEffect(() => {
    if (!inView) return;
    const controls = animate(count, value, { duration: 1.1, ease: "easeOut" });
    return () => controls.stop();
  }, [inView, value, count]);

  return <motion.span ref={ref}>{rounded}</motion.span>;
}
