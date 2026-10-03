/* Todos los textos de la app, en los cuatro idiomas de la web del
   veterinario (es, pt, en, fr). Cada pantalla tiene su archivo con claves
   que empiezan por su nombre («cuenta.titulo»), y aquí se juntan. */

import { IDIOMAS, type Idioma } from "@barkandmeow/i18n";
import comun from "./comun";
import type { Textos } from "./seccion";
import cuenta from "./cuenta";
import piezas from "./piezas";
import entrada from "./entrada";
import mascotas from "./mascotas";
import bandeja from "./bandeja";
import permisos from "./permisos";
import mascota from "./mascota";
import salud from "./salud";
import placa from "./placa";
import compartir from "./compartir";
import perfil from "./perfil";
import pasaporte from "./pasaporte";

const grupos = [comun, cuenta, piezas, entrada, mascotas, bandeja, permisos, mascota, salud, placa, compartir, perfil, pasaporte] as const;

type ClavesDe<G> = G extends Textos<infer K> ? K : never;
export type Clave = ClavesDe<(typeof grupos)[number]>;

export const TEXTOS = Object.fromEntries(
  IDIOMAS.map((i) => [i, Object.assign({}, ...grupos.map((g) => g[i]))]),
) as Record<Idioma, Record<Clave, string>>;
