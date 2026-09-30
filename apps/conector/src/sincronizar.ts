import type { ClienteBM, Paciente } from "./barkandmeow.js";
import { guardarEstado, type Estado } from "./estado.js";
import { chipValido, huella, prepararRegistro, type Hallazgo } from "./registros.js";

/* Una vuelta de sincronización.

   Cada fuente devuelve lo nuevo desde su cursor. Por cada registro: se valida,
   se descarta si ya se envió igual, se busca al paciente entre los que dieron
   el nivel 3 a la clínica y, si está, se firma, se sella y se envía. Los que
   no dieron el nivel 3 se saltan y quedan en el registro de actividad, sin
   datos clínicos: solo la referencia de la fuente y los 4 últimos del chip.

   El cursor de una fuente solo avanza si la vuelta terminó sin fallos de red
   o de la API. Si no, la siguiente vuelta relee desde el mismo punto y las
   huellas evitan enviar dos veces lo que sí salió. */

export type Lectura = {
  hallazgos: Hallazgo[];
  /** El cursor que queda si todo sale bien. */
  cursor: unknown;
  /** Lo que hay que hacer al confirmar (QVET mueve los archivos procesados). */
  confirmar?: () => Promise<void> | void;
};

export interface Fuente {
  readonly nombre: string;
  leer(cursor: unknown): Promise<Lectura>;
}

export type Registro = (nivel: "info" | "aviso" | "error", mensaje: string, datos?: Record<string, unknown>) => void;

export type Resumen = {
  fuente: string;
  leidos: number;
  enviados: number;
  repetidos: number;
  sinPermiso: number;
  invalidos: number;
  fallo: string | null;
};

const pista = (chip: string) => `…${chip.slice(-4)}`;

export async function sincronizar(o: {
  fuentes: Fuente[];
  bm: ClienteBM;
  estado: Estado;
  rutaEstado: string;
  /** Nombre de la clínica para los registros que no lo traen. */
  clinica: string;
  log: Registro;
}): Promise<Resumen[]> {
  const resumenes: Resumen[] = [];
  // Una búsqueda por chip y vuelta: el permiso no cambia en unos segundos.
  const pacientes = new Map<string, Paciente | null>();

  for (const f of o.fuentes) {
    const r: Resumen = { fuente: f.nombre, leidos: 0, enviados: 0, repetidos: 0, sinPermiso: 0, invalidos: 0, fallo: null };
    resumenes.push(r);

    let lectura: Lectura;
    try {
      lectura = await f.leer(o.estado.cursores[f.nombre]);
    } catch (e) {
      r.fallo = (e as Error).message;
      o.log("error", `${f.nombre}: no se pudo leer`, { error: r.fallo });
      continue;
    }
    r.leidos = lectura.hallazgos.length;

    for (const h of lectura.hallazgos) {
      const p = prepararRegistro({ ...h.registro, clinica: h.registro.clinica || o.clinica });
      if (!p.ok) {
        r.invalidos++;
        o.log("aviso", `${h.ref}: registro no válido, no se envía`, { error: p.error });
        continue;
      }
      const reg = p.registro;
      const id = huella(reg);
      if (o.estado.enviados[id]) {
        r.repetidos++;
        continue;
      }
      if (!reg.chip || !chipValido(reg.chip)) {
        r.invalidos++;
        o.log("aviso", `${h.ref}: sin chip, no se puede atar a una mascota`);
        continue;
      }

      try {
        let paciente = pacientes.get(reg.chip);
        if (paciente === undefined) {
          paciente = await o.bm.buscarPaciente(reg.chip);
          pacientes.set(reg.chip, paciente);
        }
        if (!paciente) {
          r.sinPermiso++;
          o.log("info", `${h.ref}: chip ${pista(reg.chip)} sin nivel 3 con la clínica, se salta`);
          continue;
        }
        const envio = await o.bm.enviar(paciente, reg);
        o.estado.enviados[id] = new Date().toISOString();
        // Tras cada envío: si el proceso cae, lo enviado no se repite.
        guardarEstado(o.rutaEstado, o.estado);
        r.enviados++;
        o.log("info", `${h.ref}: ${reg.tipo} enviado`, { envio: envio.envioId });
      } catch (e) {
        r.fallo = (e as Error).message;
        o.log("error", `${h.ref}: fallo al enviar, se reintentará en la próxima vuelta`, { error: r.fallo });
        break;
      }
    }

    if (!r.fallo) {
      o.estado.cursores[f.nombre] = lectura.cursor;
      guardarEstado(o.rutaEstado, o.estado);
      try {
        await lectura.confirmar?.();
      } catch (e) {
        o.log("aviso", `${f.nombre}: no se pudo confirmar lo procesado`, { error: (e as Error).message });
      }
    }
  }
  return resumenes;
}
