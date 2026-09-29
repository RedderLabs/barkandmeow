"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { nuevoCodigo, type CodigoRecuperacion } from "@barkandmeow/crypto";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { Button } from "@barkandmeow/ui-web/components/button";
import { Checkbox } from "@barkandmeow/ui-web/components/checkbox";
import { Input } from "@barkandmeow/ui-web/components/input";
import { Label } from "@barkandmeow/ui-web/components/label";
import { confirmarCodigo, ErrorApi, reenviarCodigo } from "@/lib/api";
import { fecha } from "@/lib/fecha";
import s from "./portal.module.css";

/* ── Código de activación ─────────────────────────────────────
   Se enseña en la clínica, con el animal delante. Grande, en mono, y solo se
   muestra una vez: el servidor guarda su huella, no el código. */

export function CodigoActivacion({
  codigo,
  caduca,
  nombre,
}: {
  codigo: string;
  caduca: string;
  nombre: string;
}) {
  return (
    <div className={s.activacion} role="status">
      <span className={s.activacionEtiqueta}>Código de activación</span>
      <span className={s.activacionCodigo}>{codigo}</span>
      <p className={s.activacionNota}>
        Llévalo a tu clínica veterinaria junto con {nombre || "tu mascota"}: leerán su chip y
        teclearán este código. Hasta entonces el chip no responde en Bark & Meow. Vale hasta el{" "}
        <strong>{fecha(caduca)}</strong>. Apúntalo o hazle una captura: no se puede volver a
        mostrar, aunque sí puedes generar otro.
      </p>
    </div>
  );
}

/* ── Código del correo ────────────────────────────────────── */

export function PasoCodigo({
  correo,
  titulo,
  alTerminar,
  sinMarco = false,
  claseTitulo,
}: {
  correo: string;
  titulo: string;
  alTerminar: () => void;
  /** Dentro de una tarjeta que ya lo enmarca: sin panel propio. */
  sinMarco?: boolean;
  claseTitulo?: string;
}) {
  const [codigo, setCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [destino, setDestino] = useState(correo);
  const [espera, setEspera] = useState(60);
  const ids = useId();

  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  async function comprobar(ev: FormEvent) {
    ev.preventDefault();
    const limpio = codigo.toUpperCase().replace(/[\s-]/g, "");
    if (limpio.length !== 8) return setError("El código tiene 8 caracteres.");
    setEnviando(true);
    setError(null);
    try {
      await confirmarCodigo(limpio);
      alTerminar();
    } catch (e) {
      const d = e instanceof ErrorApi ? e.datos : {};
      setError(
        d.motivo === "incorrecto"
          ? `El código no es correcto. Te quedan ${String(d.intentosRestantes)} intentos.`
          : d.motivo === "caducado"
            ? "El código ha caducado. Pide uno nuevo."
            : d.motivo === "demasiados-intentos"
              ? "Demasiados intentos con este código. Pide uno nuevo."
              : "No se ha podido comprobar. Revisa la conexión y vuelve a intentarlo.",
      );
      setEnviando(false);
    }
  }

  async function otro() {
    setError(null);
    setAviso(null);
    try {
      const r = await reenviarCodigo();
      setDestino(r.correo);
      setAviso("Te hemos enviado un código nuevo. El anterior ya no vale.");
      setCodigo("");
      setEspera(60);
    } catch (e) {
      const d = e instanceof ErrorApi ? e.datos : {};
      if (d.motivo === "espera") setEspera(Number(d.segundos) || 60);
      else if (d.motivo === "caducado") setError("La sesión ha caducado. Vuelve a empezar.");
      else setError("No se ha podido enviar el correo. Vuelve a intentarlo en un momento.");
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={comprobar} noValidate>
      <div>
        {sinMarco ? (
          <h2 className={claseTitulo}>{titulo}</h2>
        ) : (
          <h1 className={ui.pageTitle}>{titulo}</h1>
        )}
        <p className={sinMarco ? "mt-2 text-sm leading-relaxed text-ink-soft" : ui.lede}>
          Te hemos enviado un código de 8 caracteres a <strong>{destino}</strong>. Caduca en 15
          minutos.
        </p>
      </div>
      <div className={sinMarco ? "flex flex-col gap-4" : ui.panel}>
        <div className={ui.field}>
          <Label htmlFor={`${ids}-codigo`}>Código</Label>
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
        {aviso && (
          <p className={ui.hint} role="status">
            {aviso}
          </p>
        )}
        <div className={ui.actions}>
          <Button type="submit" disabled={enviando}>
            {enviando ? "Comprobando…" : "Confirmar"}
          </Button>
          <Button type="button" variant="ghost" size="md" disabled={espera > 0} onClick={() => void otro()}>
            {espera > 0 ? `Pedir otro (${espera} s)` : "Pedir otro código"}
          </Button>
        </div>
      </div>
    </form>
  );
}

/* ── Código de recuperación del dueño ─────────────────────────
   Es su clave: con él se reconstruye en otro navegador. Hay que teclear dos
   bloques para demostrar que está apuntado. */

const normalizarBloque = (x: string) =>
  x.toUpperCase().replace(/\s/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");

/** El código en un .txt para imprimir, con el chip y el nombre para saber de
    qué mascota es. Se genera aquí mismo: no pasa por ningún servidor. */
function descargarCopia(codigo: CodigoRecuperacion, copia: { chip: string; nombre: string }) {
  const nombre = copia.nombre.trim();
  const texto = [
    "Bark & Meow · Código de recuperación",
    "",
    `Mascota: ${nombre || "(sin nombre)"}`,
    `Microchip: ${copia.chip.trim()}`,
    "",
    codigo.bloques.slice(0, 4).join("  "),
    codigo.bloques.slice(4).join("  "),
    "",
    "Es tu clave de dueño: con ella lees las notas que te dejen los veterinarios",
    "y recuperas la cuenta si cambias de teléfono. Nadie más la tiene, ni Bark & Meow.",
    "Imprímelo, guárdalo en casa y borra este archivo del teléfono.",
    "",
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([texto], { type: "text/plain;charset=utf-8" }));
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = `bark-and-meow-codigo-${(nombre || copia.chip)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()}.txt`;
  enlace.click();
  URL.revokeObjectURL(url);
}

export function Recuperacion({
  onCambio,
  faltaPapel,
  sinMarco = false,
  codigoInicial = null,
  copia,
}: {
  onCambio: (estado: { codigo: CodigoRecuperacion | null; confirmado: boolean }) => void;
  faltaPapel: boolean;
  /** Dentro de una tarjeta que ya pone el título: sin panel ni título propios. */
  sinMarco?: boolean;
  /** Si el alta vuelve a este paso, el mismo código: puede que ya esté apuntado. */
  codigoInicial?: CodigoRecuperacion | null;
  /** Con qué mascota va el código en la copia descargable; sin esto, no hay descarga. */
  copia?: { chip: string; nombre: string };
}) {
  const [codigo, setCodigo] = useState<CodigoRecuperacion | null>(null);
  const [pedidos, setPedidos] = useState<[number, number] | null>(null);
  const [confirmacion, setConfirmacion] = useState(["", ""]);
  const [apuntado, setApuntado] = useState(false);
  const ids = useId();

  useEffect(() => {
    void (codigoInicial ? Promise.resolve(codigoInicial) : nuevoCodigo()).then((c) => {
      setCodigo(c);
      const a = crypto.getRandomValues(new Uint32Array(1))[0] % 8;
      const b = (a + 1 + (crypto.getRandomValues(new Uint32Array(1))[0] % 7)) % 8;
      setPedidos(a < b ? [a, b] : [b, a]);
    });
    // Solo al montar: el código no cambia mientras el paso está abierto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirmado =
    !!codigo && !!pedidos && apuntado && pedidos.every((p, i) => normalizarBloque(confirmacion[i]) === codigo.bloques[p]);

  useEffect(() => {
    onCambio({ codigo, confirmado });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigo, confirmado]);

  return (
    <section
      className={sinMarco ? "flex flex-col gap-4" : ui.panel}
      aria-labelledby={sinMarco ? undefined : `${ids}-titulo`}
    >
      {!sinMarco && (
        <h2 id={`${ids}-titulo`} className={ui.panelTitle}>
          Tu código de recuperación
        </h2>
      )}
      <p className={ui.panelNote}>
        Es tu clave de dueño: con ella lees las notas que te dejen los veterinarios. Se genera
        en este teléfono y no sale de aquí. Apúntala en papel y guárdala en casa: si cambias de
        teléfono, la recuperas con este código.
      </p>
      <div className={ui.recovery} aria-live="polite">
        {codigo ? (
          codigo.bloques.map((bloque, i) => (
            <span key={i} className={ui.recoveryCell}>
              <span className="sr-only">Bloque {i + 1}: </span>
              {bloque}
            </span>
          ))
        ) : (
          <span className={ui.recoveryCell} style={{ gridColumn: "1 / -1" }}>
            Generando…
          </span>
        )}
      </div>
      {copia && (
        <Button
          type="button"
          variant="outline"
          size="md"
          className="self-start"
          disabled={!codigo}
          onClick={() => codigo && descargarCopia(codigo, copia)}
        >
          Descargar una copia para imprimir
        </Button>
      )}
      <Label className={ui.check}>
        <Checkbox checked={apuntado} onCheckedChange={(v) => setApuntado(v === true)} />
        {copia ? "Lo he apuntado o impreso." : "Lo he apuntado en papel."}
      </Label>
      {pedidos && (
        <fieldset className={`${ui.field} m-0 min-w-0 border-0 p-0`}>
          <legend className="mb-1.5 text-sm font-medium text-ink">
            Para comprobarlo, escribe dos bloques
          </legend>
          <div className={ui.confirmRow}>
            {pedidos.map((p, i) => (
              <div key={p} className={ui.field}>
                <Label htmlFor={`${ids}-b${i}`}>Bloque {p + 1}</Label>
                <Input
                  id={`${ids}-b${i}`}
                  className="font-mono uppercase tracking-[0.08em]"
                  maxLength={4}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  value={confirmacion[i]}
                  onChange={(e) => setConfirmacion((c) => c.map((v, j) => (j === i ? e.target.value : v)))}
                />
              </div>
            ))}
          </div>
        </fieldset>
      )}
      {faltaPapel && !confirmado && (
        <p className={ui.fieldError} role="alert">
          {!apuntado
            ? "Marca la casilla cuando el código esté apuntado."
            : "Los bloques no coinciden con el código. Revísalos en el papel."}
        </p>
      )}
    </section>
  );
}
