"use client";

import { useId } from "react";
import { Logotipo } from "@barkandmeow/ui-web/marca";
import s from "./acceso.module.css";

/* La placa del collar: el objeto que escanea quien encuentra al animal, y el
   motivo que ya lleva el logotipo (la placa de salud con la cruz). El número
   de chip se va grabando en su borde a medida que el dueño lo teclea. */

/** 724098100001234 → 724 098 100 001 234. Sin número, los huecos del grabado. */
export function chipGrabado(chip: string) {
  const digitos = chip.replace(/\D/g, "").slice(0, 15);
  const relleno = digitos.padEnd(15, "·");
  return relleno.replace(/(.{3})(?=.)/g, "$1 ");
}

export function Placa({ chip, tamano = 280 }: { chip: string; tamano?: number }) {
  const id = useId().replace(/:/g, "");
  const grabado = chipGrabado(chip);
  // Radio del grabado: el texto rodea el disco por dentro del canto.
  const r = 41;

  return (
    <figure className={s.placa} style={{ width: tamano }} aria-label="Placa del collar">
      <div className={s.placaColgante}>
        <svg viewBox="0 0 100 124" className={s.placaSvg} aria-hidden="true">
          {/* Anilla de la que cuelga del collar */}
          <circle cx="50" cy="9" r="7" className={s.placaAnilla} />
          <rect x="47.5" y="14" width="5" height="9" rx="2.5" className={s.placaEslabon} />
          {/* El disco: blanco ficha, canto en hairline y un filete verde interior */}
          <circle cx="50" cy="74" r="48" className={s.placaDisco} />
          <circle cx="50" cy="74" r="44.5" className={s.placaFilete} />
          {/* El trazado empieza abajo y sube por la izquierda: la cima queda en
              el 50 % y el grabado puede bajar por los dos lados sin cortarse. */}
          <path
            id={`${id}-arco`}
            d={`M 50 ${74 + r} A ${r} ${r} 0 1 1 50 ${74 - r} A ${r} ${r} 0 1 1 50 ${74 + r}`}
            fill="none"
          />
          <text className={s.placaTexto}>
            <textPath href={`#${id}-arco`} startOffset="50%" textAnchor="middle">
              {`BARK & MEOW · ${grabado}`}
            </textPath>
          </text>
        </svg>
        {/* En porcentaje: el símbolo encoge con la placa en el móvil. */}
        <span className={s.placaSimbolo}>
          <Logotipo variante="simbolo" alto={Math.round(tamano * 0.46)} titulo="" />
        </span>
      </div>
      <figcaption className="sr-only">
        {chip ? `Número de chip: ${grabado.replace(/·/g, "")}` : "Aún sin número de chip"}
      </figcaption>
    </figure>
  );
}
