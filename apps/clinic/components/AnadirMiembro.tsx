"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import type { Rol } from "@barkandmeow/schema";
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
import { anadirMiembro, ErrorApi } from "@/lib/api";

/* El rol no es un detalle administrativo: decide quién firma un diagnóstico y
   quién custodia la clave. Por eso cada opción explica lo que concede, cosa
   que un <select> nativo no permite. */

const ROLES: { valor: Rol; nombre: string; concede: string }[] = [
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

export function AnadirMiembro({ rolInicial = "vet", activa }: { rolInicial?: Rol; activa: boolean }) {
  const router = useRouter();
  const [rol, setRol] = useState<Rol>(rolInicial);
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
      await anadirMiembro(nombre.trim(), email.trim().toLowerCase(), rol);
      toast(`${nombre.trim()} ya está en el equipo`, {
        description: `Le llega un correo para elegir su contraseña y entrar como ${elegido.nombre.toLowerCase()}.`,
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
            ? "Está en el equipo, pero el correo para elegir su contraseña no ha salido. Dale de baja y vuelve a añadirle."
            : motivo === "correo-en-uso"
              ? "Ese correo ya tiene cuenta en Bark & Meow."
              : motivo === "tope-diario"
                ? "Habéis añadido a mucha gente hoy. Seguid mañana."
                : "No se ha podido añadir. Revisa los datos y vuelve a intentarlo.",
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
        <Select value={rol} onValueChange={(v) => setRol(v as Rol)}>
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
        {enviando ? "Añadiendo…" : "Añadir al equipo"}
      </Button>

      <p className={ui.panelNote}>
        Queda en el equipo al momento. Le llega un correo para elegir su contraseña: así solo
        esa persona la conoce. Desde que entra ve los pacientes y sus nombres.
      </p>
    </form>
  );
}
