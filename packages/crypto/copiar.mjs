/* Copia el núcleo (wasm/bm_crypto.wasm) a la carpeta public/crypto de una web
   y escribe lib/crypto-url.ts con su URL. El nombre lleva la huella del
   contenido: se cachea para siempre sin servir nunca uno viejo.

     node ../../packages/crypto/copiar.mjs [--base clinica]

   Se ejecuta desde la carpeta de la app (predev y prebuild). --base es el
   basePath de Next, si la app lo tiene. */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const app = process.cwd();
const i = process.argv.indexOf("--base");
// Sin barra inicial en la línea de órdenes: Git Bash la convertiría en una
// ruta de Windows. Se añade aquí.
const base = i > 0 ? "/" + process.argv[i + 1].replace(/^\/+|\/+$/g, "") : "";

const bytes = readFileSync(join(aqui, "wasm", "bm_crypto.wasm"));
const huella = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
const nombre = `bm_crypto.${huella}.wasm`;

const dir = join(app, "public", "crypto");
mkdirSync(dir, { recursive: true });
for (const f of readdirSync(dir)) rmSync(join(dir, f));
writeFileSync(join(dir, nombre), bytes);
mkdirSync(join(app, "lib"), { recursive: true });
writeFileSync(
  join(app, "lib", "crypto-url.ts"),
  `// GENERADO por packages/crypto/copiar.mjs. No editar a mano.\nexport const CRYPTO_WASM_URL = "${base}/crypto/${nombre}";\n`,
);
console.log(`${nombre} → ${join("public", "crypto")} (${bytes.length} bytes)`);
