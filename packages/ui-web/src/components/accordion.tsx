"use client";

import * as React from "react";
import { Accordion as AccordionPrimitive } from "radix-ui";
import { ChevronDown } from "lucide-react";
import { cn } from "../lib/utils";

function Accordion(props: React.ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />;
}

function AccordionItem({ className, ...props }: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("border-b border-divider", className)}
      {...props}
    />
  );
}

/* La pregunta es el control: fila entera, 44px mínimos, y el chevrón gira
   en vez de cambiar de icono. */
function AccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "group flex min-h-11 flex-1 cursor-pointer items-center justify-between gap-4 py-[18px] text-left text-[17px] leading-snug font-semibold text-ink transition-colors duration-[120ms] ease-sistema hover:text-brand-ink",
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDown
          aria-hidden="true"
          strokeWidth={1.8}
          className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 ease-sistema group-data-[state=open]:rotate-180"
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      className="overflow-hidden data-[state=closed]:animate-[bm-acordeon-cierra_160ms_var(--ease)] data-[state=open]:animate-[bm-acordeon-abre_220ms_var(--ease)]"
      {...props}
    >
      <div className={cn("max-w-[68ch] pb-[18px] text-[15px] leading-relaxed text-ink-soft", className)}>
        {children}
      </div>
    </AccordionPrimitive.Content>
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
