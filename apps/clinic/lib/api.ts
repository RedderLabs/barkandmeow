/* Llamadas del SaaS de clínicas a apps/api. Van por /clinica/api, en el mismo
   origen (ver rewrites en next.config.ts): la cookie de sesión es de primera
   parte y httpOnly. Rutas, cuerpos y respuestas salen del catálogo de
   @barkandmeow/schema/api: si el servidor cambia, esto no compila. */

import { api, type ClaveCreada, type CorreoVerificado, type RegistroHecho } from "@barkandmeow/schema/api";
import { crearCliente, ErrorApi } from "@barkandmeow/schema/cliente";
import type { ClinicRegisterBody, Identificador, Rol } from "@barkandmeow/schema";

export { ErrorApi };
export type { ClaveCreada, CorreoVerificado, Identificador, RegistroHecho };

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

/* ── Sesión y equipo ───────────────────────────────────────── */

export const entrar = (email: string, password: string) =>
  cliente.llamar(c.entrarClinica, { cuerpo: { email, password } });

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
