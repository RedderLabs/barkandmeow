import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export * from "./schema.js";
export { schema };

export type Db = ReturnType<typeof crearDb>;

export function crearDb(url: string) {
  const sql = postgres(url, { max: 10 });
  return drizzle(sql, { schema });
}

export function crearCliente(url: string, max = 10) {
  return postgres(url, { max });
}
