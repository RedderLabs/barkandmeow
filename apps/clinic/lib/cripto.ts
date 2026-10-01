import { cargarCripto, type Cripto } from "@barkandmeow/crypto";
import { CRYPTO_WASM_URL } from "@/lib/crypto-url";

/* El núcleo se carga una vez por pestaña, la primera vez que alguien lo pide. */
let nucleo: Promise<Cripto> | null = null;
export const cripto = () => (nucleo ??= cargarCripto(fetch(CRYPTO_WASM_URL)));

export const igual = (a: Uint8Array, b: Uint8Array | null) =>
  !!b && a.length === b.length && a.every((x, i) => x === b[i]);

/** Se emite cuando la clave de la clínica llega a este navegador. */
export const CLAVE_LISTA = "bm:clave-clinica";
