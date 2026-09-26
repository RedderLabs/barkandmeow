import {
  createHash,
  createHmac,
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
