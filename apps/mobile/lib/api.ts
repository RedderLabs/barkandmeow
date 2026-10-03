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
  Enlace,
  EnvioCodigo as Pendiente,
  EstadoMascota,
  Mascota,
  MensajeSellado,
  Origen,
  Yo,
} from "@barkandmeow/schema/api";

const extra = (Constants.expoConfig?.extra ?? {}) as { apiUrl?: string; webUrl?: string };
export const API = (process.env.EXPO_PUBLIC_API_URL ?? extra.apiUrl ?? "https://barkandmeow.app/api").replace(/\/$/, "");
/** Dónde vive la web del veterinario: a ella apuntan el QR de la placa y los enlaces temporales. */
export const WEB = (process.env.EXPO_PUBLIC_WEB_URL ?? extra.webUrl ?? "https://barkandmeow.app").replace(/\/$/, "");

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

export const cambiarContrasena = (actual: string, nueva: string) =>
  conSesion.llamar(d.cambiarContrasena, { cuerpo: { actual, nueva } });

export const borrarCuenta = (password: string) => conSesion.llamar(d.borrarCuenta, { cuerpo: { password } });

export const leerBandeja = () => conSesion.llamar(d.leerBandeja);

export const borrarMensaje = (id: string) => conSesion.llamar(d.borrarMensaje, { params: { id } });

export const borrarMensajes = (ids: string[]) => conSesion.llamar(d.borrarMensajes, { cuerpo: { ids } });

/* Permisos de nivel 3: lo que piden las clínicas y lo que el dueño ha dado. */

export const leerPermisos = () => conSesion.llamar(api.publicas.permisosDueno);

export const aprobarAlta = (requestId: string, wrappedKey: string) =>
  conSesion.llamar(api.publicas.aprobarAlta, { cuerpo: { requestId, wrappedKey } });

export const rechazarAlta = (requestId: string) =>
  conSesion.llamar(api.publicas.rechazarAlta, { cuerpo: { requestId } });

export const retirarAlta = (grantId: string) => conSesion.llamar(api.publicas.retirarAlta, { cuerpo: { grantId } });

export const impugnar = (reclamacionId: string) =>
  conSesion.llamar(d.impugnar, { params: { id: reclamacionId } });

/** Sube una vez la clave pública de recuperación (cuentas de antes). */
export const guardarClaveRecuperacion = (clave: string) =>
  conSesion.llamar(d.guardarClaveRecuperacion, { cuerpo: { clave } });

export const registrarDispositivo = (token: string) =>
  conSesion.llamar(d.registrarDispositivo, { cuerpo: { plataforma: "expo", token } });

export const retirarDispositivo = (token: string) =>
  conSesion.llamar(d.retirarDispositivo, { cuerpo: { token } });

/* Ficha de salud, placa del collar y enlaces temporales: todo sube ya cifrado. */

export const leerFicha = (petId: string) => conSesion.llamar(d.leerFicha, { params: { id: petId } });

export const guardarFicha = (petId: string, sobre: string, version: number) =>
  conSesion.llamar(d.guardarFicha, { params: { id: petId }, cuerpo: { sobre, version } });

export const ponerPlaca = (petId: string, id: string, sobre: string) =>
  conSesion.llamar(d.ponerPlaca, { params: { id: petId }, cuerpo: { id, sobre } });

export const quitarPlaca = (petId: string) => conSesion.llamar(d.quitarPlaca, { params: { id: petId } });

export const leerPasaporte = (petId: string) => conSesion.llamar(d.leerPasaporte, { params: { id: petId } });

export const listarEnlaces = (petId: string) => conSesion.llamar(d.listarEnlaces, { params: { id: petId } });

export const crearEnlace = (petId: string, id: string, sobre: string, horas: 24 | 72 | 168) =>
  conSesion.llamar(d.crearEnlace, { params: { id: petId }, cuerpo: { id, sobre, horas } });

export const retirarEnlace = (petId: string, id: string) =>
  conSesion.llamar(d.retirarEnlace, { params: { id: petId, shareId: id } });

/* Lo que antes solo se hacía en el portal: mascotas nuevas, código de activación y perfil público. */

export const nuevaMascota = (identificador: Identificador, nombre: string) =>
  conSesion.llamar(d.nuevaMascota, { cuerpo: { identificador, nombre } });

export const nuevoCodigoActivacion = (petId: string) =>
  conSesion.llamar(d.nuevoCodigoActivacion, { params: { id: petId } });

export const guardarPerfil = (
  petId: string,
  perfil: { nombre: string; bio: string; telefonos: { etiqueta: string; numero: string }[]; publicado: boolean },
) => conSesion.llamar(d.guardarPerfil, { params: { id: petId }, cuerpo: perfil });
