"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { toast } from "@barkandmeow/ui-web/components/sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@barkandmeow/ui-web/components/select";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { Button } from "@barkandmeow/ui-web/components/button";
import { Input } from "@barkandmeow/ui-web/components/input";
import { Label } from "@barkandmeow/ui-web/components/label";
import { ErrorApi, invitar } from "@/lib/api";

/* El rol no es un detalle administrativo: decide quién firma un diagnóstico y
   quién custodia la clave. Por eso cada opción explica lo que concede, cosa
   que un <select> nativo no permite. */

const ROLES = [
  {
    valor: "vet",
    nombre: "Veterinario",
    concede: "Busca, carga datos y firma informes",
  },
  {
    valor: "assistant",
    nombre: "Auxiliar",
    concede: "Busca y carga datos. No firma",
  },
  {
    valor: "admin",
    nombre: "Administrador",
    concede: "Gestiona el equipo y custodia la clave de la clínica",
  },
];

export function InvitarForm({ rolInicial = "vet", activa }: { rolInicial?: string; activa: boolean }) {
  const router = useRouter();
  const [rol, setRol] = useState(rolInicial);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const elegido = ROLES.find((r) => r.valor === rol)!;
  const ids = useId();

  async function alEnviar(ev: FormEvent) {
    ev.preventDefault();
    if (nombre.trim().length < 2) return setError("Falta el nombre.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Revisa el correo.");
    setEnviando(true);
    setError(null);
    try {
      await invitar(nombre.trim(), email.trim().toLowerCase(), rol);
      toast("Invitación enviada", {
        description: `${nombre.trim()} recibirá un correo para entrar como ${elegido.nombre.toLowerCase()}.`,
      });
      setNombre("");
      setEmail("");
      router.refresh();
    } catch (e) {
      const motivo = e instanceof ErrorApi ? e.datos.motivo : null;
      setError(
        motivo === "correo-sin-verificar"
          ? "Confirma antes el correo de la clínica."
          : motivo === "envio"
            ? "Se ha creado la invitación, pero el correo no ha salido. Vuelve a intentarlo."
            : "No se ha podido invitar. Revisa los datos y vuelve a intentarlo.",
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={alEnviar} noValidate>
      <div className={ui.field}>
        <Label htmlFor={`${ids}-nombre`}>Nombre y apellidos</Label>
        <Input id={`${ids}-nombre`} type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </div>

      <div className={ui.field}>
        <Label htmlFor={`${ids}-email`}>Correo</Label>
        <Input id={`${ids}-email`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>

      <div className={ui.field}>
        <Label id="rol-label" asChild>
          <span>Rol</span>
        </Label>
        <Select value={rol} onValueChange={setRol}>
          <SelectTrigger
            aria-labelledby="rol-label"
            className="w-full"
          >
            <SelectValue>{elegido.nombre}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => (
              <SelectItem key={r.valor} value={r.valor} className="py-2">
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">{r.nombre}</span>
                  <span className="text-[13px] text-muted-foreground">
                    {r.concede}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <p className={ui.fieldError} role="alert">
          {error}
        </p>
      )}

      <Button type="submit" disabled={enviando || !activa}>
        {enviando ? "Enviando…" : "Enviar invitación"}
      </Button>

      <p className={ui.panelNote}>
        Le llega un enlace por correo. Al aceptar, su navegador genera su propia clave; si
        es administrador, luego le entregas la de la clínica desde esta lista. Los dueños
        no tienen que autorizar nada de nuevo.
      </p>
    </form>
  );
}
