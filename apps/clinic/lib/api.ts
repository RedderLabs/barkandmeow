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

export const invitar = (nombre: string, email: string, rol: Rol) =>
  cliente.llamar(c.invitarMiembro, { cuerpo: { nombre, email, rol } });

export const darDeBaja = (id: string) => cliente.llamar(c.darDeBajaMiembro, { params: { id } });

export const entregarClave = (id: string, wrappedClinicKey: string) =>
  cliente.llamar(c.entregarClaveClinica, { params: { id }, cuerpo: { wrappedClinicKey } });

/* ── Software de gestión ───────────────────────────────────── */

export const crearClaveApi = (nombre: string, firmaPub: string) =>
  cliente.llamar(c.crearClaveApi, { cuerpo: { nombre, firmaPub } });

export const retirarClaveApi = (id: string) => cliente.llamar(c.retirarClaveApi, { params: { id } });
