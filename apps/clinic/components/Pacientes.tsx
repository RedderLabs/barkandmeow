"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { ETIQUETA_MAX, limpiarEtiqueta } from "@barkandmeow/crypto";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { Button } from "@barkandmeow/ui-web/components/button";
import { Input } from "@barkandmeow/ui-web/components/input";
import s from "@/app/console.module.css";
import { IconPencil, IconSealed, IconSearch } from "@/components/iconos";
import { guardarEtiqueta, quitarEtiqueta, type PacienteConsola } from "@/lib/api";
import { dia } from "@/lib/chip";
import type { Etiquetas } from "@/lib/etiquetas";

/* Los pacientes de la clínica. El servidor solo sabe el final del chip y las
   fechas; el nombre lo escribe la clínica y se cifra en este navegador. */

/** Poner, cambiar o quitar el nombre con el que la clínica conoce a un paciente. */
export function EditorEtiqueta({
  petId,
  actual,
  etiquetas,
  onGuardada,
  onCancelar,
  enfocar = true,
}: {
  petId: string;
  actual: string | null;
  etiquetas: Etiquetas;
  onGuardada: (texto: string | null) => void;
  onCancelar?: () => void;
  /** En el mostrador el foco se queda en el campo de chip, salvo que se pida el nombre. */
  enfocar?: boolean;
}) {
  const [texto, setTexto] = useState(actual ?? "");
  const [guardando, setGuardando] = useState(false);
  const [fallo, setFallo] = useState(false);
  const ids = useId();
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!enfocar) return;
    campo.current?.focus();
    campo.current?.select();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const limpio = limpiarEtiqueta(texto);

  async function enviar(nuevo: string) {
    setGuardando(true);
    setFallo(false);
    try {
      if (nuevo) await guardarEtiqueta(petId, etiquetas.cerrar(petId, nuevo));
      else if (actual) await quitarEtiqueta(petId);
      onGuardada(nuevo || null);
    } catch {
      setFallo(true);
    } finally {
      setGuardando(false);
    }
  }

  function guardar(ev: FormEvent) {
    ev.preventDefault();
    if (limpio === (actual ?? "")) return onCancelar ? onCancelar() : undefined;
    void enviar(limpio);
  }

  return (
    <form className={s.editor} onSubmit={guardar} noValidate>
      <div className={s.editorFila}>
        <Input
          ref={campo}
          id={`${ids}-nombre`}
          className="h-11 min-w-0 flex-1"
          aria-label="Nombre del paciente en la clínica"
          aria-describedby={`${ids}-ayuda`}
          placeholder="Kira, de Ana"
          autoComplete="off"
          maxLength={ETIQUETA_MAX}
          value={texto}
          disabled={guardando}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && onCancelar) onCancelar();
          }}
        />
        <Button type="submit" size="sm" disabled={guardando || (!limpio && !actual)}>
          {guardando ? "Guardando…" : "Guardar"}
        </Button>
        {onCancelar && (
          <Button type="button" variant="ghost" size="sm" disabled={guardando} onClick={onCancelar}>
            Cancelar
          </Button>
        )}
        {actual && (
          <Button type="button" variant="destructive" size="sm" disabled={guardando} onClick={() => void enviar("")}>
            Quitar
          </Button>
        )}
      </div>
      <span id={`${ids}-ayuda`} className={fallo ? ui.fieldError : ui.hint} role={fallo ? "alert" : undefined}>
        {fallo
          ? "No se ha podido guardar. Vuelve a intentarlo."
          : "Solo lo lee vuestra clínica: se cifra en este navegador antes de guardarse."}
      </span>
    </form>
  );
}

/** Para comparar sin tildes ni mayúsculas: «kira» encuentra a «Kíra». */
const plano = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const DIA = 864e5;

export function Pacientes({
  pacientes,
  etiquetas,
  nombreDe,
  onNombre,
  destacado,
  esAdmin,
}: {
  esAdmin: boolean;
  pacientes: PacienteConsola[];
  etiquetas: Etiquetas;
  nombreDe: (p: PacienteConsola) => string | null;
  onNombre: (petId: string, texto: string | null) => void;
  /** El paciente del chip que se acaba de leer. */
  destacado: string | null;
}) {
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  // La hora de abrir la página: basta para contar los días que le quedan a un permiso.
  const [ahora] = useState(() => Date.now());
  const ids = useId();
  const conClave = etiquetas.estado === "con-clave";

  const visibles = useMemo(() => {
    const q = plano(busca.trim());
    if (!q) return pacientes;
    const cifras = q.replace(/\D/g, "");
    return pacientes.filter((p) => {
      const nombre = nombreDe(p);
      return (nombre && plano(nombre).includes(q)) || (cifras && p.chipPista?.includes(cifras));
    });
  }, [busca, pacientes, nombreDe]);

  // El paciente recién leído se lleva a la vista, por si la lista es larga.
  useEffect(() => {
    if (!destacado) return;
    document.getElementById(`paciente-${destacado}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [destacado]);

  return (
    <section aria-labelledby={`${ids}-titulo`}>
      <div className={s.listaCabecera}>
        <h2 id={`${ids}-titulo`} className={s.titulo}>
          Pacientes
        </h2>
        <span className={s.meta}>
          {pacientes.length === 0
            ? "Ninguno todavía"
            : busca.trim()
              ? `${visibles.length} de ${pacientes.length}`
              : `${pacientes.length} con acceso permanente`}
        </span>
        {pacientes.length > 0 && (
          <label className={s.buscador}>
            <span className={s.buscadorIcono}>
              <IconSearch />
            </span>
            <span className="sr-only">Buscar un paciente</span>
            <Input
              className="h-11 pl-10"
              type="search"
              placeholder={conClave ? "Nombre o final del chip" : "Final del chip"}
              autoComplete="off"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </label>
        )}
      </div>

      {etiquetas.estado === "esperando" && pacientes.length > 0 && (
        <p className={s.avisoClave} role="status">
          <IconSealed />
          {esAdmin
            ? "Los nombres de los pacientes van cifrados. Para leerlos y escribirlos aquí, recupera arriba la clave de la clínica con el código en papel."
            : "Los nombres de los pacientes van cifrados. Este navegador podrá leerlos y escribirlos en cuanto un administrador abra la consola: no tienes que hacer nada más."}
        </p>
      )}

      {pacientes.length === 0 ? (
        <div className={s.vacio}>
          <h3 className={s.vacioTitulo}>Todavía no tenéis pacientes</h3>
          <p className={s.vacioTexto}>
            Un paciente es una mascota cuyo dueño os ha dado acceso permanente. Empieza por leer su
            chip arriba: la consola te dice el paso siguiente.
          </p>
        </div>
      ) : visibles.length === 0 ? (
        <div className={s.vacio}>
          <p className={s.vacioTexto}>
            Ningún paciente coincide con «{busca.trim()}». Si lo tenéis delante, lee su chip arriba.
          </p>
        </div>
      ) : (
        <div className={s.tabla} role="table" aria-labelledby={`${ids}-titulo`}>
          <div className={`${s.fila} ${s.filaCabecera}`} role="row">
            <span role="columnheader">Nombre en la clínica</span>
            <span role="columnheader">Chip</span>
            <span role="columnheader">Alta</span>
            <span role="columnheader">Último informe</span>
            <span role="columnheader" className="sr-only">
              Ficha
            </span>
          </div>
          {visibles.map((p) => {
            const nombre = nombreDe(p);
            const dias = p.caduca ? Math.max(0, Math.ceil((new Date(p.caduca).getTime() - ahora) / DIA)) : null;
            return (
              <div
                key={p.petId}
                id={`paciente-${p.petId}`}
                className={`${s.fila} ${destacado === p.petId ? s.filaDestacada : ""}`}
                role="row"
              >
                <div className={s.celdaNombre} role="cell">
                  {editando === p.petId ? (
                    <EditorEtiqueta
                      petId={p.petId}
                      actual={nombre}
                      etiquetas={etiquetas}
                      onCancelar={() => setEditando(null)}
                      onGuardada={(t) => {
                        onNombre(p.petId, t);
                        setEditando(null);
                      }}
                    />
                  ) : etiquetas.estado === "mirando" ? (
                    <span className={s.sinNombre} aria-hidden="true">
                      …
                    </span>
                  ) : conClave ? (
                    <>
                      {nombre ? (
                        <span className={s.nombre}>{nombre}</span>
                      ) : (
                        <span className={s.sinNombre}>
                          {p.etiqueta ? "Nombre que no se puede leer" : "Sin nombre"}
                        </span>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={s.botonNombre}
                        onClick={() => setEditando(p.petId)}
                        aria-label={
                          nombre ? `Cambiar el nombre de ${nombre}` : `Poner nombre al paciente del chip ···${p.chipPista ?? ""}`
                        }
                      >
                        <IconPencil />
                        {nombre ? "Cambiar" : "Poner nombre"}
                      </Button>
                    </>
                  ) : p.etiqueta ? (
                    <span className={s.cifrado}>
                      <IconSealed /> Nombre cifrado
                    </span>
                  ) : (
                    <span className={s.sinNombre}>Sin nombre</span>
                  )}
                </div>
                <span className={s.dato} role="cell" data-etiqueta="Chip">
                  ···{p.chipPista ?? "····"}
                </span>
                <span className={s.dato} role="cell" data-etiqueta="Alta">
                  {dia(p.desde)}
                  {dias !== null && (
                    <span className={`${s.caduca} ${dias <= 7 ? s.caducaPronto : ""}`}>
                      {dias === 0 ? "CADUCA HOY" : `CADUCA EN ${dias} ${dias === 1 ? "DÍA" : "DÍAS"}`}
                    </span>
                  )}
                </span>
                <span className={s.dato} role="cell" data-etiqueta="Último informe">
                  {p.ultimoEnvio ? dia(p.ultimoEnvio) : <span className={s.sinDato}>Ninguno</span>}
                </span>
                <span role="cell" className={s.celdaFicha}>
                  <Button asChild variant="outline" size="sm">
                    <Link
                      href={`/paciente/${p.petId}`}
                      aria-label={`Ver la ficha de salud de ${nombre ?? `el paciente del chip ···${p.chipPista ?? ""}`}`}
                    >
                      Ficha
                    </Link>
                  </Button>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
