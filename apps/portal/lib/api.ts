/* Llamadas del portal del dueño a apps/api. Van por /mi-mascota/api, en el
   mismo origen (rewrites en next.config.ts): la cookie de sesión es de
   primera parte y httpOnly. Las rutas y sus tipos salen del catálogo de
   @barkandmeow/schema/api: aquí solo se les pone nombre para los componentes. */

import { api } from "@barkandmeow/schema/api";
import { crearCliente } from "@barkandmeow/schema/cliente";

export { ErrorApi } from "@barkandmeow/schema/cliente";
export type {
  Activacion,
  AdjuntoSellado,
  Enlace,
  EnvioCodigo,
  MensajeSellado,
  Origen,
  Telefono,
} from "@barkandmeow/schema/api";

export const API = "/mi-mascota/api";

const cliente = crearCliente({ base: API, credentials: "same-origin" });
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

export const darDeAlta = (datos: {
  email: string;
  password: string;
  pubKey: string;
  /** Pública Ed25519 de recuperación, sacada de la misma clave del papel. */
  recuperacionPub?: string;
  mascota: { identificador: Identificador; nombre: string };
}) => cliente.llamar(d.darDeAlta, { cuerpo: datos });

export const entrar = (identificador: Identificador, password: string) =>
  cliente.llamar(d.entrar, { cuerpo: { identificador, password } });

export const confirmarCodigo = (codigo: string) => cliente.llamar(d.confirmarCodigo, { cuerpo: { codigo } });

export const reenviarCodigo = (canal?: Canal) =>
  cliente.llamar(d.reenviarCodigo, { cuerpo: canal ? { canal } : {} });

/* ── Recuperar la contraseña: papel y segundo factor ──────── */

export const empezarRecuperacion = (identificador: Identificador) =>
  cliente.llamar(d.empezarRecuperacion, { cuerpo: { identificador } });

export const probarPapel = (recuperacionId: string, clave: string, firma: string) =>
  cliente.llamar(d.probarPapel, { cuerpo: { recuperacionId, clave, firma } });

export const terminarRecuperacion = (recuperacionId: string, codigo: string, password: string) =>
  cliente.llamar(d.terminarRecuperacion, { cuerpo: { recuperacionId, codigo, password } });

/** Cuentas de antes de la recuperación: la pública, una sola vez. */
export const guardarClaveRecuperacion = (clave: string) =>
  cliente.llamar(d.guardarClaveRecuperacion, { cuerpo: { clave } });

/* ── Segundo factor por SMS ────────────────────────────────── */

export const ponerTelefono = (telefono: string) => cliente.llamar(d.ponerTelefono, { cuerpo: { telefono } });

export const confirmarTelefono = (codigo: string) => cliente.llamar(d.confirmarTelefono, { cuerpo: { codigo } });

export const quitarTelefono = () => cliente.llamar(d.quitarTelefono);

export const elegirSegundoFactor = (canal: Canal) => cliente.llamar(d.elegirSegundoFactor, { cuerpo: { canal } });

/* ── Mascotas ──────────────────────────────────────────────── */

export const nuevaMascota = (identificador: Identificador, nombre: string) =>
  cliente.llamar(d.nuevaMascota, { cuerpo: { identificador, nombre } });

export const nuevoCodigoActivacion = (petId: string) =>
  cliente.llamar(d.nuevoCodigoActivacion, { params: { id: petId } });

export const guardarPerfil = (
  petId: string,
  perfil: { nombre: string; bio: string; telefonos: { etiqueta: string; numero: string }[]; publicado: boolean },
) => cliente.llamar(d.guardarPerfil, { params: { id: petId }, cuerpo: perfil });

export const subirFoto = (petId: string, archivo: File) =>
  cliente.llamar(d.subirFoto, { params: { id: petId }, cuerpo: archivo, tipo: archivo.type });

export const quitarFoto = (petId: string) => cliente.llamar(d.quitarFoto, { params: { id: petId } });

export const impugnar = (reclamacionId: string) => cliente.llamar(d.impugnar, { params: { id: reclamacionId } });

/* ── Permisos de nivel 3 ───────────────────────────────────── */

export const leerPermisos = () => cliente.llamar(api.publicas.permisosDueno, { cache: "no-store" });

export const aprobarAlta = (requestId: string, wrappedKey: string) =>
  cliente.llamar(api.publicas.aprobarAlta, { cuerpo: { requestId, wrappedKey } });

export const rechazarAlta = (requestId: string) =>
  cliente.llamar(api.publicas.rechazarAlta, { cuerpo: { requestId } });

export const retirarAlta = (grantId: string) => cliente.llamar(api.publicas.retirarAlta, { cuerpo: { grantId } });

/* ── Bandeja ───────────────────────────────────────────────── */

/** Los bytes sellados de un adjunto. */
export const descargarAdjunto = (mensajeId: string, adjuntoId: string) =>
  cliente.bytes(d.descargarAdjunto, { params: { id: mensajeId, adjuntoId }, cache: "no-store" });

export const leerBandeja = () => cliente.llamar(d.leerBandeja, { cache: "no-store" });

export const borrarMensaje = (id: string) => cliente.llamar(d.borrarMensaje, { params: { id } });

/* ── Pasaporte de viaje ────────────────────────────────────── */

export const leerPasaporte = (petId: string) =>
  cliente.llamar(d.leerPasaporte, { params: { id: petId }, cache: "no-store" });

export const guardarPasaporte = (petId: string, sobre: string, version: number) =>
  cliente.llamar(d.guardarPasaporte, { params: { id: petId }, cuerpo: { sobre, version } });

export const listarEnlaces = (petId: string) =>
  cliente.llamar(d.listarEnlaces, { params: { id: petId }, cache: "no-store" });

export const crearEnlace = (petId: string, id: string, sobre: string, horas: 24 | 72 | 168) =>
  cliente.llamar(d.crearEnlace, { params: { id: petId }, cuerpo: { id, sobre, horas } });

export const retirarEnlace = (petId: string, id: string) =>
  cliente.llamar(d.retirarEnlace, { params: { id: petId, shareId: id } });
