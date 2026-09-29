"use client";

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
import { borrarMensaje, leerBandeja, type MensajeSellado } from "@/lib/api";
import { guardarClave, leerClave } from "@/lib/claves";
import { CRYPTO_WASM_URL } from "@/lib/crypto-url";
import s from "./portal.module.css";

/* La bandeja del dueño: notas de consulta y avisos de nivel 0.

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
  | { tipo: "ilegible" };

type Mensaje = { id: string; petId: string; llegada: string; contenido: Contenido };

function interpretar(claro: Uint8Array): Contenido {
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(new TextDecoder().decode(claro)) as Record<string, unknown>;
  } catch {
    return { tipo: "ilegible" };
  }
  if (j?.version !== 1) return { tipo: "ilegible" };
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
  return { tipo: "ilegible" };
}

function abrirTodos(c: Cripto, secreta: Uint8Array, sellados: MensajeSellado[]): Mensaje[] {
  return sellados.map((m) => {
    let contenido: Contenido = { tipo: "ilegible" };
    const sobre = deBase64(m.sellado);
    if (sobre) {
      try {
        contenido = interpretar(c.abrirSellado(secreta, sobre));
      } catch {
        // Sellado para otra clave o dañado: se enseña como ilegible.
      }
    }
    return { id: m.id, petId: m.petId, llegada: m.llegada, contenido };
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
        consulta y los avisos de una clínica si alguien lleva a tu mascota perdida.
      </p>
    );

  return (
    <ol className={s.bandeja}>
      {estado.mensajes.map((m) => (
        <li key={m.id}>
          <Tarjeta m={m} nombre={nombres[m.petId] || "Tu mascota"} alBorrar={() => alBorrar(m.id)} />
        </li>
      ))}
    </ol>
  );
}

function Tarjeta({ m, nombre, alBorrar }: { m: Mensaje; nombre: string; alBorrar: () => Promise<void> }) {
  const ids = useId();
  const c = m.contenido;
  const aviso = c.tipo === "aviso";

  let titulo: string;
  if (c.tipo === "aviso") titulo = `Una clínica tiene a ${nombre}`;
  else if (c.tipo === "nota") titulo = c.motivo || "Nota de la consulta";
  else titulo = "Mensaje que no se puede abrir";

  return (
    <article className={`${s.mensaje} ${aviso ? s.mensajeAviso : ""}`} aria-labelledby={`${ids}-t`}>
      <header className={s.mensajeCabecera}>
        <span className={s.mensajeTipo}>
          {aviso && <IconAlert size={14} />}
          {c.tipo === "aviso" ? "Aviso" : c.tipo === "nota" ? "Nota de consulta" : "Sin abrir"} · {nombre}
        </span>
        <time className={s.mensajeFecha} dateTime={m.llegada}>
          {cuando(m.llegada)}
        </time>
      </header>
      <h2 id={`${ids}-t`} className={s.mensajeTitulo}>
        {titulo}
      </h2>

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
              Se borra del servidor y no se puede recuperar. Si es una nota de consulta y la
              quieres conservar, guárdala antes por tu cuenta.
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

/** Sin la clave en este navegador: se reconstruye con el código en papel. */
function Recuperar({
  publica,
  alRecuperar,
}: {
  publica: Uint8Array | null;
  alRecuperar: (secreta: Uint8Array) => Promise<void>;
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
        Las notas y los avisos llegan cerrados con tu clave, y solo se abren donde está
        guardada. Escribe el código de recuperación que apuntaste en el alta: la clave se
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
            {comprobando ? "Comprobando…" : "Abrir la bandeja"}
          </Button>
        </div>
      </form>
    </section>
  );
}
