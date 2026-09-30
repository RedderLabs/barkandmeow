import { rutasClinicas } from "./clinicas";
import { rutasDuenos } from "./duenos";
import { rutasPublicas } from "./publicas";
import type { Metodo, Ruta } from "./tipos";

export * from "./tipos";
export * from "./clinicas";
export * from "./duenos";
export * from "./publicas";

/** Todas las rutas de apps/api, por familia. */
export const api = {
  duenos: rutasDuenos,
  clinicas: rutasClinicas,
  publicas: rutasPublicas,
} as const;

/** Todas las rutas en una lista. */
export const todasLasRutas: readonly Ruta[] = Object.values(api).flatMap((g) => Object.values(g) as Ruta[]);

const indice = new Map(todasLasRutas.map((r) => [`${r.metodo} ${r.ruta}`, r]));

/** La ruta del catálogo para un método y un patrón de Fastify (`/pets/:id`). */
export const buscarRuta = (metodo: Metodo | string, ruta: string): Ruta | undefined =>
  indice.get(`${metodo.toUpperCase()} ${ruta}`);
