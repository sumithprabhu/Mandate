// Abstract mark, not a literal icon: a solid seal (the identity/registration) with a
// signature dot notched into its corner (the second, hardware-signed approval). Two flat
// shapes, palette-only colors (--ink black, --accent-purple) -- reads fine at nav size.
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="6" fill="#181e15" />
      <circle cx="21" cy="7" r="6" fill="#c190ff" />
    </svg>
  );
}
