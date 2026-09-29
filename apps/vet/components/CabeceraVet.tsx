"use client";

import type { ReactNode } from "react";
import type { Idioma } from "@barkandmeow/i18n";
import { Logotipo } from "@barkandmeow/ui-web/marca";
import { SelectorIdioma } from "./SelectorIdioma";
import s from "./cabecera.module.css";

/* La única cabecera de la web del veterinario: logotipo e insignia de nivel a
   la izquierda, herramientas e idioma a la derecha. Mismo alto, mismo borde y
   el mismo ancho de contenido en /chip, /e y /s. */
export function CabeceraVet({
  insignia,
  herramientas,
  idioma,
  onIdioma,
  etiquetaIdioma,
}: {
  insignia: ReactNode;
  herramientas?: ReactNode;
  idioma: Idioma;
  onIdioma: (i: Idioma) => void;
  etiquetaIdioma: string;
}) {
  return (
    <header className={s.cabecera}>
      <div className={s.marca}>
        <Logotipo alto={40} className={s.logotipo} />
        {insignia}
      </div>
      <div className={s.herramientas}>
        {herramientas}
        <SelectorIdioma idioma={idioma} onCambio={onIdioma} etiqueta={etiquetaIdioma} />
      </div>
    </header>
  );
}

export type Tono = 0 | 1 | 2 | "caducado";

/** Insignia de nivel en mono: el número siempre escrito, el color de apoyo.
    El detalle se cae en teléfonos estrechos antes que el selector de idioma. */
export function Insignia({
  tono,
  detalle,
  children,
}: {
  tono: Tono;
  detalle?: ReactNode;
  children: ReactNode;
}) {
  const cls = tono === "caducado" ? s.nivelCaducado : [s.nivel0, s.nivel1, s.nivel2][tono];
  return (
    <span className={`${s.nivel} ${cls}`}>
      {/* Con detalle, texto y detalle van en una sola pieza: el hueco de la
          insignia es para el icono, no para partir el texto. */}
      {detalle ? (
        <span>
          {children}
          <span className={s.detalle}> · {detalle}</span>
        </span>
      ) : (
        children
      )}
    </span>
  );
}
