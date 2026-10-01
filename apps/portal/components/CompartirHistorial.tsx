"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { renderSVG } from "uqr";
import { fichaLista } from "@barkandmeow/schema";
import { toast } from "@barkandmeow/ui-web/components/sonner";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { Button } from "@barkandmeow/ui-web/components/button";
import { Recuperar } from "@/components/Bandeja";
import { listarEnlaces, retirarEnlace, type Enlace, type Telefono } from "@/lib/api";
import { fecha } from "@/lib/fecha";
import { useFicha } from "@/lib/ficha";
import { compartirHistorial } from "@/lib/historial";
import s from "./portal.module.css";

/* Enseñar el historial a un veterinario durante unas horas (nivel 2).

   El dueño está en la consulta: crea un enlace, el veterinario lo escanea y ve
   la ficha, las vacunas y las notas anteriores en su idioma. Puede dejar la
   nota de la visita, que vuelve cifrada a la bandeja del dueño. El enlace
   caduca solo y se puede retirar antes. */

const DURACIONES: { horas: 24 | 72 | 168; nombre: string; para: string }[] = [
  { horas: 24, nombre: "24 horas", para: "Una consulta" },
  { horas: 72, nombre: "3 días", para: "Un ingreso corto" },
  { horas: 168, nombre: "7 días", para: "Un viaje" },
];

const hora = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export function CompartirHistorial({
  petId,
  nombre,
  pubKey,
  telefonos,
}: {
  petId: string;
  nombre: string;
  pubKey: string;
  telefonos: Telefono[];
}) {
  const ids = useId();
  const { estado, publica, alRecuperar } = useFicha(petId, pubKey, nombre);
  const [horas, setHoras] = useState<24 | 72 | 168>(24);
  const [creando, setCreando] = useState(false);
  const [hecho, setHecho] = useState<{ id: string; url: string; caduca: string; registros: number } | null>(null);
  const [enlaces, setEnlaces] = useState<Enlace[]>([]);
  const llamar = nombre || "tu mascota";

  const recargar = () => listarEnlaces(petId).then((r) => setEnlaces(r.enlaces)).catch(() => {});
  useEffect(() => {
    void recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId]);

  if (estado.tipo === "mirando")
    return (
      <p className={ui.panelNote} role="status">
        Abriendo la ficha…
      </p>
    );
  if (estado.tipo === "falta") return <Recuperar publica={publica} alRecuperar={alRecuperar} que="La ficha" />;
  if (estado.tipo === "error")
    return (
      <div className={ui.alertBlock} role="alert">
        <strong>No se ha podido abrir la ficha.</strong>
        Comprueba la conexión y vuelve a cargar la página.
      </div>
    );

  const { c, secreta, datos } = estado;

  if (!fichaLista(datos))
    return (
      <section className={ui.panel}>
        <h2 className={ui.panelTitle}>Antes, la ficha de salud</h2>
        <p className={ui.bodyNote}>
          Lo que se enseña es la ficha de {llamar}: sus alergias, lo que toma y sus enfermedades.
          Escríbela primero y vuelve aquí.
        </p>
        <Button asChild size="md" className="self-start">
          <Link href={`/mascota/${petId}/salud`}>Escribir la ficha de salud</Link>
        </Button>
      </section>
    );

  async function crear() {
    setCreando(true);
    try {
      setHecho(
        await compartirHistorial(c, secreta, petId, datos, {
          nombre,
          // En la consulta el veterinario tiene que poder llamarte: el primer teléfono del perfil.
          telefono: telefonos[0]?.numero ?? "",
          horas,
        }),
      );
      await recargar();
    } catch {
      toast("No se ha podido crear el enlace", { description: "Vuelve a intentarlo en un momento." });
    } finally {
      setCreando(false);
    }
  }

  async function retirar(id: string) {
    try {
      await retirarEnlace(petId, id);
      if (hecho?.id === id) setHecho(null);
      await recargar();
      toast("Enlace retirado", { description: "Ya no se abre. Lo que alguien vio no se puede borrar." });
    } catch {
      toast("No se ha podido retirar", { description: "Vuelve a intentarlo en un momento." });
    }
  }

  async function copiar() {
    if (!hecho) return;
    try {
      await navigator.clipboard.writeText(hecho.url);
      toast("Enlace copiado");
    } catch {
      toast("No se ha podido copiar", { description: "Selecciónalo y cópialo a mano." });
    }
  }

  return (
    <>
      <section className={ui.panel} aria-labelledby={`${ids}-t`}>
        <h2 id={`${ids}-t`} className={ui.panelTitle}>
          {hecho ? "Enséñale este QR" : "Crear un enlace"}
        </h2>

        {hecho ? (
          <div className={s.qr}>
            {/* El QR se dibuja aquí: el enlace lleva la clave y no sale del navegador. */}
            <div
              className={s.qrImagen}
              role="img"
              aria-label="Código QR del enlace al historial"
              dangerouslySetInnerHTML={{ __html: renderSVG(hecho.url, { border: 2 }) }}
            />
            <div className="flex flex-col gap-3">
              <p className={ui.bodyNote}>
                El veterinario lo escanea con su móvil o abre el enlace en su ordenador. Vale hasta
                el <span className={s.dato}>{fecha(hecho.caduca)}</span> a las{" "}
                <span className={s.dato}>{hora(hecho.caduca)}</span>.
              </p>
              <div className={ui.copyBlock}>
                <code className="select-all">{hecho.url}</code>
              </div>
              <p className={ui.panelNote}>
                Lleva la ficha de salud
                {hecho.registros > 0
                  ? ` y ${hecho.registros === 1 ? "un registro" : `${hecho.registros} registros`} de vacunas, tratamientos y notas.`
                  : "."}{" "}
                Guárdalo ahora: la clave va en el propio enlace y no se puede volver a mostrar.
              </p>
              <div className={ui.actions}>
                <Button type="button" size="md" onClick={() => void copiar()}>
                  Copiar el enlace
                </Button>
                <Button type="button" variant="outline" size="md" onClick={() => setHecho(null)}>
                  Hecho
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <fieldset className={s.grupo}>
              <legend className={s.grupoEtiqueta}>Cuánto tiempo vale</legend>
              <div className={`${s.opciones} ${s.opciones3}`}>
                {DURACIONES.map((d) => (
                  <label key={d.horas} className={`${s.opcion} ${s.opcionDoble}`}>
                    <input
                      type="radio"
                      name={`${ids}-horas`}
                      className="sr-only"
                      checked={horas === d.horas}
                      onChange={() => setHoras(d.horas)}
                    />
                    <span className={s.opcionDato}>{d.nombre}</span>
                    <span className={s.opcionNota}>{d.para}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className={ui.actions}>
              <Button type="button" disabled={creando} onClick={() => void crear()}>
                {creando ? "Creando…" : "Crear el enlace"}
              </Button>
            </div>
          </>
        )}
      </section>

      {enlaces.length > 0 && (
        <section className={ui.panel} aria-labelledby={`${ids}-vivos`}>
          <h2 id={`${ids}-vivos`} className={ui.panelTitle}>
            Enlaces que siguen abiertos
          </h2>
          <p className={ui.panelNote}>
            Los de esta página y los del pasaporte de viaje. Retirar uno lo cierra al momento.
          </p>
          <ul className={s.registros}>
            {enlaces.map((e) => (
              <li key={e.id} className={s.registro}>
                <div className={s.registroTexto}>
                  <span className={s.pasoTitulo}>
                    Creado el <span className={s.dato}>{fecha(e.creado)}</span>
                  </span>
                  <span className={s.pasoDetalle}>
                    Vale hasta el <span className={s.dato}>{fecha(e.caduca)}</span> a las{" "}
                    <span className={s.dato}>{hora(e.caduca)}</span>
                  </span>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => void retirar(e.id)}>
                  Retirar
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
