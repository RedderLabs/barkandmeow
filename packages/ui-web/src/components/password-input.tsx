"use client";

import * as React from "react";
import { cn } from "../lib/utils";
import { Input } from "./input";

/* Contraseña con un botón para verla: quien teclea 12 caracteres o más en un
   teléfono se equivoca, y tiene que poder comprobar lo que ha escrito. El
   botón mide 44px dentro del campo de 48 y dice lo que hace, no solo un ojo. */
function PasswordInput({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="relative w-full">
      <Input {...props} type={visible ? "text" : "password"} className={cn("pr-12", className)} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Ocultar la contraseña" : "Mostrar la contraseña"}
        aria-pressed={visible}
        aria-controls={props.id}
        className="absolute top-0.5 right-0.5 grid size-11 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors duration-[120ms] ease-sistema hover:bg-ground hover:text-ink"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
          <circle cx="12" cy="12" r="3" />
          {visible && <path d="M4 4l16 16" />}
        </svg>
      </button>
    </div>
  );
}

export { PasswordInput };
