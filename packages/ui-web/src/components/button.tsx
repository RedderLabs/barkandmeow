import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "../lib/utils";

/* Medidas de DESIGN.md, no las de shadcn: la acción principal mide 52px, la
   secundaria 48 y nada baja de 44. Sin sombras: el sistema es plano. El foco lo
   dibuja el anillo global de globals.css. */
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer font-sans items-center justify-center gap-2.5 whitespace-nowrap rounded-xl no-underline transition-colors duration-[120ms] ease-sistema disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default:
          "bg-brand font-semibold text-primary-foreground hover:bg-brand-hover hover:text-primary-foreground active:bg-brand-press disabled:bg-divider disabled:text-muted-foreground",
        outline:
          "border border-line bg-surface font-medium text-ink hover:border-field-line hover:bg-ground hover:text-ink disabled:text-muted-foreground",
        soft: "bg-accent font-semibold text-accent-foreground hover:bg-accent/80 hover:text-accent-foreground",
        ghost: "font-medium text-muted-foreground hover:bg-ground hover:text-ink",
        /* Revocar, dar de baja: se ve rojo pero no grita. El relleno a sangre
           está reservado al bloque de alergias. */
        destructive:
          "border border-alert-ghost-line bg-surface font-semibold text-alert-ink hover:bg-alert-soft hover:text-alert-ink",
      },
      size: {
        default: "h-[52px] px-6 text-base",
        md: "h-12 px-5 text-[15px]",
        sm: "h-11 rounded-lg px-4 text-sm",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
