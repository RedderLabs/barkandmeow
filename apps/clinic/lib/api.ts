/* Llamadas del SaaS de clínicas a apps/api. Van por /clinica/api, en el mismo
   origen (ver rewrites en next.config.ts): la cookie de sesión es de primera
   parte y httpOnly. */

export const API = "/clinica/api";

export class ErrorApi extends Error {
  readonly estado: number;
  /** El cuerpo de la respuesta de error: motivo, segundos, intentos… */
  readonly datos: Record<string, unknown>;
  constructor(estado: number, mensaje: string, datos: Record<string, unknown> = {}) {
    super(mensaje);
    this.estado = estado;
    this.datos = datos;
  }
}

export async function llamar<T>(ruta: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${API}${ruta}`, {
      ...init,
      credentials: "same-origin",
      headers: init?.json !== undefined ? { "content-type": "application/json" } : init?.headers,
      body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    });
  } catch {
    throw new ErrorApi(0, "sin conexión");
  }
  const cuerpo = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new ErrorApi(r.status, cuerpo.error ?? `error ${r.status}`, cuerpo);
  return cuerpo;
}

export type Registro = {
  nombre: string;
  pais: string;
  registroSanitario?: string;
  direccion?: string;
  pubKey: string;
  admin: { nombre: string; email: string; password: string; devicePubKey: string };
};

export type RegistroHecho = {
  clinicId: string;
  memberId: string;
  correo: string;
  /** El dominio que queda verificado con el código, o null si el correo es gratuito. */
  dominio: string | null;
  correoVerificado: boolean;
};

export type CorreoVerificado = {
  verificado: true;
  dominio: string | null;
  clinicaVerificada: boolean;
};

export const registrarClinica = (r: Registro) =>
  llamar<RegistroHecho>("/clinics/v1/register", { method: "POST", json: r });

export const verificarCorreo = (codigo: string) =>
  llamar<CorreoVerificado>("/clinics/v1/email/verify", { method: "POST", json: { codigo } });

export const reenviarCodigo = () =>
  llamar<{ enviado: true; correo: string }>("/clinics/v1/email/resend", { method: "POST", json: {} });

/* ── Activación de mascotas en clínica ─────────────────────── */

export type Identificador = { tipo: "iso"; valor: string } | { tipo: "nonISO"; valor: string };

export const activarMascota = (identificador: Identificador, codigo: string) =>
  llamar<{ petId: string; estado: "activa" }>("/pets/v1/activate", {
    method: "POST",
    json: { identificador, codigo },
  });

export const abrirReclamacion = (identificador: Identificador, codigo: string) =>
  llamar<{ reclamacionId: string; plazo: string }>("/pets/v1/claims", {
    method: "POST",
    json: { identificador, codigo },
  });

/* ── Sesión y equipo ───────────────────────────────────────── */

export const entrar = (email: string, password: string) =>
  llamar<{ memberId: string; clinicId: string; role: string }>("/clinics/v1/login", {
    method: "POST",
    json: { email, password },
  });

export const aceptarInvitacion = (token: string, password: string, devicePubKey: string) =>
  llamar<{ memberId: string; clinicId: string; role: "admin" | "vet" | "assistant" }>(
    "/clinics/v1/members/accept",
    { method: "POST", json: { token, password, devicePubKey } },
  );

export const invitar = (nombre: string, email: string, rol: string) =>
  llamar<{ memberId: string; enviado: true }>("/clinics/v1/members", {
    method: "POST",
    json: { nombre, email, rol },
  });

export const darDeBaja = (id: string) =>
  llamar<{ ok: true }>(`/clinics/v1/members/${encodeURIComponent(id)}`, { method: "DELETE" });

export const entregarClave = (id: string, wrappedClinicKey: string) =>
  llamar<{ ok: true }>(`/clinics/v1/members/${encodeURIComponent(id)}/clinic-key`, {
    method: "POST",
    json: { wrappedClinicKey },
  });
