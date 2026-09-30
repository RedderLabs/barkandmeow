/* Cliente de la API de Bark & Meow para el software de gestión.

   Es lo mismo que hace apps/api/scripts/enviar-registro.ts, en forma de
   módulo: comprueba la clave, busca al paciente entre los que dieron el nivel
   3 a la clínica, firma el registro con la clave de firma de la conexión
   (Ed25519), lo sella para la clave pública del dueño (crypto_box_seal) y lo
   envía. Todo ocurre en la máquina de la clínica: a la API solo llegan bytes
   sellados que no puede abrir. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cargarCripto, deBase64, firmarRegistro, type Cripto } from "@barkandmeow/crypto";
import type { RegistroClinico } from "@barkandmeow/schema";
import { api, type InformeEnviado, type Paciente, type Ruta } from "@barkandmeow/schema/api";
import { crearCliente, ErrorApi as ErrorCliente, type Respuesta } from "@barkandmeow/schema/cliente";

export type { InformeEnviado, Paciente };

/** Un PDF para adjuntar al informe o al análisis: se firma su SHA-256 y viaja sellado aparte. */
export type Pdf = { nombre: string; bytes: Uint8Array };

export type ClienteBM = {
  me(): Promise<Respuesta<typeof api.clinicas.yoClaveApi>>;
  /** El paciente de ese chip si dio el nivel 3 a la clínica; null si no. */
  buscarPaciente(chip: string): Promise<Paciente | null>;
  /** Los PDF solo caben en informes y análisis (los tipos con `adjuntos`). */
  enviar(paciente: Paciente, registro: RegistroClinico, pdfs?: Pdf[]): Promise<InformeEnviado>;
};

export class ErrorApi extends Error {
  constructor(
    readonly ruta: string,
    readonly estado: number,
    mensaje: string,
  ) {
    super(`${ruta}: ${estado} ${mensaje}`);
  }
}

/** Los bytes de bm_crypto.wasm: BM_CRYPTO_WASM o el del paquete. */
export function rutaWasm(): string {
  if (process.env.BM_CRYPTO_WASM) return process.env.BM_CRYPTO_WASM;
  try {
    return fileURLToPath(import.meta.resolve("@barkandmeow/crypto/wasm"));
  } catch {
    return fileURLToPath(new URL("../../../packages/crypto/wasm/bm_crypto.wasm", import.meta.url));
  }
}

export const cargarCriptoLocal = () => cargarCripto(readFileSync(rutaWasm()));

/** La semilla Ed25519 de 32 bytes de una clave bmf_. */
export function semillaDeFirma(bmf: string): Uint8Array {
  const s = deBase64(bmf.trim().replace(/^bmf_/, ""));
  if (!s || s.length !== 32) throw new Error("BM_FIRMA no es una clave de firma (bmf_…)");
  return s;
}

export function crearClienteBM(o: {
  url: string;
  clave: string;
  firma: string;
  cripto: Cripto;
  fetch?: typeof fetch;
}): ClienteBM {
  if (!/^bmk_[A-Za-z0-9_-]{43}$/.test(o.clave)) throw new Error("BM_API_KEY no es una clave de API (bmk_…)");
  const semilla = semillaDeFirma(o.firma);
  const cliente = crearCliente({
    base: o.url.replace(/\/$/, ""),
    cabeceras: () => ({ authorization: `Bearer ${o.clave}` }),
    fetch: o.fetch,
  });
  const c = api.clinicas;

  /** Los errores llevan la ruta: el log dice qué llamada falló. */
  async function conRuta<T>(r: Ruta, llamada: Promise<T>): Promise<T> {
    try {
      return await llamada;
    } catch (e) {
      if (e instanceof ErrorCliente) throw new ErrorApi(r.ruta, e.estado, e.message);
      throw e;
    }
  }

  return {
    me: () => conRuta(c.yoClaveApi, cliente.llamar(c.yoClaveApi)),

    async buscarPaciente(chip) {
      const tipo = /^\d{15}$/.test(chip) ? "iso" : "nonISO";
      try {
        return await conRuta(
          c.buscarPaciente,
          cliente.llamar(c.buscarPaciente, { cuerpo: { identificador: { tipo, valor: chip } } }),
        );
      } catch (e) {
        // 404: el chip no existe o su dueño no dio el nivel 3. La API no dice cuál.
        if (e instanceof ErrorApi && e.estado === 404) return null;
        throw e;
      }
    },

    async enviar(paciente, registro, pdfs = []) {
      const destino = deBase64(paciente.ownerPubKey);
      if (!destino || destino.length !== 32) throw new Error("clave pública del dueño mal formada");
      if (pdfs.length) {
        if (!("adjuntos" in registro)) throw new Error(`un registro de tipo ${registro.tipo} no lleva adjuntos`);
        if (pdfs.some((p) => new TextDecoder().decode(p.bytes.subarray(0, 4)) !== "%PDF"))
          throw new Error("los adjuntos tienen que ser PDF");
        // Lo firmado dice qué PDF son, en el mismo orden en que viajan sellados.
        registro = {
          ...registro,
          adjuntos: pdfs.map((p) => ({
            nombre: p.nombre,
            tipo: "application/pdf" as const,
            bytes: p.bytes.length,
            sha256: createHash("sha256").update(p.bytes).digest("hex"),
          })),
        };
      }
      const firmado = firmarRegistro(o.cripto, semilla, registro);
      const sellado = o.cripto.sellar(destino, new TextEncoder().encode(JSON.stringify(firmado)));
      return conRuta(
        c.enviarInforme,
        cliente.llamar(c.enviarInforme, {
          cuerpo: {
            petId: paciente.petId,
            sellado: Buffer.from(sellado).toString("base64"),
            adjuntos: pdfs.map((p) => Buffer.from(o.cripto.sellar(destino, p.bytes)).toString("base64")),
          },
        }),
      );
    },
  };
}
