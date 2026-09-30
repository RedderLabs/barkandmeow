import { createHash } from "node:crypto";
import type { z } from "zod";
import { registroClinico, type RegistroClinico } from "@barkandmeow/schema";

/* Lo que cada fuente entrega: un registro en el formato de Bark & Meow, sin
   validar todavía, y de dónde salió para poder decirlo en el registro. */

export type RegistroEntrada = z.input<typeof registroClinico>;

export type Hallazgo = {
  /** «ezyvet:consult:123», «provet:medicine:77», «qvet:vacunas-0930.csv:4». */
  ref: string;
  registro: RegistroEntrada;
};

/** Sin espacios, puntos ni guiones: como lo pide el registro y como lo busca la API. */
export const limpiarChip = (s: string | null | undefined) => (s ?? "").replace(/[\s.\-]/g, "");

export const chipValido = (s: string) => /^[0-9A-Za-z]{6,23}$/.test(s);

/** AAAA-MM-DD en la zona de la clínica. */
export function fechaDe(d: Date, zona = zonaClinica()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function horaDe(d: Date, zona = zonaClinica()): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: zona, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

export const zonaClinica = () => process.env.CONECTOR_ZONA || Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Recorta a `max` caracteres sin partir el texto en silencio. */
export function recortar(s: string | null | undefined, max: number): string {
  const t = (s ?? "").trim();
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + "…";
}

/** La rabia es la que decide un viaje: se reconoce por el nombre del producto o de la enfermedad. */
export function esRabia(...textos: (string | null | undefined)[]): boolean {
  const patron = new RegExp(process.env.CONECTOR_PATRON_RABIA || "rabi|rage|tollwut|raiva", "i");
  return textos.some((t) => !!t && patron.test(t));
}

/** Tope del registro firmado (sobreFirmado.registro): 16 KiB. Se deja margen para la firma. */
const REGISTRO_MAX = 15 * 1024;

/**
 * Valida con el esquema de Bark & Meow y ajusta el tamaño: si el informe no
 * cabe, se acortan las observaciones, que es lo menos importante.
 */
export function prepararRegistro(
  entrada: RegistroEntrada,
): { ok: true; registro: RegistroClinico } | { ok: false; error: string } {
  const r = registroClinico.safeParse(entrada);
  if (!r.success)
    return { ok: false, error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  const registro = r.data;
  if (registro.tipo === "informe") {
    while (Buffer.byteLength(JSON.stringify(registro)) > REGISTRO_MAX && registro.observaciones.length > 0)
      registro.observaciones = recortar(registro.observaciones, Math.floor(registro.observaciones.length * 0.8));
    while (Buffer.byteLength(JSON.stringify(registro)) > REGISTRO_MAX && registro.tratamiento.length > 0)
      registro.tratamiento = recortar(registro.tratamiento, Math.floor(registro.tratamiento.length * 0.8));
  }
  if (Buffer.byteLength(JSON.stringify(registro)) > REGISTRO_MAX) return { ok: false, error: "no cabe en 16 KiB" };
  return { ok: true, registro };
}

/** JSON con las claves ordenadas: el mismo registro da siempre la misma huella. */
function estable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(estable).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${estable((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v);
}

/** Huella de un registro: si ya se envió igual, no se repite. */
export const huella = (r: RegistroClinico) => createHash("sha256").update(estable(r)).digest("hex");
