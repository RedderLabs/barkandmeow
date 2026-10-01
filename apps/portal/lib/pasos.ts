import type { Mascota } from "@barkandmeow/schema/api";

/* Lo que hace falta para que la mascota esté protegida, en el orden en que se
   hace. Sale de lo que el servidor sabe sin leer nada: si el chip está
   activo, si hay perfil y teléfono, si hay ficha de salud y placa. Lo usan la
   lista de mascotas (cuánto falta) y el resumen de cada una (qué falta). */

export type Paso = {
  clave: "chip" | "perfil" | "telefono" | "salud" | "placa" | "foto";
  hecho: boolean;
  /** Los opcionales ayudan, pero no cuentan como pendientes. */
  opcional: boolean;
};

export function pasosDe(m: Mascota): Paso[] {
  return [
    { clave: "chip", hecho: m.estado === "activa", opcional: false },
    { clave: "perfil", hecho: m.perfil.publicado, opcional: false },
    { clave: "telefono", hecho: m.perfil.telefonos.length > 0, opcional: false },
    { clave: "salud", hecho: m.ficha, opcional: false },
    { clave: "placa", hecho: m.placa, opcional: true },
    { clave: "foto", hecho: !!m.perfil.foto, opcional: true },
  ];
}

export const faltanDe = (m: Mascota) => pasosDe(m).filter((p) => !p.hecho && !p.opcional).length;

export const enReclamacion = (m: Mascota) => m.estado === "congelada" || m.reclamacion?.rol === "reclamante";

/** Lo siguiente que toca, dicho en una línea para la lista de mascotas. */
export function siguienteDe(m: Mascota): string | null {
  if (enReclamacion(m)) return "Hay una reclamación abierta sobre su chip.";
  const p = pasosDe(m).find((x) => !x.hecho && !x.opcional) ?? pasosDe(m).find((x) => !x.hecho);
  if (!p) return null;
  return {
    chip: "Llévala a tu clínica para activar su chip.",
    perfil: "Publica su perfil para que quien la encuentre vea cómo llamarte.",
    telefono: "Añade un teléfono de contacto.",
    salud: "Escribe su ficha de salud: alergias, medicación y enfermedades.",
    placa: "Prepara la placa de su collar.",
    foto: "Sube una foto reciente.",
  }[p.clave];
}
