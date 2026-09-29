/* Compila el núcleo a WASM y deja el binario en wasm/bm_crypto.wasm, que se
   versiona: así la web del veterinario se construye sin Rust instalado.

   En Windows sin Visual Studio, la toolchain MSVC no tiene enlazador para los
   build scripts; se usa la GNU, que trae el suyo. CARGO_TOOLCHAIN lo fuerza. */

import { execFileSync } from "node:child_process";
import { copyFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const toolchain =
  process.env.CARGO_TOOLCHAIN ??
  (process.platform === "win32" ? "stable-x86_64-pc-windows-gnu" : null);
const cargo = (...args) =>
  execFileSync("cargo", toolchain ? [`+${toolchain}`, ...args] : args, {
    cwd: aqui,
    stdio: "inherit",
  });

if (process.argv.includes("--test")) cargo("test", "--release");

cargo("build", "--release", "--target", "wasm32-unknown-unknown");
const origen = join(aqui, "target", "wasm32-unknown-unknown", "release", "bm_crypto.wasm");
const destino = join(aqui, "wasm", "bm_crypto.wasm");
copyFileSync(origen, destino);
console.log(`bm_crypto.wasm → wasm/ (${statSync(destino).size} bytes)`);
