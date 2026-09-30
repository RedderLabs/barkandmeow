import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { todasLasRutas } from "@barkandmeow/schema/api";
import { generarOpenApi } from "@barkandmeow/schema/api/openapi";
import { crearApp } from "../src/index.js";
import { rutasRegistradas } from "../src/contrato.js";

/* El catálogo de packages/schema/src/api es el contrato que usan el portal, la
   app y la clínica. Si alguien añade una ruta al servidor sin catalogarla, o
   deja en el catálogo una que ya no existe, esto falla. Que cada respuesta
   cumpla su esquema lo comprueban el resto de tests (VALIDAR_CONTRATO). */

test("cada ruta del servidor está en el catálogo, y al revés", async () => {
  const app = await crearApp();
  await app.ready();
  try {
    const servidor = new Set(rutasRegistradas.map((r) => `${r.metodo} ${r.ruta}`));
    const catalogo = new Set(todasLasRutas.map((r) => `${r.metodo} ${r.ruta}`));
    assert.deepEqual([...servidor].filter((r) => !catalogo.has(r)).sort(), [], "rutas sin catalogar");
    assert.deepEqual([...catalogo].filter((r) => !servidor.has(r)).sort(), [], "rutas del catálogo que no existen");
  } finally {
    await app.close();
  }
});

test("el catálogo no repite rutas y los errores se documentan", () => {
  const claves = todasLasRutas.map((r) => `${r.metodo} ${r.ruta}`);
  assert.equal(new Set(claves).size, claves.length);
  for (const r of todasLasRutas) {
    assert.ok(r.resumen.length > 0, `${r.metodo} ${r.ruta} sin resumen`);
    assert.ok(r.respuesta || r.respuestaBinaria, `${r.metodo} ${r.ruta} sin respuesta`);
  }
});

test("el documento OpenAPI se genera entero", () => {
  const doc = generarOpenApi();
  const operaciones = Object.values(doc.paths).flatMap((p) => Object.keys(p));
  assert.equal(operaciones.length, todasLasRutas.length);
  // Que ningún esquema haya caído a «cualquier cosa» por no saber traducirse.
  const texto = JSON.stringify(doc);
  assert.ok(!texto.includes('"not":{}'), "esquema irrepresentable");
});

test("packages/spec/openapi.yaml está al día (si falla: pnpm spec)", () => {
  const guardado = parse(readFileSync(new URL("../../../packages/spec/openapi.yaml", import.meta.url), "utf8")) as {
    paths: unknown;
    components: unknown;
  };
  const actual = generarOpenApi();
  assert.deepEqual(guardado.paths, JSON.parse(JSON.stringify(actual.paths)));
  assert.deepEqual(guardado.components, JSON.parse(JSON.stringify(actual.components)));
});
