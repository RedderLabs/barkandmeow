/* Llamadas del SaaS de clínicas a apps/api. Van por /clinica/api, en el mismo
   origen (ver rewrites en next.config.ts): la cookie de sesión es de primera
   parte y httpOnly. Rutas, cuerpos y respuestas salen del catálogo de
   @barkandmeow/schema/api: si el servidor cambia, esto no compila. */

import {
  api,
  type ClaveCreada,
  type CorreoVerificado,
  type Envio,
  type PacienteConsola,
  type RegistroHecho,
} from "@barkandmeow/schema/api";
import { crearCliente, ErrorApi } from "@barkandmeow/schema/cliente";
import type { ClinicRegisterBody, Identificador, Rol } from "@barkandmeow/schema";

export { ErrorApi };
export type { ClaveCreada, CorreoVerificado, Envio, Identificador, PacienteConsola, RegistroHecho };

export const API = "/clinica/api";

const cliente = crearCliente({ base: API, credentials: "same-origin" });
const c = api.clinicas;
const p = api.publicas;

export type Registro = ClinicRegisterBody;

export const registrarClinica = (r: Registro) => cliente.llamar(c.registrarClinica, { cuerpo: r });

export const verificarCorreo = (codigo: string) => cliente.llamar(c.verificarCorreo, { cuerpo: { codigo } });

export const reenviarCodigo = () => cliente.llamar(c.reenviarCodigoCorreo);

/* ── Activación de mascotas en clínica ─────────────────────── */

export const activarMascota = (identificador: Identificador, codigo: string) =>
  cliente.llamar(p.activarMascota, { cuerpo: { identificador, codigo } });

export const abrirReclamacion = (identificador: Identificador, codigo: string) =>
  cliente.llamar(p.reclamarChip, { cuerpo: { identificador, codigo } });

/* ── El chip del mostrador y los pacientes ─────────────────── */

/** Qué toca hacer con el chip que se acaba de leer. */
export const consultarChip = (identificador: Identificador) =>
  cliente.llamar(c.consultarChipClinica, { cuerpo: { identificador } });

/** `etiqueta` ya cifrada en este navegador (ver lib/etiquetas.ts). */
export const guardarEtiqueta = (petId: string, etiqueta: string) =>
  cliente.llamar(c.etiquetarPaciente, { params: { petId }, cuerpo: { etiqueta } });

export const quitarEtiqueta = (petId: string) => cliente.llamar(c.quitarEtiquetaPaciente, { params: { petId } });

/* ── Los nombres, para todo el equipo ──────────────────────── */

/** Este navegador se presenta; vuelve la clave de las etiquetas si ya se la dejaron. */
export const presentarDispositivo = (devicePubKey: string) =>
  cliente.llamar(c.registrarDispositivo, { cuerpo: { devicePubKey }, cache: "no-store" });

export const clavesPendientes = () => cliente.llamar(c.dispositivosSinClave, { cache: "no-store" });

export const entregarClaves = (entregas: { dispositivoId: string; sellada: string }[]) =>
  cliente.llamar(c.entregarClaveEtiquetas, { cuerpo: { entregas } });

/* ── Alta de nivel 3 ───────────────────────────────────────── */

export const pedirAlta = (identificador: Identificador, vetPubKey: string) =>
  cliente.llamar(p.pedirAlta, { cuerpo: { identificador, vetPubKey } });

export const estadoAlta = (id: string) => cliente.llamar(p.estadoAlta, { params: { id }, cache: "no-store" });

/* ── Sesión y equipo ───────────────────────────────────────── */

export const entrar = (email: string, password: string) =>
  cliente.llamar(c.entrarClinica, { cuerpo: { email, password } });

/* ── Recuperar la contraseña ───────────────────────────────── */

export const empezarRecuperacion = (email: string) =>
  cliente.llamar(c.empezarRecuperacion, { cuerpo: { email } });

export const terminarRecuperacion = (recuperacionId: string, codigo: string, password: string) =>
  cliente.llamar(c.terminarRecuperacion, { cuerpo: { recuperacionId, codigo, password } });

export const aceptarInvitacion = (token: string, password: string, devicePubKey: string) =>
  cliente.llamar(c.aceptarInvitacion, { cuerpo: { token, password, devicePubKey } });

/** Añade a alguien al equipo: le llega un correo para elegir su contraseña. */
export const anadirMiembro = (nombre: string, email: string, rol: Rol) =>
  cliente.llamar(c.invitarMiembro, { cuerpo: { nombre, email, rol } });

export const darDeBaja = (id: string) => cliente.llamar(c.darDeBajaMiembro, { params: { id } });

export const entregarClave = (id: string, wrappedClinicKey: string) =>
  cliente.llamar(c.entregarClaveClinica, { params: { id }, cuerpo: { wrappedClinicKey } });

/* ── Software de gestión ───────────────────────────────────── */

export const crearClaveApi = (nombre: string, firmaPub: string) =>
  cliente.llamar(c.crearClaveApi, { cuerpo: { nombre, firmaPub } });

export const retirarClaveApi = (id: string) => cliente.llamar(c.retirarClaveApi, { params: { id } });
