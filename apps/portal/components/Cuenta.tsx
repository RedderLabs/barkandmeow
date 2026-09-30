"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { Button } from "@barkandmeow/ui-web/components/button";
import { Input } from "@barkandmeow/ui-web/components/input";
import { Label } from "@barkandmeow/ui-web/components/label";
import { toast } from "@barkandmeow/ui-web/components/sonner";
import {
  confirmarTelefono,
  elegirSegundoFactor,
  ErrorApi,
  ponerTelefono,
  quitarTelefono,
  type Canal,
} from "@/lib/api";

/* El código de entrada: por correo o por SMS. El teléfono solo sirve para
   eso; no sale en el perfil público ni lo ve ninguna clínica. Hasta que se
   confirma con un código, el correo sigue siendo el canal. */

type Telefono = { numero: string; verificado: boolean } | null;

const mensajeError = (e: unknown) => {
  const d = e instanceof ErrorApi ? e.datos : {};
  if (d.motivo === "telefono") return "Escribe el número con el prefijo del país, por ejemplo +34 612 345 678.";
  if (d.motivo === "espera") return `Espera ${String(d.segundos)} segundos antes de pedir otro SMS.`;
  if (d.motivo === "sin-cupo-sms") return "Has pedido demasiados SMS hoy. Vuelve a probar mañana.";
  if (d.motivo === "incorrecto") return `El código no es correcto. Te quedan ${String(d.intentosRestantes)} intentos.`;
  if (d.motivo === "caducado") return "El código ha caducado. Pide otro SMS.";
  if (d.motivo === "demasiados-intentos") return "Demasiados intentos. Pide otro SMS.";
  if (d.motivo === "envio") return "No se ha podido enviar el SMS. Vuelve a intentarlo en un momento.";
  return "No hay conexión con Bark & Meow. Vuelve a intentarlo.";
};

export function SegundoFactor({ canal, telefono }: { canal: Canal; telefono: Telefono }) {
  const router = useRouter();
  const ids = useId();
  const [numero, setNumero] = useState("");
  const [codigo, setCodigo] = useState("");
  // El SMS enviado y sin confirmar: el paso del código.
  const [esperando, setEsperando] = useState<string | null>(telefono && !telefono.verificado ? telefono.numero : null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const r = await ponerTelefono(numero);
      setEsperando(r.telefono);
      setCodigo("");
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setEnviando(false);
    }
  }

  async function confirmar(ev: FormEvent) {
    ev.preventDefault();
    const limpio = codigo.toUpperCase().replace(/[\s-]/g, "");
    if (limpio.length !== 8) return setError("El código tiene 8 caracteres.");
    setEnviando(true);
    setError(null);
    try {
      await confirmarTelefono(limpio);
      toast("Teléfono confirmado", { description: "A partir de ahora el código de entrada te llega por SMS." });
      setEsperando(null);
      router.refresh();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setEnviando(false);
    }
  }

  async function cambiarCanal(c: Canal) {
    try {
      await elegirSegundoFactor(c);
      router.refresh();
    } catch {
      toast("No se ha podido cambiar", { description: "Vuelve a intentarlo en un momento." });
    }
  }

  async function quitar() {
    try {
      await quitarTelefono();
      setEsperando(null);
      toast("Teléfono quitado", { description: "El código de entrada te llegará por correo." });
      router.refresh();
    } catch {
      toast("No se ha podido quitar", { description: "Vuelve a intentarlo en un momento." });
    }
  }

  const confirmado = telefono?.verificado ? telefono.numero : null;

  return (
    <div className="flex flex-col gap-4">
      <p className={ui.panelNote}>
        Ahora el código de entrada te llega{" "}
        <strong>{canal === "sms" && confirmado ? `por SMS al ${confirmado}` : "por correo"}</strong>.
      </p>

      {confirmado && !esperando && (
        <div className={ui.actions}>
          {canal === "sms" ? (
            <Button type="button" variant="outline" size="md" onClick={() => void cambiarCanal("correo")}>
              Recibirlo por correo
            </Button>
          ) : (
            <Button type="button" size="md" onClick={() => void cambiarCanal("sms")}>
              Recibirlo por SMS
            </Button>
          )}
          <Button type="button" variant="ghost" size="md" onClick={() => void quitar()}>
            Quitar el teléfono
          </Button>
        </div>
      )}

      {esperando ? (
        <form className="flex flex-col gap-4" onSubmit={confirmar} noValidate>
          <div className={ui.field}>
            <Label htmlFor={`${ids}-codigo`}>Código del SMS enviado al {esperando}</Label>
            <Input
              id={`${ids}-codigo`}
              className="h-[52px] max-w-[16rem] font-mono text-lg uppercase tracking-[0.12em]"
              autoComplete="one-time-code"
              autoCapitalize="characters"
              spellCheck={false}
              autoFocus
              maxLength={9}
              placeholder="XXXX-XXXX"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              aria-describedby={error ? `${ids}-error` : undefined}
            />
          </div>
          {error && (
            <p id={`${ids}-error`} className={ui.fieldError} role="alert">
              {error}
            </p>
          )}
          <div className={ui.actions}>
            <Button type="submit" disabled={enviando}>
              {enviando ? "Comprobando…" : "Confirmar el teléfono"}
            </Button>
            <Button type="button" variant="ghost" size="md" onClick={() => setEsperando(null)}>
              Usar otro número
            </Button>
          </div>
        </form>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={enviar} noValidate>
          <div className={ui.field}>
            <Label htmlFor={`${ids}-telefono`}>{confirmado ? "Cambiar de teléfono" : "Tu móvil"}</Label>
            <Input
              id={`${ids}-telefono`}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              className="max-w-[20rem]"
              placeholder="+34 612 345 678"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              aria-describedby={error ? `${ids}-error` : `${ids}-nota`}
            />
            <p id={`${ids}-nota`} className={ui.hint}>
              Te enviaremos un SMS con un código para confirmarlo. Solo sirve para entrar: no sale en el
              perfil público de tu mascota.
            </p>
          </div>
          {error && (
            <p id={`${ids}-error`} className={ui.fieldError} role="alert">
              {error}
            </p>
          )}
          <Button type="submit" size="md" className="self-start" disabled={enviando || numero.trim().length < 8}>
            {enviando ? "Enviando…" : "Enviar el SMS"}
          </Button>
        </form>
      )}
    </div>
  );
}
