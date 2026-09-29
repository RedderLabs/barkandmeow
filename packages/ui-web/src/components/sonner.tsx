"use client";

import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/* Los avisos siguen el modo del sistema operativo, como el resto de la web,
   y se pintan con los tokens reales. La versión anterior apuntaba a
   --popover y --border, que no existen como variables, y salían sin color. */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="system"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--surface)",
          "--normal-text": "var(--ink)",
          "--normal-border": "var(--line)",
          "--border-radius": "var(--r-card)",
          fontFamily: "var(--font-text)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
export { toast } from "sonner";
