/* Los tests vacían tablas enteras: nunca contra la base de desarrollo, donde
   viven la clínica y las cuentas de demostración. Este preload se carga antes
   que la API y la apunta a una base propia (la de desarrollo con el sufijo
   _test, o DATABASE_URL_TEST), que crea y migra si hace falta. */
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { crearCliente } from "@barkandmeow/db";

const desarrollo = new URL(
  process.env.DATABASE_URL ?? "postgres://barkandmeow:barkandmeow_dev@127.0.0.1:5443/barkandmeow",
);
const pruebas = new URL(process.env.DATABASE_URL_TEST ?? desarrollo.href);
if (!process.env.DATABASE_URL_TEST) pruebas.pathname = `${desarrollo.pathname}_test`;
if (pruebas.href === desarrollo.href) throw new Error("los tests no pueden usar la base de desarrollo");

const nombre = pruebas.pathname.slice(1);
const admin = crearCliente(desarrollo.href);
try {
  const [existe] = await admin`SELECT 1 FROM pg_database WHERE datname = ${nombre}`;
  // Otro proceso de test puede crearla a la vez: si ya existe, vale.
  if (!existe)
    await admin.unsafe(`CREATE DATABASE "${nombre.replace(/"/g, "")}"`).catch((e: { code?: string }) => {
      if (e.code !== "42P04" && e.code !== "23505") throw e;
    });
} finally {
  await admin.end();
}

/* Cada archivo de test corre en su propio proceso y todos migran a la vez: con
   una migración nueva, dos la aplicaban en paralelo y uno fallaba. Un candado
   de Postgres los pone en fila; una sola conexión, para que el candado y la
   migración vayan por la misma sesión. */
const cliente = crearCliente(pruebas.href, 1);
try {
  await cliente`SELECT pg_advisory_lock(4242001)`;
  await migrate(drizzle(cliente), {
    migrationsFolder: fileURLToPath(new URL("../../../packages/db/migrations", import.meta.url)),
  });
  await cliente`SELECT pg_advisory_unlock(4242001)`;
} finally {
  await cliente.end();
}

process.env.DATABASE_URL = pruebas.href;
process.env.VALIDAR_CONTRATO ??= "1";
process.env.DOCS ??= "off";
