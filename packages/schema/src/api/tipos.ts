import { z } from "zod";

/* Catálogo de rutas de apps/api. Es el contrato: de aquí salen el cliente
   tipado que usan el portal, la app y la clínica, y packages/spec/openapi.yaml.
   Los tests de la API comprueban que cada ruta de Fastify está aquí (y al
   revés) y que cada respuesta cumple su esquema. */

/** Quién puede llamar y con qué credencial. */
export type Acceso =
  /** Sin credencial. */
  | "publica"
  /** Sin credencial, abierta por CORS a la web del veterinario. */
  | "web-vet"
  /** Dueño con sesión: cookie `bam_owner` (portal) o `Bearer` (app, con `x-bm-cliente: app`). */
  | "dueno"
  /** Dueño a medio entrar: la sesión pendiente del segundo factor. */
  | "dueno-pendiente"
  /** Miembro de una clínica: cookie `bam_clinic`. */
  | "clinica"
  /** Software de gestión: `Authorization: Bearer bmk_…`. */
  | "clave-api"
  /** Panel del operador: `Authorization: Bearer <OPS_TOKEN>`. */
  | "operador";

export type Metodo = "GET" | "POST" | "PUT" | "DELETE";

export type Ruta = {
  metodo: Metodo;
  /** Como en Fastify: `/owners/v1/pets/:id`. */
  ruta: string;
  acceso: Acceso;
  /** Una línea para la documentación. */
  resumen: string;
  /** Cuerpo JSON. */
  cuerpo?: z.ZodType;
  /** Cuerpo binario en vez de JSON: tipos admitidos, p. ej. `image/jpeg`. */
  cuerpoBinario?: readonly string[];
  /** Respuesta JSON del caso bueno. */
  respuesta?: z.ZodType;
  /** Respuesta binaria en vez de JSON: su content-type. */
  respuestaBinaria?: string;
  /** Código del caso bueno. 200 si no se dice. */
  estado?: number;
  /** Códigos de error que la ruta devuelve a propósito. */
  errores?: readonly number[];
};

/** Identidad con los tipos intactos: `ruta({...})` en vez de anotar a mano. */
export const ruta = <const R extends Ruta>(r: R): R => r;

/** Toda respuesta de error: `error` legible y, a veces, datos para la interfaz. */
export const errorApi = z.looseObject({
  error: z.string(),
  motivo: z.string().optional(),
});

export const ok = z.object({ ok: z.literal(true) });

/** Fecha en ISO 8601, como la serializa JSON. */
export const fecha = z.string().datetime({ offset: true });
