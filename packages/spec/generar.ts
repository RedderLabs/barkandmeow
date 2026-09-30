/* Regenera openapi.yaml desde el catálogo de packages/schema/src/api.
   `pnpm spec` en la raíz. El test de contrato de apps/api falla si el
   archivo se queda atrás. */
import { writeFileSync } from "node:fs";
import { stringify } from "yaml";
import { generarOpenApi } from "@barkandmeow/schema/api/openapi";

const doc = generarOpenApi([
  { url: "https://barkandmeow.app/api", description: "Producción" },
  { url: "http://127.0.0.1:4601", description: "Desarrollo" },
]);
writeFileSync(new URL("./openapi.yaml", import.meta.url), stringify(doc, { lineWidth: 0 }));
console.log(`openapi.yaml: ${Object.keys(doc.paths).length} rutas`);
