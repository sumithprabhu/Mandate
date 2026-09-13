const COLS = 16;
const ROWS = 6;

/** A grid of cells that flicker on at random, independent intervals (a CSS animation
 * per cell with a randomized delay/duration, not JS-driven per-frame updates), plus a
 * direct highlight on hover -- reads like a live circuit/ledger rather than decorative
 * color blobs. Respects prefers-reduced-motion globally (tokens.css collapses all
 * animation-duration to ~0, which just makes each cell's flicker instant rather than
 * a visible fade -- still fine, no motion to reduce). */
export function AnimatedGradient() {
  const cells = Array.from({ length: COLS * ROWS });
  return (
    <div
      className="absolute inset-0 grid overflow-hidden"
      style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, gridTemplateRows: `repeat(${ROWS}, 1fr)` }}
    >
      {cells.map((_, i) => {
        const delay = (Math.random() * 10).toFixed(2);
        const duration = (4 + Math.random() * 5).toFixed(2);
        return (
          <div
            key={i}
            className="border border-white/5 transition-colors duration-300 hover:bg-brand-mint/40!"
            style={{ animation: `cell-flicker ${duration}s ease-in-out ${delay}s infinite` }}
          />
        );
      })}
    </div>
  );
}
