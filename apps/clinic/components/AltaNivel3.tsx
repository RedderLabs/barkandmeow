"use client";

import Link from "next/link";
import { useEffect, useId, useState, type FormEvent } from "react";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { IconCheck } from "@barkandmeow/ui-web/parts";
import { Button } from "@barkandmeow/ui-web/components/button";
import { Input } from "@barkandmeow/ui-web/components/input";
import { Label } from "@barkandmeow/ui-web/components/label";
import { ErrorApi, estadoAlta, pedirAlta, type Identificador } from "@/lib/api";

/* Alta de nivel 3: la clínica pide acceso permanente a la ficha de un paciente.

   La petición va con la clave pública de la clínica. El servidor devuelve un
   número de seis dígitos que sale de esa clave, de la del dueño y del id de la
   petición; el dueño ve el mismo número en su app. Si alguien se hubiera
   puesto en medio con otra clave, los números no coincidirían. Por eso se
   dicta en voz alta y no se envía por ningún sitio. */

type Estado =
  | { tipo: "nada" }
  | { tipo: "esperando"; requestId: string; sas: string; caduca: string }
  | { tipo: "aprobada" }
  | { tipo: "rechazada" }
  | { tipo: "caducada" }
  | { tipo: "error"; titulo: string; salida: string };

/** Quita espacios, puntos y guiones, como normalizarChip en packages/schema. */
function identificar(entrada: string): Identificador | null {
  const limpio = entrada.trim().replace(/[\s.-]/g, "");
  if (/^\d{15}$/.test(limpio)) return { tipo: "iso", valor: limpio };
  const noIso = limpio.replace(/^noniso:/i, "");
  if (/^[0-9A-F]{9,10}$/i.test(noIso)) return { tipo: "nonISO", valor: `nonISO:${noIso.toUpperCase()}` };
  return null;
}

function errorDe(e: unknown): Estado {
  const estado = e instanceof ErrorApi ? e.estado : 0;
  const motivo = e instanceof ErrorApi ? e.datos.motivo : null;
  if (estado === 401)
    return { tipo: "error", titulo: "No hay sesión de clínica.", salida: "Entra con la cuenta de la clínica para pedir altas." };
  if (motivo === "correo-sin-verificar")
    return { tipo: "error", titulo: "La clínica aún no está activa.", salida: "Confirma el correo del administrador con el código que os enviamos." };
  if (estado === 404)
    return {
      tipo: "error",
      titulo: "Este chip no tiene ficha activa en Bark & Meow.",
      salida: "Si el dueño ya lo registró en su app, actívalo primero con su código.",
    };
  if (estado === 429)
    return { tipo: "error", titulo: "Demasiadas peticiones seguidas.", salida: "Espera un minuto y vuelve a intentarlo." };
  if (estado === 0)
    return { tipo: "error", titulo: "No hay conexión con Bark & Meow.", salida: "Vuelve a intentarlo en un momento." };
  return { tipo: "error", titulo: "No se ha podido pedir el alta.", salida: "Revisa el número y vuelve a intentarlo." };
}

const minutos = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Cada cuánto se pregunta por la respuesta del dueño. */
const SONDEO_MS = 3000;

export function AltaNivel3({ pubKeyClinica }: { pubKeyClinica: string }) {
  const [chip, setChip] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [intentado, setIntentado] = useState(false);
  const [estado, setEstado] = useState<Estado>({ tipo: "nada" });
  const [ahora, setAhora] = useState(() => Date.now());
  const ids = useId();

  const id = identificar(chip);
  const faltaChip = intentado && !id;
  const esperando = estado.tipo === "esperando" ? estado : null;

  // Mientras el número está en pantalla: se pregunta por la respuesta y corre el reloj.
  useEffect(() => {
    if (!esperando) return;
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    const sondeo = setInterval(() => {
      void estadoAlta(esperando.requestId)
        .then((r) => {
          if (r.estado === "approved") setEstado({ tipo: "aprobada" });
          else if (r.estado === "rejected") setEstado({ tipo: "rechazada" });
          else if (r.estado === "expired") setEstado({ tipo: "caducada" });
        })
        // Un fallo de red suelto no cambia nada: el siguiente sondeo lo reintenta.
        .catch(() => undefined);
    }, SONDEO_MS);
    return () => {
      clearInterval(reloj);
      clearInterval(sondeo);
    };
  }, [esperando]);

  async function pedir(ev: FormEvent) {
    ev.preventDefault();
    setIntentado(true);
    if (!id) return;
    setEnviando(true);
    try {
      const r = await pedirAlta(id, pubKeyClinica);
      setAhora(Date.now());
      setEstado({ tipo: "esperando", requestId: r.requestId, sas: r.sas, caduca: r.caduca });
    } catch (e) {
      setEstado(errorDe(e));
    } finally {
      setEnviando(false);
    }
  }

  function otra() {
    setChip("");
    setIntentado(false);
    setEstado({ tipo: "nada" });
    setTimeout(() => document.getElementById(`${ids}-chip`)?.focus(), 0);
  }

  const abierta = estado.tipo === "nada" || estado.tipo === "error";
  const resta = esperando ? new Date(esperando.caduca).getTime() - ahora : 0;

  return (
    <main className={ui.reading}>
      <div className={ui.readingMain}>
        <div>
          <h1 className={ui.pageTitle}>Alta de un paciente</h1>
          <p className={ui.lede}>
            Pide al dueño acceso permanente a la ficha de su mascota. Él lo aprueba desde su
            app comparando un número de seis dígitos con el que verás aquí.
          </p>
        </div>

        <form className={ui.panel} onSubmit={pedir} noValidate>
          <div className={ui.field}>
            <Label htmlFor={`${ids}-chip`}>Número del microchip</Label>
            <Input
              id={`${ids}-chip`}
              className="h-[52px] max-w-[28rem] border-2 border-brand font-mono text-lg tracking-[0.04em] tabular-nums hover:border-brand aria-invalid:border-alert-ink"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              autoFocus
              maxLength={32}
              value={chip}
              disabled={!abierta}
              onChange={(e) => {
                setChip(e.target.value);
                if (estado.tipo === "error") setEstado({ tipo: "nada" });
              }}
              aria-invalid={faltaChip || undefined}
              aria-describedby={`${ids}-chip-ayuda`}
            />
            <span id={`${ids}-chip-ayuda`} className={faltaChip ? ui.fieldError : ui.hint}>
              {faltaChip ? "Un microchip ISO tiene 15 dígitos." : "Léelo con el lector, con el animal delante."}
            </span>
          </div>

          {abierta && (
            <div className={ui.actions}>
              <Button type="submit" disabled={enviando}>
                {enviando ? "Pidiendo…" : "Pedir el alta"}
              </Button>
            </div>
          )}
        </form>

        <div aria-live="polite" className="flex flex-col gap-3">
          {esperando && (
            <section className={ui.panel} aria-labelledby={`${ids}-numero`}>
              <h2 id={`${ids}-numero`} className={ui.panelTitle}>
                Dile este número al dueño
              </h2>
              <p className="font-mono text-5xl font-semibold tracking-[0.18em] tabular-nums">
                {esperando.sas.slice(0, 3)} {esperando.sas.slice(3)}
              </p>
              <p className={ui.panelNote}>
                En su app o en su portal verá la petición de esta clínica con un número. Si es
                el mismo, que apruebe; si no coincide, que la rechace y volved a empezar.
              </p>
              <p className={ui.hint} role="timer">
                {resta > 0 ? `Esperando su respuesta. Caduca en ${minutos(resta)}.` : "Comprobando si ha caducado…"}
              </p>
              <div className={ui.actions}>
                <Button type="button" variant="ghost" size="md" onClick={otra}>
                  Cancelar
                </Button>
              </div>
            </section>
          )}

          {estado.tipo === "aprobada" && (
            <div className={ui.okBlock} role="status">
              <strong>
                <IconCheck /> Alta concedida
              </strong>
              El dueño ha aprobado el acceso. El paciente ya aparece entre los permisos de la
              clínica y el software de gestión puede enviarle informes.
            </div>
          )}

          {estado.tipo === "rechazada" && (
            <div className={ui.alertBlock} role="alert">
              <strong>El dueño ha rechazado la petición.</strong>
              Si fue porque el número no coincidía, no sigáis: pedid el alta de nuevo y
              comparad otra vez.
            </div>
          )}

          {estado.tipo === "caducada" && (
            <div className={ui.pendingBlock} role="status">
              La petición ha caducado sin respuesta. Dura diez minutos; pídela de nuevo cuando
              el dueño tenga su app abierta.
            </div>
          )}

          {estado.tipo === "error" && (
            <div className={ui.alertBlock} role="alert">
              <strong>{estado.titulo}</strong>
              {estado.salida}
            </div>
          )}

          {!abierta && !esperando && (
            <div className={ui.actions}>
              <Button type="button" variant="outline" size="md" onClick={otra}>
                Pedir otra alta
              </Button>
            </div>
          )}
        </div>
      </div>

      <aside className={`${ui.panel} ${ui.readingAside}`}>
        <h2 className={ui.panelTitle}>Para qué sirve el número</h2>
        <p className={ui.panelNote}>
          No es una contraseña y no abre nada. Sale de la clave de la clínica, de la del dueño
          y de esta petición: si alguien se hubiera puesto en medio, el dueño vería otro
          número. Por eso se dice en voz alta.
        </p>
        <p className={ui.panelNote}>
          El dueño puede retirar el acceso cuando quiera. <Link href="/">Ver los permisos de la clínica.</Link>
        </p>
      </aside>
    </main>
  );
}
