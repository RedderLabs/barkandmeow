"use client";

import { useActionState, useId } from "react";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { Button } from "@barkandmeow/ui-web/components/button";
import { Label } from "@barkandmeow/ui-web/components/label";
import { PasswordInput } from "@barkandmeow/ui-web/components/password-input";
import { entrar } from "@/app/acciones";

export function Entrar() {
  const [estado, accion, enviando] = useActionState(entrar, null);
  const ids = useId();
  const error = estado && "error" in estado ? estado.error : null;
  return (
    <form action={accion} className={`${ui.panel} flex max-w-md flex-col gap-4`} noValidate>
      <div className={ui.field}>
        <Label htmlFor={`${ids}-token`}>Token del operador</Label>
        <PasswordInput
          id={`${ids}-token`}
          name="token"
          autoComplete="off"
          autoFocus
          aria-describedby={error ? `${ids}-error` : `${ids}-nota`}
        />
        <p id={`${ids}-nota`} className={ui.hint}>
          El valor de OPS_TOKEN del API. Queda 12 horas en una cookie de este panel.
        </p>
      </div>
      {error && (
        <p id={`${ids}-error`} className={ui.fieldError} role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={enviando} className="self-start">
        {enviando ? "Comprobando…" : "Entrar"}
      </Button>
    </form>
  );
}
