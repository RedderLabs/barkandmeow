import * as React from "react";
import { cn } from "../lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "block min-h-24 w-full resize-none rounded-lg border border-input bg-surface px-3.5 py-3 text-base font-normal leading-[1.45] text-ink transition-colors duration-[120ms] ease-sistema placeholder:text-muted-foreground hover:border-ink-soft/50 aria-invalid:border-alert-ink",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
