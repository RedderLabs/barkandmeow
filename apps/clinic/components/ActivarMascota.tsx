"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { IconAlert, IconCheck } from "@barkandmeow/ui-web/parts";
import { Button } from "@barkandmeow/ui-web/components/button";
import { Checkbox } from "@barkandmeow/ui-web/components/checkbox";
import { Input } from "@barkandmeow/ui-web/components/input";
import { Label } from "@barkandmeow/ui-web/components/label";
import { abrirReclamacion, activarMascota, ErrorApi, type Identificador } from "@/lib/api";

/* Activar una mascota en la clínica.

   El chip no es secreto (sale en pasaportes y facturas), así que registrarlo
   no basta: el registro del dueño queda pendiente hasta que una clínica lee
   el chip con el animal delante y teclea el código de activación que el dueño
   lleva en su app. Si el chip ya está activo a nombre de otra persona, desde
   aquí mismo se abre una reclamación de 14 días. */

type Resultado =
  | { tipo: "nada" }
  | { tipo: "activada" }
  | { tipo: "ya-activo" }
  | { tipo: "reclamada"; plazo: string }
  | { tipo: "error"; titulo: string; salida: string };

/** Quita espacios, puntos y guiones, como normalizarChip en packages/schema. */
function identificar(entrada: string): Identificador | null {
  const limpio = entrada.trim().replace(/[\s.-]/g, "");
  if (/^\d{15}$/.test(limpio)) return { tipo: "iso", valor: limpio };
  const noIso = limpio.replace(/^noniso:/i, "");
  if (/^[0-9A-F]{9,10}$/i.test(noIso)) return { tipo: "nonISO", valor: `nonISO:${noIso.toUpperCase()}` };
  return null;
}

const fecha = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

function errorDe(e: unknown): Resultado {
  const estado = e instanceof ErrorApi ? e.estado : 0;
  const motivo = e instanceof ErrorApi ? e.datos.motivo : null;
  if (estado === 401)
    return { tipo: "error", titulo: "No hay sesión de clínica.", salida: "Entra con la cuenta de la clínica para activar mascotas." };
  if (motivo === "correo-sin-verificar")
    return { tipo: "error", titulo: "La clínica aún no está activa.", salida: "Confirma el correo del administrador con el código que os enviamos." };
  if (motivo === "sin-registro")
    return {
      tipo: "error",
      titulo: "Este chip no tiene ningún registro pendiente.",
      salida: "El dueño tiene que registrarlo antes en su app de Bark & Meow; allí verá su código de activación.",
    };
  if (motivo === "codigo-incorrecto")
    return {
      tipo: "error",
      titulo: "El código no corresponde a este chip.",
      salida: "Revísalo en la app del dueño. Si ha caducado, puede pedir uno nuevo desde la app.",
    };
  if (motivo === "ya-reclamado")
    return {
      tipo: "error",
      titulo: "Ya hay una reclamación abierta sobre este chip.",
      salida: "Se resolverá al terminar su plazo. No hace falta abrir otra.",
    };
  if (estado === 0)
    return { tipo: "error", titulo: "No hay conexión con Bark & Meow.", salida: "Vuelve a intentarlo en un momento." };
  return { tipo: "error", titulo: "No se ha podido completar.", salida: "Revisa el número y el código y vuelve a intentarlo." };
}

export function ActivarMascota() {
  const [chip, setChip] = useState("");
  const [codigo, setCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<Resultado>({ tipo: "nada" });
  const [comprobado, setComprobado] = useState(false);
  const [intentado, setIntentado] = useState(false);
  const ids = useId();

  const id = identificar(chip);
  const codigoLimpio = codigo.toUpperCase().replace(/[\s-]/g, "");
  const faltaChip = intentado && !id;
  const faltaCodigo = intentado && codigoLimpio.length !== 8;

  async function activar(ev: FormEvent) {
    ev.preventDefault();
    setIntentado(true);
    if (!id || codigoLimpio.length !== 8) return;
    setEnviando(true);
    try {
      await activarMascota(id, codigoLimpio);
      setResultado({ tipo: "activada" });
    } catch (e) {
      const motivo = e instanceof ErrorApi ? e.datos.motivo : null;
      setResultado(motivo === "ya-activo" ? { tipo: "ya-activo" } : errorDe(e));
    } finally {
      setEnviando(false);
    }
  }

  async function reclamar() {
    if (!id || !comprobado) return;
    setEnviando(true);
    try {
      const r = await abrirReclamacion(id, codigoLimpio);
      setResultado({ tipo: "reclamada", plazo: r.plazo });
    } catch (e) {
      setResultado(errorDe(e));
    } finally {
      setEnviando(false);
    }
  }

  function otra() {
    setChip("");
    setCodigo("");
    setComprobado(false);
    setIntentado(false);
    setResultado({ tipo: "nada" });
    setTimeout(() => document.getElementById(`${ids}-chip`)?.focus(), 0);
  }

  const terminado = resultado.tipo === "activada" || resultado.tipo === "reclamada";

  return (
    <main className={ui.reading}>
      <div className={ui.readingMain}>
        <div>
          <h1 className={ui.pageTitle}>Activar una mascota</h1>
          <p className={ui.lede}>
            Con el animal delante: lee su chip y teclea el código de activación que el dueño
            tiene en su app. Sin las dos cosas, nadie puede quedarse el chip de una mascota
            ajena.
          </p>
        </div>

        <form className={ui.panel} onSubmit={activar} noValidate>
          <div className={ui.field}>
            <Label htmlFor={`${ids}-chip`}>Número del microchip</Label>
            {/* Mismo campo que la consulta del veterinario: 52px, mono, lo
                rellena de golpe un lector Bluetooth. */}
            <Input
              id={`${ids}-chip`}
              className="h-[52px] max-w-[28rem] border-2 border-brand font-mono text-lg tracking-[0.04em] tabular-nums hover:border-brand aria-invalid:border-alert-ink"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              autoFocus
              maxLength={32}
              value={chip}
              disabled={terminado}
              onChange={(e) => {
                setChip(e.target.value);
                if (resultado.tipo !== "nada") setResultado({ tipo: "nada" });
              }}
              aria-invalid={faltaChip || undefined}
              aria-describedby={`${ids}-chip-ayuda`}
            />
            <span id={`${ids}-chip-ayuda`} className={faltaChip ? ui.fieldError : ui.hint}>
              {faltaChip
                ? "Un microchip ISO tiene 15 dígitos."
                : "Léelo con el lector: el número no se copia de ningún papel."}
            </span>
          </div>

          <div className={ui.field}>
            <Label htmlFor={`${ids}-codigo`}>Código de activación del dueño</Label>
            <Input
              id={`${ids}-codigo`}
              className="h-12 max-w-[16rem] font-mono text-lg uppercase tracking-[0.12em]"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={9}
              placeholder="XXXX-XXXX"
              value={codigo}
              disabled={terminado}
              onChange={(e) => {
                setCodigo(e.target.value);
                if (resultado.tipo !== "nada") setResultado({ tipo: "nada" });
              }}
              aria-invalid={faltaCodigo || undefined}
              aria-describedby={`${ids}-codigo-ayuda`}
            />
            <span id={`${ids}-codigo-ayuda`} className={faltaCodigo ? ui.fieldError : ui.hint}>
              {faltaCodigo ? "El código tiene 8 caracteres." : "Lo ve el dueño en su app, junto a la ficha de la mascota."}
            </span>
          </div>

          {!terminado && resultado.tipo !== "ya-activo" && (
            <div className={ui.actions}>
              <Button type="submit" disabled={enviando}>
                {enviando ? "Activando…" : "Activar"}
              </Button>
            </div>
          )}
        </form>

        <div aria-live="polite" className="flex flex-col gap-3">
          {resultado.tipo === "activada" && (
            <div className={ui.okBlock} role="status">
              <strong>
                <IconCheck /> Mascota activada
              </strong>
              El chip ya responde en Bark & Meow a nombre de su dueño. Queda registrado que la
              ha activado esta clínica.
            </div>
          )}

          {resultado.tipo === "reclamada" && (
            <div className={ui.pendingBlock} role="status">
              Reclamación abierta. El registro actual queda congelado y su titular tiene hasta el{" "}
              <strong>{fecha(resultado.plazo)}</strong> para impugnarla. Si no lo hace, el chip
              pasará al dueño que tenéis delante.
            </div>
          )}

          {resultado.tipo === "error" && (
            <div className={ui.alertBlock} role="alert">
              <strong>{resultado.titulo}</strong>
              {resultado.salida}
            </div>
          )}

          {resultado.tipo === "ya-activo" && (
            <section className={`${ui.panel} ${ui.panelWarn}`} aria-labelledby={`${ids}-reclamar`}>
              <h2 id={`${ids}-reclamar`} className={ui.panelTitle}>
                <IconAlert size={20} /> Este chip ya está activo a nombre de otra persona
              </h2>
              <p className={ui.panelNote}>
                Si quien tenéis delante es el dueño real, podéis abrir una reclamación. El
                registro actual queda congelado —deja de mostrar sus teléfonos a quien
                encuentre al animal— y su titular tiene 14 días para impugnarla. Si no lo
                hace, el chip pasa a este dueño.
              </p>
              <Label className={ui.check}>
                <Checkbox checked={comprobado} onCheckedChange={(v) => setComprobado(v === true)} />
                He leído el chip del animal que está aquí y he comprobado la documentación de
                quien lo reclama (pasaporte o registro oficial). La reclamación queda a nombre
                de esta clínica.
              </Label>
              <div className={ui.actions}>
                <Button
                  type="button"
                  variant="destructive"
                  size="md"
                  disabled={!comprobado || enviando}
                  onClick={() => void reclamar()}
                >
                  {enviando ? "Abriendo…" : "Abrir reclamación"}
                </Button>
                <Button type="button" variant="ghost" size="md" onClick={otra}>
                  Cancelar
                </Button>
              </div>
            </section>
          )}

          {terminado && (
            <div className={ui.actions}>
              <Button type="button" variant="outline" size="md" onClick={otra}>
                Activar otra mascota
              </Button>
            </div>
          )}
        </div>
      </div>

      <aside className={`${ui.panel} ${ui.readingAside}`}>
        <h2 className={ui.panelTitle}>Por qué hace falta la clínica</h2>
        <p className={ui.panelNote}>
          El número de chip lo lee cualquier lector y aparece en pasaportes y facturas.
          Registrarlo no da nada: el registro del dueño queda pendiente, no responde a
          ninguna consulta y no reserva el chip hasta que una clínica lo activa con el animal
          delante.
        </p>
        <p className={ui.panelNote}>
          <Link href="/equipo">¿Tu equipo necesita acceso?</Link> Cualquier veterinario o
          auxiliar de la clínica puede activar mascotas.
        </p>
      </aside>
    </main>
  );
}
