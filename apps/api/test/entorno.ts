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
  if (!existe) await admin.unsafe(`CREATE DATABASE "${nombre.replace(/"/g, "")}"`);
} finally {
  await admin.end();
}

const cliente = crearCliente(pruebas.href);
try {
  await migrate(drizzle(cliente), {
    migrationsFolder: fileURLToPath(new URL("../../../packages/db/migrations", import.meta.url)),
  });
} finally {
  await cliente.end();
}

process.env.DATABASE_URL = pruebas.href;
