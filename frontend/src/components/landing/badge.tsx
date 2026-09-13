import * as React from "react";
import { cn } from "../../lib/utils";

const Badge = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center rounded-full bg-brand-purple/20 px-3 py-1 text-xs font-semibold text-brand-black",
        className
      )}
      {...props}
    />
  )
);
Badge.displayName = "Badge";

export { Badge };
