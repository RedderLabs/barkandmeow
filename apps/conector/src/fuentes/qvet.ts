import { mkdirSync, readdirSync, readFileSync, renameSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { decodificar, leerCsv, normalizarCabecera } from "../csv.js";
import { vacunaORegistro, type Reglas } from "../reglas.js";
import { limpiarChip, recortar, type Hallazgo } from "../registros.js";
import type { Fuente, Lectura } from "../sincronizar.js";

/* QVET no tiene API pública. Lo realista es su exportación de listados: desde
   un listado de vacunas o de consultas, «Exportar» a Excel o CSV, guardado en
   una carpeta que el conector vigila (QVET_CARPETA). Sirve con cualquier
   versión de QVET y no toca su base de datos.

   Leer la base de QVET (SQL Server) en solo lectura sería automático, pero su
   estructura no está publicada, cambia con las actualizaciones y acceder a
   ella puede chocar con el contrato de soporte: queda descartado.

   - Solo CSV. Un .xlsx se guarda como «CSV (delimitado por punto y coma)»
     desde Excel; el conector avisa de los .xlsx que encuentre y los deja.
   - Qué es cada archivo lo dicen sus columnas: si tiene columna de vacuna es
     de vacunas; si no, de consultas.
   - Los nombres de columna de serie son los habituales en español; si los de
     la clínica son otros, se ponen en reglas.qvet.columnas.
   - Un archivo se lee cuando lleva un minuto sin cambiar (que QVET haya
     terminado de escribirlo). Al confirmar la vuelta, pasa a «procesados»;
     si no se entiende, a «errores». */

const COLUMNAS: Record<string, string[]> = {
  fecha: ["fecha", "fecha vacunacion", "fecha aplicacion", "f aplicacion", "fecha consulta", "fecha visita"],
  chip: ["microchip", "chip", "n chip", "num chip", "numero chip", "identificacion", "n identificacion"],
  vacuna: ["vacuna", "producto", "articulo", "nombre vacuna"],
  enfermedad: ["enfermedad", "tipo vacuna", "contra"],
  lote: ["lote", "n lote", "num lote"],
  proxima: ["proxima", "proxima vacunacion", "fecha revacunacion", "revacunacion", "valida hasta", "caducidad vacuna"],
  veterinario: ["veterinario", "profesional", "facultativo", "usuario"],
  motivo: ["motivo", "motivo consulta", "motivo visita", "concepto"],
  diagnostico: ["diagnostico", "diagnosticos", "juicio clinico"],
  tratamiento: ["tratamiento", "tratamientos", "medicacion"],
  observaciones: ["observaciones", "anamnesis", "exploracion", "notas", "comentarios", "evolucion"],
};

export type ConfigQvet = { carpeta: string; reglas: Reglas; quietoMs?: number };

/** dd/mm/aaaa, dd-mm-aa o aaaa-mm-dd (con o sin hora) → AAAA-MM-DD. */
export function fechaQvet(s: string | undefined): string | null {
  const t = (s ?? "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(t);
  if (!m) return null;
  const a = m[3].length === 2 ? `20${m[3]}` : m[3];
  const f = `${a}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return Number.isNaN(Date.parse(f)) ? null : f;
}

export class FuenteQvet implements Fuente {
  readonly nombre = "qvet";
  private readonly columnas: Record<string, string[]>;

  constructor(
    private readonly c: ConfigQvet,
    private readonly ahora: () => number = Date.now,
  ) {
    const propias = c.reglas.qvet?.columnas ?? {};
    this.columnas = Object.fromEntries(
      Object.entries(COLUMNAS).map(([k, v]) => [k, [...(propias[k] ?? []), ...v].map(normalizarCabecera)]),
    );
  }

  /** Lee un CSV exportado. Devuelve sus registros o lanza si no se entiende. */
  leerArchivo(ruta: string): Hallazgo[] {
    const q = this.c.reglas.qvet ?? {};
    const filas = leerCsv(decodificar(readFileSync(ruta), q.codificacion), q.separador);
    if (filas.length < 2) return [];
    const cab = filas[0].map(normalizarCabecera);
    const col = (k: string) => {
      for (const nombre of this.columnas[k]) {
        const i = cab.indexOf(nombre);
        if (i >= 0) return i;
      }
      return -1;
    };
    const i = Object.fromEntries(Object.keys(COLUMNAS).map((k) => [k, col(k)]));
    if (i.fecha < 0 || i.chip < 0) throw new Error("no tiene columnas de fecha y de chip");
    const esVacunas = i.vacuna >= 0;
    const nombre = basename(ruta);

    const fuera: Hallazgo[] = [];
    filas.slice(1).forEach((f, n) => {
      const v = (k: string) => (i[k] >= 0 ? (f[i[k]] ?? "").trim() : "");
      const fecha = fechaQvet(v("fecha"));
      if (!fecha) return;
      const ref = `qvet:${nombre}:${n + 2}`;
      const chip = limpiarChip(v("chip"));
      if (esVacunas)
        fuera.push({
          ref,
          registro: vacunaORegistro({
            chip,
            fecha,
            producto: v("vacuna"),
            enfermedad: v("enfermedad") || undefined,
            lote: v("lote"),
            validaHasta: fechaQvet(v("proxima")),
            veterinario: v("veterinario"),
            reglas: this.c.reglas,
          }),
        });
      else if (v("motivo") || v("diagnostico") || v("tratamiento") || v("observaciones"))
        fuera.push({
          ref,
          registro: {
            version: 1,
            tipo: "informe",
            chip,
            fecha,
            veterinario: recortar(v("veterinario"), 120),
            motivo: recortar(v("motivo"), 200),
            diagnostico: recortar(v("diagnostico"), 4000),
            tratamiento: recortar(v("tratamiento"), 4000),
            observaciones: recortar(v("observaciones"), 8000),
          },
        });
    });
    return fuera;
  }

  private mover(ruta: string, sub: "procesados" | "errores") {
    const dir = join(this.c.carpeta, sub);
    mkdirSync(dir, { recursive: true });
    const sello = new Date(this.ahora()).toISOString().replace(/[:.]/g, "-");
    renameSync(ruta, join(dir, `${sello}_${basename(ruta)}`));
  }

  async leer(): Promise<Lectura> {
    const quieto = this.c.quietoMs ?? 60_000;
    const hallazgos: Hallazgo[] = [];
    const leidos: string[] = [];
    for (const nombre of readdirSync(this.c.carpeta).sort()) {
      const ruta = join(this.c.carpeta, nombre);
      const st = statSync(ruta);
      if (!st.isFile()) continue;
      if (/\.xlsx?$/i.test(nombre)) {
        console.warn(`[qvet] ${nombre}: guárdalo como CSV (punto y coma) para que se lea`);
        continue;
      }
      if (!/\.csv$/i.test(nombre) || this.ahora() - st.mtimeMs < quieto) continue;
      try {
        hallazgos.push(...this.leerArchivo(ruta));
        leidos.push(ruta);
      } catch (e) {
        console.warn(`[qvet] ${nombre}: ${(e as Error).message}; se aparta a «errores»`);
        this.mover(ruta, "errores");
      }
    }
    return {
      hallazgos,
      cursor: null,
      confirmar: () => leidos.forEach((r) => this.mover(r, "procesados")),
    };
  }
}
