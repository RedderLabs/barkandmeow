/* Llamadas de la app a apps/api, con el cliente común de @barkandmeow/schema.

   Las mismas rutas que el portal, con una diferencia: sin cookies. La cabecera
   `x-bm-cliente: app` hace que el servidor devuelva el token de sesión en la
   respuesta, y la app lo manda después como `Authorization: Bearer`. El token
   vive en el llavero del sistema (lib/almacen.ts), nunca en texto plano. */

import Constants from "expo-constants";
import { api } from "@barkandmeow/schema/api";
import { crearCliente, ErrorApi } from "@barkandmeow/schema/cliente";
import { borrarToken, leerToken } from "./almacen";

export { ErrorApi };
export type {
  AdjuntoSellado,
  EnvioCodigo as Pendiente,
  EstadoMascota,
  Mascota,
  MensajeSellado,
  Origen,
  Yo,
} from "@barkandmeow/schema/api";

const extra = (Constants.expoConfig?.extra ?? {}) as { apiUrl?: string };
export const API = (process.env.EXPO_PUBLIC_API_URL ?? extra.apiUrl ?? "https://barkandmeow.app/api").replace(/\/$/, "");

/** Se llama cuando el servidor dice que la sesión ya no vale (401). */
let alCaducar: () => void = () => {};
export const alCaducarSesion = (f: () => void) => {
  alCaducar = f;
};

const comunes = { "x-bm-cliente": "app", accept: "application/json" };

/** Con el token guardado: un 401 lo borra y avisa de que la sesión caducó. */
const conSesion = crearCliente({
  base: API,
  cabeceras: async () => {
    const token = await leerToken();
    return { ...comunes, ...(token ? { authorization: `Bearer ${token}` } : {}) };
  },
  alCaducar: async () => {
    await borrarToken();
    alCaducar();
  },
});

/** Sin el token guardado: la entrada y el paso del código, que llevan el suyo. */
const sinSesion = crearCliente({ base: API, cabeceras: () => comunes });

const pendiente = (token: string) => ({ authorization: `Bearer ${token}` });

const d = api.duenos;

export type Identificador = { tipo: "iso"; valor: string } | { tipo: "nonISO"; valor: string };

/** Quita espacios, puntos y guiones, como normalizarChip en packages/schema. */
export function identificar(entrada: string): Identificador | null {
  const limpio = entrada.trim().replace(/[\s.-]/g, "");
  if (/^\d{15}$/.test(limpio)) return { tipo: "iso", valor: limpio };
  const noIso = limpio.replace(/^noniso:/i, "");
  if (/^[0-9A-F]{9,10}$/i.test(noIso)) return { tipo: "nonISO", valor: `nonISO:${noIso.toUpperCase()}` };
  return null;
}

export type Canal = "correo" | "sms";

/* ── Rutas ─────────────────────────────────────────────────── */

export const entrar = (identificador: Identificador, password: string) =>
  sinSesion.llamar(d.entrar, { cuerpo: { identificador, password } });

export const confirmarCodigo = (token: string, codigo: string) =>
  sinSesion.llamar(d.confirmarCodigo, { cuerpo: { codigo }, cabeceras: pendiente(token), sinAvisoDeSesion: true });

export const reenviarCodigo = (token: string, canal?: Canal) =>
  sinSesion.llamar(d.reenviarCodigo, {
    cuerpo: canal ? { canal } : {},
    cabeceras: pendiente(token),
    sinAvisoDeSesion: true,
  });

export const salir = () => conSesion.llamar(d.salir);

export const yo = () => conSesion.llamar(d.yo);

export const leerBandeja = () => conSesion.llamar(d.leerBandeja);

export const borrarMensaje = (id: string) => conSesion.llamar(d.borrarMensaje, { params: { id } });

export const impugnar = (reclamacionId: string) =>
  conSesion.llamar(d.impugnar, { params: { id: reclamacionId } });

/** Sube una vez la clave pública de recuperación (cuentas de antes). */
export const guardarClaveRecuperacion = (clave: string) =>
  conSesion.llamar(d.guardarClaveRecuperacion, { cuerpo: { clave } });

export const registrarDispositivo = (token: string) =>
  conSesion.llamar(d.registrarDispositivo, { cuerpo: { plataforma: "expo", token } });

export const retirarDispositivo = (token: string) =>
  conSesion.llamar(d.retirarDispositivo, { cuerpo: { token } });
