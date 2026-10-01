import type { Identificador } from "@barkandmeow/schema";

/** Quita espacios, puntos y guiones, como normalizarChip en packages/schema. */
export function identificar(entrada: string): Identificador | null {
  const limpio = entrada.trim().replace(/[\s.-]/g, "");
  if (/^\d{15}$/.test(limpio)) return { tipo: "iso", valor: limpio };
  const noIso = limpio.replace(/^noniso:/i, "");
  if (/^[0-9A-F]{9,10}$/i.test(noIso)) return { tipo: "nonISO", valor: `nonISO:${noIso.toUpperCase()}` };
  return null;
}

const dd = (n: number) => String(n).padStart(2, "0");

export const dia = (iso: string) => {
  const d = new Date(iso);
  return `${dd(d.getDate())}/${dd(d.getMonth() + 1)}/${d.getFullYear()}`;
};

export const diaHora = (iso: string) => {
  const d = new Date(iso);
  return `${dd(d.getDate())}/${dd(d.getMonth() + 1)} ${dd(d.getHours())}:${dd(d.getMinutes())}`;
};
