"use client";

import * as React from "react";
import { CheckIcon } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { cn } from "../lib/utils";

/* 20px dentro de una fila de 44px mínimos, que pone quien lo usa. Marcado en
   verde de marca, con el tick además del color. */
function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer mt-0.5 size-5 shrink-0 cursor-pointer rounded-[5px] border border-field-line bg-surface text-primary-foreground transition-colors duration-[120ms] ease-sistema hover:border-brand disabled:cursor-not-allowed aria-invalid:border-alert-ink data-[state=checked]:border-brand data-[state=checked]:bg-brand",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator data-slot="checkbox-indicator" className="grid place-content-center">
        <CheckIcon strokeWidth={3} className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
