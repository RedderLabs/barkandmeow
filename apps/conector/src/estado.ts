import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/* Estado de la sincronización, en un JSON en la máquina de la clínica.

   - cursores: hasta dónde se leyó cada fuente.
   - enviados: huella → fecha de los registros ya enviados, para no repetir
     ninguno aunque una fuente devuelva otra vez lo mismo.

   No guarda contenido clínico: solo huellas SHA-256 y fechas. Se escribe en
   un temporal y se renombra, para que un corte a medias no lo deje roto. */

export type Estado = {
  version: 1;
  cursores: Record<string, unknown>;
  enviados: Record<string, string>;
};

/** Las huellas se olvidan a los dos años: nada vuelve a leerse tan atrás. */
const OLVIDO_MS = 2 * 365 * 864e5;

export function leerEstado(ruta: string): Estado {
  if (!existsSync(ruta)) return { version: 1, cursores: {}, enviados: {} };
  const e = JSON.parse(readFileSync(ruta, "utf8")) as Estado;
  if (e.version !== 1) throw new Error(`${ruta}: versión de estado desconocida`);
  return { version: 1, cursores: e.cursores ?? {}, enviados: e.enviados ?? {} };
}

export function guardarEstado(ruta: string, e: Estado, ahora = Date.now()) {
  for (const [h, f] of Object.entries(e.enviados)) if (ahora - Date.parse(f) > OLVIDO_MS) delete e.enviados[h];
  mkdirSync(dirname(ruta), { recursive: true });
  const tmp = `${ruta}.tmp`;
  writeFileSync(tmp, JSON.stringify(e, null, 1));
  renameSync(tmp, ruta);
}
