"use client";

import Link from "next/link";
import { useEffect, useId, useState, type FormEvent } from "react";
import { cargarCripto, claveDeDueno, deBase64, leerCodigo, type Cripto } from "@barkandmeow/crypto";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { IconAlert, IconKey } from "@barkandmeow/ui-web/parts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@barkandmeow/ui-web/components/alert-dialog";
import { Button } from "@barkandmeow/ui-web/components/button";
import { Input } from "@barkandmeow/ui-web/components/input";
import { Label } from "@barkandmeow/ui-web/components/label";
import { toast } from "@barkandmeow/ui-web/components/sonner";
import { sobreFirmado, type AdjuntoFirmado } from "@barkandmeow/schema";
import {
  borrarMensaje,
  descargarAdjunto,
  leerBandeja,
  type AdjuntoSellado,
  type MensajeSellado,
  type Origen,
} from "@/lib/api";
import { comprobar, resumenRegistro } from "@/lib/pasaporte";
import { guardarClave, leerClave } from "@/lib/claves";
import { CRYPTO_WASM_URL } from "@/lib/crypto-url";
import s from "./portal.module.css";

/* La bandeja del dueño: notas de consulta, avisos de nivel 0 e informes que
   envía el software de gestión de su veterinario habitual.

   Llegan sellados a su clave pública y se abren aquí, con la secreta que
   guarda este navegador. Si no está (otro navegador, datos borrados), el
   código en papel la reconstruye. El servidor nunca ve lo que dicen. */

let criptoCargada: Promise<Cripto> | null = null;
const cripto = () => (criptoCargada ??= cargarCripto(fetch(CRYPTO_WASM_URL)));

const igual = (a: Uint8Array | null, b: Uint8Array | null) =>
  !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/* Lo que escribió el veterinario. Se valida campo a campo: el contenido lo
   firma quien sella, no el servidor, y no se da nada por supuesto. */
type Contenido =
  | {
      tipo: "nota";
      clinica: string;
      motivo: string;
      diagnostico: string;
      tratamiento: string;
      observaciones: string;
    }
  | { tipo: "aviso"; clinica: string; telefono: string; motivo: string }
  | {
      tipo: "informe";
      fecha: string;
      veterinario: string;
      motivo: string;
      diagnostico: string;
      tratamiento: string;
      observaciones: string;
      /** Firmado por la clínica con la clave de su conexión. */
      firmado?: boolean;
      /** Los PDF que la firma cubre: nombre, tamaño y huella de cada uno. */
      adjuntos?: AdjuntoFirmado[];
    }
  /** Vacuna, tratamiento o análisis firmado por la clínica: va al pasaporte. */
  | { tipo: "certificado"; titulo: string; detalle: string; adjuntos?: AdjuntoFirmado[] }
  /** Llegó firmado, pero la firma no es de la clínica que lo envió. */
  | { tipo: "firma-mala" }
  | { tipo: "ilegible" };

type Mensaje = {
  id: string;
  petId: string;
  llegada: string;
  origen: Origen | null;
  contenido: Contenido;
  adjuntos: AdjuntoSellado[];
};

/* Un informe solo cuenta como tal si llegó con clave de API: entonces el
   servidor sabe qué clínica lo envió. Sellado por otra vía (la nota de la web
   del veterinario acepta cualquier sobre), se enseña como nota, sin clínica. */
function interpretar(c: Cripto, claro: Uint8Array, origen: Origen | null): Contenido {
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(new TextDecoder().decode(claro)) as Record<string, unknown>;
  } catch {
    return { tipo: "ilegible" };
  }
  if (j?.version !== 1) return { tipo: "ilegible" };
  if (j.tipo === "firmado") {
    const f = sobreFirmado.safeParse(j);
    if (!f.success) return { tipo: "ilegible" };
    // La firma tiene que ser de la conexión que lo envió, según el servidor.
    const r = comprobar(c, f.data, origen, null);
    if (!r.valido) return { tipo: "firma-mala" };
    if (r.registro.tipo === "informe")
      return {
        tipo: "informe",
        fecha: r.registro.fecha,
        veterinario: r.registro.veterinario,
        motivo: r.registro.motivo,
        diagnostico: r.registro.diagnostico,
        tratamiento: r.registro.tratamiento,
        observaciones: r.registro.observaciones,
        firmado: true,
        adjuntos: r.registro.adjuntos,
      };
    return {
      tipo: "certificado",
      ...resumenRegistro(r.registro),
      adjuntos: r.registro.tipo === "titulacion" ? r.registro.adjuntos : [],
    };
  }
  if (j.tipo === "nota")
    return {
      tipo: "nota",
      clinica: texto(j.clinica),
      motivo: texto(j.motivo),
      diagnostico: texto(j.diagnostico),
      tratamiento: texto(j.tratamiento),
      observaciones: texto(j.observaciones),
    };
  if (j.tipo === "aviso")
    return { tipo: "aviso", clinica: texto(j.clinica), telefono: texto(j.telefono), motivo: texto(j.motivo) };
  if (j.tipo === "informe") {
    const campos = {
      motivo: texto(j.motivo),
      diagnostico: texto(j.diagnostico),
      tratamiento: texto(j.tratamiento),
      observaciones: texto(j.observaciones),
    };
    if (!origen) return { tipo: "nota", clinica: "", ...campos };
    const fecha = texto(j.fecha);
    return {
      tipo: "informe",
      fecha: /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : "",
      veterinario: texto(j.veterinario),
      ...campos,
    };
  }
  return { tipo: "ilegible" };
}

function abrirTodos(c: Cripto, secreta: Uint8Array, sellados: MensajeSellado[]): Mensaje[] {
  return sellados.map((m) => {
    let contenido: Contenido = { tipo: "ilegible" };
    const sobre = deBase64(m.sellado);
    if (sobre) {
      try {
        contenido = interpretar(c, c.abrirSellado(secreta, sobre), m.origen);
      } catch {
        // Sellado para otra clave o dañado: se enseña como ilegible.
      }
    }
    return { id: m.id, petId: m.petId, llegada: m.llegada, origen: m.origen, contenido, adjuntos: m.adjuntos ?? [] };
  });
}

const cuando = (iso: string) => {
  const d = new Date(iso);
  const dd = (n: number) => String(n).padStart(2, "0");
  return `${dd(d.getDate())}/${dd(d.getMonth() + 1)}/${d.getFullYear()} · ${dd(d.getHours())}:${dd(d.getMinutes())}`;
};

type Estado =
  | { tipo: "mirando" }
  | { tipo: "falta" }
  | { tipo: "cargando" }
  | { tipo: "error" }
  | { tipo: "lista"; mensajes: Mensaje[] };

export function Bandeja({
  pubKey,
  nombres,
}: {
  /** La clave pública del dueño (base64), para comprobar la local y la del papel. */
  pubKey: string;
  /** petId → nombre de la mascota. */
  nombres: Record<string, string>;
}) {
  const [estado, setEstado] = useState<Estado>({ tipo: "mirando" });
  const [secreta, setSecreta] = useState<Uint8Array | null>(null);
  const publica = deBase64(pubKey);

  async function cargar(clave: Uint8Array) {
    setEstado({ tipo: "cargando" });
    try {
      const [c, { mensajes }] = await Promise.all([cripto(), leerBandeja()]);
      setEstado({ tipo: "lista", mensajes: abrirTodos(c, clave, mensajes) });
    } catch {
      setEstado({ tipo: "error" });
    }
  }

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const [c, local] = await Promise.all([cripto(), leerClave()]);
      if (!vivo) return;
      if (local && igual(c.publica(local.secreta), publica)) {
        setSecreta(local.secreta);
        await cargar(local.secreta);
      } else setEstado({ tipo: "falta" });
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubKey]);

  async function alRecuperar(clave: Uint8Array) {
    setSecreta(clave);
    await cargar(clave);
  }

  async function alBorrar(id: string) {
    try {
      await borrarMensaje(id);
      setEstado((e) => (e.tipo === "lista" ? { ...e, mensajes: e.mensajes.filter((m) => m.id !== id) } : e));
      toast("Mensaje borrado");
    } catch {
      toast("No se ha podido borrar", { description: "Vuelve a intentarlo en un momento." });
    }
  }

  if (estado.tipo === "mirando" || estado.tipo === "cargando")
    return (
      <p className={ui.panelNote} role="status">
        Abriendo tu bandeja…
      </p>
    );

  if (estado.tipo === "falta") return <Recuperar publica={publica} alRecuperar={alRecuperar} />;

  if (estado.tipo === "error")
    return (
      <div className="flex flex-col gap-3">
        <div className={ui.alertBlock} role="alert">
          No se ha podido cargar la bandeja. Comprueba la conexión y vuelve a intentarlo.
        </div>
        <Button
          type="button"
          variant="outline"
          size="md"
          className="self-start"
          onClick={() => secreta && void cargar(secreta)}
        >
          Reintentar
        </Button>
      </div>
    );

  if (estado.mensajes.length === 0)
    return (
      <p className={ui.panelNote}>
        No tienes mensajes. Aquí llegan las notas que te deja el veterinario después de una
        consulta, los informes de tu clínica habitual y los avisos de una clínica si alguien
        lleva a tu mascota perdida.
      </p>
    );

  return (
    <ol className={s.bandeja}>
      {estado.mensajes.map((m) => (
        <li key={m.id}>
          <Tarjeta m={m} nombre={nombres[m.petId] || "Tu mascota"} secreta={secreta} alBorrar={() => alBorrar(m.id)} />
        </li>
      ))}
    </ol>
  );
}

function Tarjeta({
  m,
  nombre,
  secreta,
  alBorrar,
}: {
  m: Mensaje;
  nombre: string;
  secreta: Uint8Array | null;
  alBorrar: () => Promise<void>;
}) {
  const ids = useId();
  const c = m.contenido;
  const aviso = c.tipo === "aviso";

  let titulo: string;
  if (c.tipo === "aviso") titulo = `Una clínica tiene a ${nombre}`;
  else if (c.tipo === "nota") titulo = c.motivo || "Nota de la consulta";
  else if (c.tipo === "informe") titulo = c.motivo || "Informe de la clínica";
  else if (c.tipo === "certificado") titulo = c.titulo;
  else if (c.tipo === "firma-mala") titulo = "Registro con una firma que no cuadra";
  else titulo = "Mensaje que no se puede abrir";

  const etiqueta = {
    aviso: "Aviso",
    nota: "Nota de consulta",
    informe: "Informe",
    certificado: "Pasaporte",
    "firma-mala": "Sin validar",
    ilegible: "Sin abrir",
  }[c.tipo];

  return (
    <article
      className={`${s.mensaje} ${aviso ? s.mensajeAviso : ""} ${c.tipo === "informe" || c.tipo === "certificado" ? s.mensajeInforme : ""}`}
      aria-labelledby={`${ids}-t`}
    >
      <header className={s.mensajeCabecera}>
        <span className={s.mensajeTipo}>
          {aviso && <IconAlert size={14} />}
          {etiqueta} · {nombre}
        </span>
        <time className={s.mensajeFecha} dateTime={m.llegada}>
          {cuando(m.llegada)}
        </time>
      </header>
      <h2 id={`${ids}-t`} className={s.mensajeTitulo}>
        {titulo}
      </h2>

      {/* El remitente lo pone el servidor por la clave con que llegó el
          mensaje; lo que dice dentro lo escribe la clínica. */}
      {m.origen && (
        <p className={s.mensajeOrigen}>
          Enviado por <strong>{m.origen.clinica}</strong>
          {m.origen.dominio ? ` · ${m.origen.dominio}, dominio verificado` : ` · ${m.origen.pais}`} · desde
          su software de gestión
        </p>
      )}

      {c.tipo === "aviso" && (
        <>
          <p className={s.mensajeTexto}>
            {c.clinica || "Una clínica veterinaria"} ha leído el chip de {nombre} y quiere
            hablar contigo{c.motivo ? `: «${c.motivo}»` : "."}
          </p>
          {c.telefono && (
            <Button asChild size="md" className="self-start">
              <a href={`tel:${c.telefono.replace(/[^\d+]/g, "")}`}>Llamar a la clínica · {c.telefono}</a>
            </Button>
          )}
        </>
      )}

      {c.tipo === "nota" && (
        <dl className={s.nota}>
          {(
            [
              ["Clínica", c.clinica],
              ["Diagnóstico", c.diagnostico],
              ["Tratamiento", c.tratamiento],
              ["Observaciones", c.observaciones],
            ] as const
          )
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className={s.notaFila}>
                <dt className={s.filaEtiqueta}>{k}</dt>
                <dd className={s.notaValor}>{v}</dd>
              </div>
            ))}
        </dl>
      )}

      {c.tipo === "informe" && (
        <dl className={s.nota}>
          {(
            [
              ["Fecha", c.fecha && c.fecha.split("-").reverse().join("/")],
              ["Veterinario", c.veterinario],
              ["Diagnóstico", c.diagnostico],
              ["Tratamiento", c.tratamiento],
              ["Observaciones", c.observaciones],
            ] as const
          )
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className={s.notaFila}>
                <dt className={s.filaEtiqueta}>{k}</dt>
                <dd className={s.notaValor}>{v}</dd>
              </div>
            ))}
        </dl>
      )}

      {c.tipo === "informe" && c.firmado && (
        <p className={s.mensajeOrigen}>Firma de la clínica comprobada en este navegador.</p>
      )}

      {c.tipo === "certificado" && (
        <>
          <p className={s.mensajeTexto}>{c.detalle}</p>
          <p className={s.mensajeOrigen}>
            Firma de la clínica comprobada. Se guarda en el pasaporte de viaje de {nombre} al abrirlo.{" "}
            <Link href={`/mascota/${m.petId}/pasaporte`}>Abrir el pasaporte</Link>
          </p>
        </>
      )}

      {(c.tipo === "informe" || c.tipo === "certificado") && !!c.adjuntos?.length && (
        <Adjuntos mensajeId={m.id} firmados={c.adjuntos} sellados={m.adjuntos} secreta={secreta} />
      )}

      {c.tipo === "firma-mala" && (
        <p className={s.mensajeTexto}>
          Dice venir de tu clínica, pero la firma no es la de su conexión con Bark &amp; Meow. No se
          guarda en el pasaporte. Si esperabas un registro, pregunta a tu clínica.
        </p>
      )}

      {c.tipo === "ilegible" && (
        <p className={s.mensajeTexto}>
          No se ha podido abrir con tu clave. Puede estar dañado o sellado para otra clave.
        </p>
      )}

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="self-end">
            Borrar
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar este mensaje?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borra del servidor y no se puede recuperar. Si es una nota o un informe y lo
              quieres conservar, guárdalo antes por tu cuenta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, volver</AlertDialogCancel>
            <AlertDialogAction onClick={() => void alBorrar()}>Sí, borrar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}

/* ── PDF adjuntos ─────────────────────────────────────────────
   Cada PDF llega sellado aparte. Se descarga, se abre con la clave del dueño
   y, antes de dárselo, se comprueba que su SHA-256 es el que firmó la clínica
   en el registro: si el servidor lo cambiara por otro, no pasaría. */

const tamano = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

async function sha256Hex(b: Uint8Array) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", b as BufferSource));
  return Array.from(h, (x) => x.toString(16).padStart(2, "0")).join("");
}

const esPdf = (b: Uint8Array) => b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;

function Adjuntos({
  mensajeId,
  firmados,
  sellados,
  secreta,
}: {
  mensajeId: string;
  firmados: AdjuntoFirmado[];
  sellados: AdjuntoSellado[];
  secreta: Uint8Array | null;
}) {
  const [abriendo, setAbriendo] = useState<number | null>(null);

  async function descargar(i: number) {
    const firmado = firmados[i];
    const sellado = sellados.find((a) => a.orden === i);
    if (!secreta || !sellado) return;
    setAbriendo(i);
    try {
      const [c, bytes] = await Promise.all([cripto(), descargarAdjunto(mensajeId, sellado.id)]);
      const pdf = c.abrirSellado(secreta, bytes);
      if (!esPdf(pdf) || (await sha256Hex(pdf)) !== firmado.sha256) {
        toast("Este PDF no es el que firmó la clínica", {
          description: "No se ha descargado. Pídele a tu clínica que lo vuelva a enviar.",
        });
        return;
      }
      const url = URL.createObjectURL(new Blob([pdf as BlobPart], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = firmado.nombre.toLowerCase().endsWith(".pdf") ? firmado.nombre : `${firmado.nombre || "informe"}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      toast("No se ha podido abrir el PDF", { description: "Comprueba la conexión y vuelve a intentarlo." });
    } finally {
      setAbriendo(null);
    }
  }

  return (
    <ul className={s.adjuntos} aria-label="Documentos adjuntos">
      {firmados.map((f, i) => {
        const llego = sellados.some((a) => a.orden === i);
        return (
          <li key={f.sha256 + i} className={s.adjunto}>
            <span className={s.adjuntoNombre}>
              {f.nombre || `Documento ${i + 1}`}
              <span className={s.adjuntoPeso}> · PDF · {tamano(f.bytes)}</span>
            </span>
            {llego ? (
              <Button type="button" variant="outline" size="sm" disabled={abriendo !== null} onClick={() => void descargar(i)}>
                {abriendo === i ? "Abriendo…" : "Descargar"}
              </Button>
            ) : (
              <span className={s.adjuntoPeso}>No llegó con el mensaje</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Sin la clave en este navegador: se reconstruye con el código en papel. */
export function Recuperar({
  publica,
  alRecuperar,
  que = "La bandeja",
}: {
  publica: Uint8Array | null;
  alRecuperar: (secreta: Uint8Array) => Promise<void>;
  /** Qué se abre con la clave, para el texto: «La bandeja», «El pasaporte». */
  que?: string;
}) {
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [comprobando, setComprobando] = useState(false);
  const ids = useId();

  async function alEnviar(ev: FormEvent) {
    ev.preventDefault();
    setComprobando(true);
    setError(null);
    const semilla = await leerCodigo(codigo);
    if (!semilla) {
      setError("El código no es válido: revisa cada bloque en el papel.");
      setComprobando(false);
      return;
    }
    const clave = claveDeDueno(await cripto(), semilla);
    if (!igual(clave.publica, publica)) {
      setError("Ese código es válido, pero no es el de esta cuenta.");
      setComprobando(false);
      return;
    }
    await guardarClave(clave.secreta, clave.publica).catch(() => {
      // Sin IndexedDB (navegación privada): se abre igual, solo esta vez.
    });
    await alRecuperar(clave.secreta);
  }

  return (
    <section className={`${ui.panel} ${ui.panelWarn}`} aria-labelledby={`${ids}-titulo`}>
      <h2 id={`${ids}-titulo`} className={ui.panelTitle}>
        <IconKey size={20} /> Este navegador no tiene tu clave
      </h2>
      <p className={ui.panelNote}>
        {que === "La bandeja"
          ? "Las notas, los informes y los avisos llegan cerrados con tu clave, y solo se abren donde está guardada."
          : `${que} se guarda cerrado con tu clave, y solo se abre donde está guardada.`} Escribe el código de recuperación que apuntaste en el alta: la clave se
        reconstruye aquí y no sale de este navegador.
      </p>
      <form className="flex flex-col gap-3" onSubmit={alEnviar} noValidate>
        <div className={ui.field}>
          <Label htmlFor={`${ids}-codigo`}>Código de recuperación</Label>
          <Input
            id={`${ids}-codigo`}
            className="font-mono uppercase tracking-[0.08em]"
            placeholder="XXXX XXXX XXXX XXXX XXXX XXXX XXXX XXXX"
            autoComplete="off"
            spellCheck={false}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            aria-invalid={!!error || undefined}
            aria-describedby={error ? `${ids}-error` : undefined}
          />
        </div>
        {error && (
          <p id={`${ids}-error`} className={ui.fieldError} role="alert">
            {error}
          </p>
        )}
        <div className={ui.actions}>
          <Button type="submit" size="md" disabled={comprobando || !codigo.trim()}>
            {comprobando ? "Comprobando…" : `Abrir ${que.toLowerCase()}`}
          </Button>
        </div>
      </form>
    </section>
  );
}
