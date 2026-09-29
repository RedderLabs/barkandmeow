import * as React from "react";
import { cn } from "../lib/utils";

/* 48px y texto de 16px para que iOS no haga zoom al enfocar. El trazo es más
   oscuro que la hairline porque un campo editable tiene que anunciarse. */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-12 w-full min-w-0 rounded-lg border border-input bg-surface px-3.5 text-base font-normal text-ink transition-colors duration-[120ms] ease-sistema placeholder:text-muted-foreground hover:border-ink-soft/50 disabled:cursor-not-allowed disabled:text-muted-foreground aria-invalid:border-alert-ink",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
