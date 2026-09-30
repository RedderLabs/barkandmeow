import { z } from "zod";
import { codigoEspecie } from "./species";

/* Pasaporte de viaje (decidido 2026-09-29).

   No sustituye al pasaporte europeo, que es de papel y lo sella un veterinario
   autorizado (Reglamento Delegado (UE) 2026/131, que desde el 22/04/2026
   sustituye al 576/2013): es su copia digital, con cada dato
   marcado por su origen. Los registros que envía una clínica van firmados con
   Ed25519 por la clave de firma de su conexión; los que apunta el dueño van
   como «declarados», sin firma.

   El servidor nunca ve nada de esto en claro: los registros llegan sellados a
   la bandeja del dueño, el pasaporte se guarda cifrado con una clave que sale
   de su código en papel, y lo que comparte para un viaje va cifrado con la
   clave del fragmento del enlace. */

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha AAAA-MM-DD");
const texto = (max: number) => z.string().trim().max(max);
const b64 = (bytes: number) =>
  z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).refine((s) => Math.floor((s.length * 3) / 4) - (s.match(/=/g)?.length ?? 0) === bytes, `${bytes} bytes`);

/* PDF adjuntos (decidido 2026-09-30): el informe o el análisis de anticuerpos
   pueden llevar hasta tres. Van sellados aparte; aquí, firmado, queda el
   SHA-256 de cada PDF en claro para comprobar al abrirlo que es ese. */
export const adjuntoFirmado = z.object({
  nombre: texto(120),
  tipo: z.literal("application/pdf"),
  bytes: z.number().int().positive().max(8 * 1024 * 1024),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export type AdjuntoFirmado = z.infer<typeof adjuntoFirmado>;
const adjuntos = z.array(adjuntoFirmado).max(3).default([]);

/** Lo común a todo registro de clínica: a qué animal y quién lo hizo. */
const comun = {
  version: z.literal(1),
  /** El chip completo, sin espacios: ata el registro al animal. */
  chip: z.string().regex(/^[0-9A-Za-z]{6,23}$/),
  fecha,
  clinica: texto(120).default(""),
  veterinario: texto(120).default(""),
};

export const registroVacuna = z.object({
  ...comun,
  tipo: z.literal("vacuna"),
  /** La rabia es la que decide un viaje; el resto, informativas. */
  enfermedad: z.enum(["rabia", "otra"]),
  /** Contra qué, en texto: «Moquillo, parvovirosis, hepatitis». */
  nombre: texto(120).default(""),
  producto: texto(120),
  lote: texto(60),
  validaHasta: fecha,
});

export const registroDesparasitacion = z.object({
  ...comun,
  tipo: z.literal("desparasitacion"),
  /** Equinococo: el tratamiento que piden algunos destinos entre 24 y 120 h antes. */
  contra: z.enum(["equinococo", "otra"]),
  producto: texto(120),
  /** Hora de administración, porque el plazo se cuenta en horas. */
  hora: z.string().regex(/^\d{2}:\d{2}$/),
});

export const registroTitulacion = z.object({
  ...comun,
  tipo: z.literal("titulacion"),
  /** Anticuerpos antirrábicos, en UI/ml. */
  resultado: z.number().nonnegative().max(1000),
  laboratorio: texto(120),
  fechaMuestra: fecha,
  adjuntos,
});

export const registroInforme = z.object({
  ...comun,
  tipo: z.literal("informe"),
  chip: comun.chip.optional(),
  motivo: texto(200).default(""),
  diagnostico: texto(4000).default(""),
  tratamiento: texto(4000).default(""),
  observaciones: texto(8000).default(""),
  adjuntos,
});

export const registroClinico = z.discriminatedUnion("tipo", [
  registroVacuna,
  registroDesparasitacion,
  registroTitulacion,
  registroInforme,
]);
export type RegistroClinico = z.infer<typeof registroClinico>;
export type RegistroVacuna = z.infer<typeof registroVacuna>;
export type RegistroDesparasitacion = z.infer<typeof registroDesparasitacion>;
export type RegistroTitulacion = z.infer<typeof registroTitulacion>;

/**
 * Lo que la clínica sella para el dueño. `registro` es el JSON tal cual se
 * firmó: la firma cubre esos bytes exactos, así que nadie tiene que volver a
 * serializarlo igual para comprobarla.
 */
export const sobreFirmado = z.object({
  version: z.literal(1),
  tipo: z.literal("firmado"),
  registro: z.string().max(16 * 1024),
  /** Ed25519 sobre los bytes UTF-8 de `registro`. */
  firma: b64(64),
  /** Clave pública de firma de la conexión que lo envió. */
  clave: b64(32),
});
export type SobreFirmado = z.infer<typeof sobreFirmado>;

/** Remitente según el servidor: la clínica de la clave de API. */
export const origenCertificado = z.object({
  clinica: z.string(),
  pais: z.string(),
  dominio: z.string().nullable(),
});

/** Un registro firmado ya guardado en el pasaporte del dueño. */
export const certificado = sobreFirmado.omit({ version: true, tipo: true }).extend({
  id: z.string().max(64),
  origen: origenCertificado,
  recibido: z.string(),
});
export type Certificado = z.infer<typeof certificado>;

/** Lo que apunta el dueño a mano: vale como recordatorio, no como prueba. */
export const declarado = z.object({
  id: z.string().max(64),
  registro: z.discriminatedUnion("tipo", [
    registroVacuna.extend({ chip: comun.chip.optional() }),
    registroDesparasitacion.extend({ chip: comun.chip.optional() }),
    registroTitulacion.extend({ chip: comun.chip.optional() }),
  ]),
});
export type Declarado = z.infer<typeof declarado>;

/** El pasaporte del dueño, cifrado con su clave antes de subirlo. */
export const pasaporteDueno = z.object({
  version: z.literal(1),
  especie: codigoEspecie.default("dog"),
  /** Número del pasaporte europeo en papel, tal como está impreso. */
  numeroPasaporte: texto(40).default(""),
  /** El chip completo: el servidor solo tiene su HMAC y los últimos 4 dígitos. */
  chip: z.string().regex(/^[0-9A-Za-z]{6,23}$/).or(z.literal("")).default(""),
  certificados: z.array(certificado).max(300).default([]),
  declarados: z.array(declarado).max(300).default([]),
});
export type PasaporteDueno = z.infer<typeof pasaporteDueno>;

/** Lo que va en el enlace temporal de viaje, cifrado con la clave del fragmento. */
export const pasaporteCompartido = pasaporteDueno.extend({
  tipo: z.literal("pasaporte"),
  nombre: texto(60).default(""),
  generado: z.string(),
});
export type PasaporteCompartido = z.infer<typeof pasaporteCompartido>;

/* ── Contratos de la API ─────────────────────────────────── */

/** El pasaporte cifrado. `version` evita pisar un cambio hecho en otra pestaña. */
export const pasaporteBody = z.object({
  sobre: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).refine((s) => (s.length * 3) / 4 <= 256 * 1024, "demasiado grande"),
  version: z.number().int().nonnegative(),
});

/** Enlace temporal: el id lo pone el navegador, porque va atado al cifrado. */
export const compartirBody = z.object({
  id: z.string().uuid(),
  sobre: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).refine((s) => (s.length * 3) / 4 <= 256 * 1024, "demasiado grande"),
  horas: z.union([z.literal(24), z.literal(72), z.literal(168)]),
});
