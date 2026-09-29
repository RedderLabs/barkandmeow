import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomInt,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { crearCliente } from "@barkandmeow/db";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@barkandmeow/db/schema";

const scrypt = promisify(scryptCb);

export const env = {
  port: Number(process.env.PORT ?? 4600 + 1),
  databaseUrl:
    process.env.DATABASE_URL ?? "postgres://barkandmeow:barkandmeow_dev@127.0.0.1:5443/barkandmeow",
  pepperUrl: process.env.PEPPER_URL ?? "",
  pepperToken: process.env.PEPPER_TOKEN ?? "",
  pepperLocal: process.env.CHIP_PEPPER_LOCAL ?? "",
  sessionDays: Number(process.env.SESSION_DAYS ?? 30),
  /** Suelo de tiempo de la respuesta del nivel 0, en ms. */
  lookupBudgetMs: Number(process.env.LOOKUP_BUDGET_MS ?? 120),
  /** Dónde vive el SaaS de clínicas: los enlaces de los correos apuntan aquí. */
  clinicWebUrl: (process.env.CLINIC_WEB_URL ?? "http://localhost:4510/clinica").replace(/\/$/, ""),
  /** El portal del dueño: los correos al titular de un chip enlazan aquí. */
  portalWebUrl: (process.env.PORTAL_WEB_URL ?? "http://localhost:4510/mi-mascota").replace(/\/$/, ""),
  /** Secreto de los tokens de aviso del nivel 0. */
  avisoSecret: process.env.AVISO_SECRET ?? "",
  /** Orígenes de la web del veterinario que pueden consultar el nivel 0. */
  vetOrigins: (process.env.VET_ORIGINS ?? "http://localhost:4510,http://127.0.0.1:4510")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
};

const cliente = crearCliente(env.databaseUrl);
export const db = drizzle(cliente, { schema });

/** Cierra el pool. Sin esto el proceso no termina al acabar los tests. */
export const cerrarDb = () => cliente.end();

/* ── Pepper ───────────────────────────────────────────────────
   El pepper vive en otro proceso. La API pide índices, nunca el pepper.
   El modo local existe solo para desarrollo y avisa cada vez. */

let avisoLocalDado = false;

export async function indexar(valores: string[]): Promise<Buffer[]> {
  if (env.pepperUrl) {
    const r = await fetch(new URL("/index", env.pepperUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(env.pepperToken ? { "x-pepper-token": env.pepperToken } : {}),
      },
      body: JSON.stringify({ valores }),
    });
    if (!r.ok) throw new Error(`pepper respondió ${r.status}`);
    const { indices } = (await r.json()) as { indices: string[] };
    return indices.map((i) => Buffer.from(i, "base64"));
  }

  if (!env.pepperLocal) {
    throw new Error(
      "Sin PEPPER_URL ni CHIP_PEPPER_LOCAL: el índice de chips no puede calcularse.",
    );
  }
  if (!avisoLocalDado) {
    avisoLocalDado = true;
    console.warn(
      "[pepper] modo local: el pepper está en el mismo proceso que la API. Solo para desarrollo.",
    );
  }
  return valores.map((v) =>
    createHmac("sha256", env.pepperLocal).update(v).digest(),
  );
}

/* ── Número de comparación ────────────────────────────────────
   BLAKE2b sobre las dos claves públicas y el id de la petición, truncado a
   20 bits y presentado como seis dígitos. No es secreto y no abre nada:
   su única función es que el dueño detecte a un intermediario. */

export function numeroComparacion(
  vetPubKey: Buffer,
  ownerPubKey: Buffer,
  requestId: string,
): string {
  const h = createHash("blake2b512")
    .update(vetPubKey)
    .update(ownerPubKey)
    .update(Buffer.from(requestId))
    .digest();
  const n = h.readUInt32BE(0) % 1_000_000;
  return String(n).padStart(6, "0");
}

/* ── Token de aviso del nivel 0 ───────────────────────────────
   La web del veterinario no tiene sesión. Para avisar al dueño después de una
   consulta, el nivel 0 entrega un token: el petId y su caducidad cifrados con
   AES-256-GCM. No se guarda nada. Si no hay ficha se entrega un señuelo de la
   misma longitud, que al canjearse se descarta en silencio. */

const AVISO_VIGENCIA_MS = 30 * 60 * 1000;
const AVISO_BYTES = 12 + 16 + 4 + 16; // iv + uuid + caducidad + etiqueta
let avisoLocalAvisado = false;

function claveAviso(): Buffer {
  if (!env.avisoSecret) {
    // En producción, un secreto conocido permitiría falsificar tokens de aviso.
    if (process.env.NODE_ENV === "production")
      throw new Error("falta AVISO_SECRET: obligatorio en producción (ver .env.example)");
    if (!avisoLocalAvisado) {
      avisoLocalAvisado = true;
      console.warn("[aviso] sin AVISO_SECRET: se usa un secreto de desarrollo.");
    }
  }
  return createHash("sha256").update(env.avisoSecret || "aviso_dev_no_usar_en_produccion").digest();
}

export function firmarAviso(petId: string, ahora = Date.now()): string {
  const iv = randomBytes(12);
  const claro = Buffer.alloc(20);
  Buffer.from(petId.replace(/-/g, ""), "hex").copy(claro, 0);
  claro.writeUInt32BE(Math.floor((ahora + AVISO_VIGENCIA_MS) / 1000), 16);
  const c = createCipheriv("aes-256-gcm", claveAviso(), iv);
  const cifrado = Buffer.concat([c.update(claro), c.final()]);
  return Buffer.concat([iv, cifrado, c.getAuthTag()]).toString("base64url");
}

export const senueloAviso = () => randomBytes(AVISO_BYTES).toString("base64url");

/** El petId del token, o null si es un señuelo, está manipulado o caducó. */
export function leerAviso(token: string, ahora = Date.now()): string | null {
  const b = Buffer.from(token, "base64url");
  if (b.length !== AVISO_BYTES) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", claveAviso(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(32));
    const claro = Buffer.concat([d.update(b.subarray(12, 32)), d.final()]);
    if (claro.readUInt32BE(16) * 1000 < ahora) return null;
    const h = claro.subarray(0, 16).toString("hex");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  } catch {
    return null;
  }
}

/* ── Contraseñas y sesiones ───────────────────────────────── */

export async function hashPassword(clave: string): Promise<string> {
  const sal = randomBytes(16);
  const derivada = (await scrypt(clave, sal, 64)) as Buffer;
  return `scrypt$${sal.toString("base64")}$${derivada.toString("base64")}`;
}

export async function verificarPassword(
  clave: string,
  guardada: string | null,
): Promise<boolean> {
  if (!guardada) return false;
  const [alg, salB64, hashB64] = guardada.split("$");
  if (alg !== "scrypt") return false;
  const derivada = (await scrypt(
    clave,
    Buffer.from(salB64, "base64"),
    64,
  )) as Buffer;
  const esperada = Buffer.from(hashB64, "base64");
  return (
    derivada.length === esperada.length && timingSafeEqual(derivada, esperada)
  );
}

export function nuevoToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: createHash("sha256").update(token).digest("hex") };
}

export const hashToken = (t: string) =>
  createHash("sha256").update(t).digest("hex");

/** Espera hasta agotar el presupuesto, para que el tiempo no delate el resultado. */
export async function gastarPresupuesto(desde: number, ms: number) {
  const resto = ms - (Date.now() - desde);
  if (resto > 0) await new Promise((r) => setTimeout(r, resto));
}

/* ── Correo ───────────────────────────────────────────────────
   SMTP por nodemailer. En desarrollo, la bandeja de pruebas de Mailtrap
   (sandbox.smtp.mailtrap.io:2525; nada sale a destinatarios reales); en
   producción, Resend (smtp.resend.com:465, usuario "resend", la API key como
   contraseña). Sin SMTP_HOST no hay a dónde enviar y el envío falla. Los
   tests sustituyen el cartero y leen el código sin pasar por la red. */

export type Carta = { para: string; asunto: string; texto: string };
export type Cartero = (c: Carta) => Promise<void>;

let transporte: import("nodemailer").Transporter | null = null;
let cartero: Cartero = async (c) => {
  if (!transporte) {
    const host = process.env.SMTP_HOST;
    if (!host) throw new Error("correo sin configurar: falta SMTP_HOST (ver .env.example)");
    const port = Number(process.env.SMTP_PORT ?? 587);
    const nodemailer = await import("nodemailer");
    transporte = nodemailer.createTransport({
      host,
      port,
      // 465 es TLS desde el primer byte; el resto negocia STARTTLS.
      secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" } : undefined,
    });
  }
  await transporte.sendMail({
    from: process.env.MAIL_FROM ?? "Bark & Meow <no-responder@barkandmeow.app>",
    to: c.para,
    subject: c.asunto,
    text: c.texto,
  });
};

export const enviarCorreo = (c: Carta) => cartero(c);

export function usarCartero(c: Cartero) {
  cartero = c;
}

/* ── Código de verificación del correo ────────────────────────
   8 caracteres sin los que se confunden al copiarlos (0/O, 1/I/L, U): unos
   38 bits. Con 15 minutos y 5 intentos, adivinarlo es inviable. */

const ALFABETO_CODIGO = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

export function nuevoCodigoCorreo(): string {
  return Array.from({ length: 8 }, () => ALFABETO_CODIGO[randomInt(ALFABETO_CODIGO.length)]).join("");
}

/** Normaliza lo tecleado: sin guiones ni espacios, en mayúsculas. */
export const normalizarCodigoCorreo = (s: string) => s.toUpperCase().replace(/[\s-]/g, "");

export const hashCodigoCorreo = (memberId: string, codigo: string) =>
  createHash("sha256").update(`${memberId}:${codigo}`).digest("hex");

export function mismoHash(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
