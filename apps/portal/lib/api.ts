/* Llamadas del portal del dueño a apps/api. Van por /mi-mascota/api, en el
   mismo origen (rewrites en next.config.ts): la cookie de sesión es de
   primera parte y httpOnly. */

export const API = "/mi-mascota/api";

export class ErrorApi extends Error {
  readonly estado: number;
  readonly datos: Record<string, unknown>;
  constructor(estado: number, mensaje: string, datos: Record<string, unknown> = {}) {
    super(mensaje);
    this.estado = estado;
    this.datos = datos;
  }
}

export async function llamar<T>(
  ruta: string,
  init?: Omit<RequestInit, "body"> & { json?: unknown; body?: BodyInit },
): Promise<T> {
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

export type Identificador = { tipo: "iso"; valor: string } | { tipo: "nonISO"; valor: string };

/** Quita espacios, puntos y guiones, como normalizarChip en packages/schema. */
export function identificar(entrada: string): Identificador | null {
  const limpio = entrada.trim().replace(/[\s.-]/g, "");
  if (/^\d{15}$/.test(limpio)) return { tipo: "iso", valor: limpio };
  const noIso = limpio.replace(/^noniso:/i, "");
  if (/^[0-9A-F]{9,10}$/i.test(noIso)) return { tipo: "nonISO", valor: `nonISO:${noIso.toUpperCase()}` };
  return null;
}

export type Activacion = { codigoActivacion: string; caduca: string };

export const darDeAlta = (datos: {
  email: string;
  password: string;
  pubKey: string;
  mascota: { identificador: Identificador; nombre: string };
}) =>
  llamar<{ correo: string; mascota: Activacion & { petId: string } }>("/owners/v1/register", {
    method: "POST",
    json: datos,
  });

export const entrar = (identificador: Identificador, password: string) =>
  llamar<{ enviado: true; correo: string }>("/owners/v1/login", {
    method: "POST",
    json: { identificador, password },
  });

export const confirmarCodigo = (codigo: string) =>
  llamar<{ ok: true }>("/owners/v1/login/verify", { method: "POST", json: { codigo } });

export const reenviarCodigo = () =>
  llamar<{ enviado: true; correo: string }>("/owners/v1/login/resend", { method: "POST", json: {} });

export const nuevaMascota = (identificador: Identificador, nombre: string) =>
  llamar<Activacion & { petId: string }>("/owners/v1/pets", {
    method: "POST",
    json: { identificador, nombre },
  });

export const nuevoCodigoActivacion = (petId: string) =>
  llamar<Activacion>(`/owners/v1/pets/${encodeURIComponent(petId)}/activation-code`, {
    method: "POST",
    json: {},
  });

export type Telefono = { etiqueta: string; numero: string };

export const guardarPerfil = (
  petId: string,
  perfil: { nombre: string; bio: string; telefonos: Telefono[]; publicado: boolean },
) =>
  llamar<{ ok: true }>(`/owners/v1/pets/${encodeURIComponent(petId)}/profile`, {
    method: "PUT",
    json: perfil,
  });

export const subirFoto = (petId: string, archivo: File) =>
  llamar<{ foto: string }>(`/owners/v1/pets/${encodeURIComponent(petId)}/photo`, {
    method: "PUT",
    headers: { "content-type": archivo.type },
    body: archivo,
  });

export const quitarFoto = (petId: string) =>
  llamar<{ ok: true }>(`/owners/v1/pets/${encodeURIComponent(petId)}/photo`, { method: "DELETE" });

export const impugnar = (reclamacionId: string) =>
  llamar<{ estado: "impugnada" }>(`/owners/v1/claims/${encodeURIComponent(reclamacionId)}/contest`, {
    method: "POST",
    json: {},
  });

/** Mensaje de la bandeja tal como llega: sellado a la clave pública del dueño. */
/** Quién envió un informe, según la clave de API con que llegó. Lo pone el
    servidor, no la clínica; en notas y avisos es null. */
export type Origen = {
  clinica: string;
  pais: string;
  dominio: string | null;
  /** Clave de firma de la conexión que lo envió (base64), si la tiene. */
  firma: string | null;
};

export type MensajeSellado = {
  id: string;
  petId: string;
  sellado: string;
  llegada: string;
  origen: Origen | null;
};

export const leerBandeja = () => llamar<{ mensajes: MensajeSellado[] }>("/owners/v1/inbox", { cache: "no-store" });

export const borrarMensaje = (id: string) =>
  llamar<{ ok: true }>(`/owners/v1/inbox/${encodeURIComponent(id)}`, { method: "DELETE" });

/* ── Pasaporte de viaje ────────────────────────────────────── */

const mascota = (petId: string) => `/owners/v1/pets/${encodeURIComponent(petId)}`;

export const leerPasaporte = (petId: string) =>
  llamar<{ sobre: string | null; version: number }>(`${mascota(petId)}/passport`, { cache: "no-store" });

export const guardarPasaporte = (petId: string, sobre: string, version: number) =>
  llamar<{ version: number }>(`${mascota(petId)}/passport`, { method: "PUT", json: { sobre, version } });

export type Enlace = { id: string; caduca: string; creado: string };

export const listarEnlaces = (petId: string) =>
  llamar<{ enlaces: Enlace[] }>(`${mascota(petId)}/shares`, { cache: "no-store" });

export const crearEnlace = (petId: string, id: string, sobre: string, horas: 24 | 72 | 168) =>
  llamar<{ id: string; caduca: string }>(`${mascota(petId)}/shares`, { method: "POST", json: { id, sobre, horas } });

export const retirarEnlace = (petId: string, id: string) =>
  llamar<{ ok: true }>(`${mascota(petId)}/shares/${encodeURIComponent(id)}`, { method: "DELETE" });
