import { existsSync, readFileSync } from "node:fs";
import { esRabia, recortar, type RegistroEntrada } from "./registros.js";

/* Reglas que pone la clínica en un JSON (CONECTOR_REGLAS).

   validez: cuánto dura cada vacuna cuando el programa no guarda la fecha de
   revacunación. Provet no la guarda en la línea de la vacuna, y QVET puede no
   exportarla. Lo decide la clínica según la ficha técnica del producto: el
   conector no inventa plazos, porque lo que se firma es un certificado.
   Sin fecha ni regla, la vacuna viaja como informe, no como certificado.

   qvet: nombres de las columnas de sus exportaciones, si no son los de
   serie. */

export type Reglas = {
  validez?: { patron: string; meses: number }[];
  qvet?: {
    separador?: string;
    codificacion?: string;
    columnas?: Record<string, string[]>;
  };
};

export function leerReglas(ruta: string | undefined): Reglas {
  if (!ruta) return {};
  if (!existsSync(ruta)) throw new Error(`CONECTOR_REGLAS apunta a ${ruta}, que no existe`);
  return JSON.parse(readFileSync(ruta, "utf8")) as Reglas;
}

function sumarMeses(fecha: string, meses: number): string {
  const [a, m, d] = fecha.split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1 + meses, d));
  return f.toISOString().slice(0, 10);
}

/**
 * Una vacuna en el formato de Bark & Meow. Si no hay fecha de revacunación ni
 * regla de validez para el producto, sale como informe: vale de constancia,
 * pero el pasaporte no la cuenta como certificado.
 */
export function vacunaORegistro(v: {
  chip: string;
  fecha: string;
  producto: string;
  enfermedad?: string;
  lote?: string;
  validaHasta?: string | null;
  veterinario?: string;
  reglas: Reglas;
}): RegistroEntrada {
  const producto = recortar(v.producto, 120) || "Vacuna";
  let validaHasta = v.validaHasta && v.validaHasta > v.fecha ? v.validaHasta : undefined;
  if (!validaHasta) {
    const regla = v.reglas.validez?.find((r) => new RegExp(r.patron, "i").test(`${v.producto} ${v.enfermedad ?? ""}`));
    if (regla) validaHasta = sumarMeses(v.fecha, regla.meses);
  }
  const veterinario = recortar(v.veterinario, 120);

  if (!validaHasta)
    return {
      version: 1,
      tipo: "informe",
      chip: v.chip,
      fecha: v.fecha,
      veterinario,
      motivo: recortar(`Vacunación: ${producto}`, 200),
      tratamiento: [v.enfermedad && `Contra: ${v.enfermedad}`, v.lote && `Lote: ${v.lote}`].filter(Boolean).join("\n"),
      observaciones: "El programa de gestión no indica hasta cuándo es válida.",
    };

  return {
    version: 1,
    tipo: "vacuna",
    chip: v.chip,
    fecha: v.fecha,
    veterinario,
    enfermedad: esRabia(v.producto, v.enfermedad) ? "rabia" : "otra",
    nombre: recortar(v.enfermedad, 120),
    producto,
    lote: recortar(v.lote, 60),
    validaHasta,
  };
}
