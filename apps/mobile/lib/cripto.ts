/* El núcleo criptográfico del dueño, en JavaScript puro para Hermes.

   La web usa packages/crypto (Rust → WASM). En el móvil no hay WebAssembly en
   Hermes, así que esto replica, byte a byte, lo que el dueño necesita de él:

   - derivar la clave X25519 del código de recuperación en papel,
   - abrir lo sellado (crypto_box_seal de libsodium),
   - comprobar firmas Ed25519 de los registros de la clínica.

   test/cripto.test.ts lo compara contra el .wasm real: si alguien cambia el
   Rust sin cambiar esto, el test lo dice. Solo abre y comprueba: el dueño no
   sella ni firma desde aquí, así que no hace falta aleatoriedad. */

import { hsalsa, xsalsa20poly1305 } from "@noble/ciphers/salsa.js";
import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { blake2b } from "@noble/hashes/blake2.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";

export class ErrorCripto extends Error {
  readonly fallo: "formato" | "autenticacion";
  constructor(fallo: "formato" | "autenticacion") {
    super(`cripto: ${fallo}`);
    this.fallo = fallo;
  }
}

const enc = new TextEncoder();

/* ── Derivación ─────────────────────────────────────────────── */

/** HKDF-SHA256 sin sal, 32 bytes: lo mismo que `derivar` en lib.rs. */
export const derivar = (semilla: Uint8Array, info: string): Uint8Array =>
  hkdf(sha256, semilla, undefined, enc.encode(info), 32);

/** Clave pública X25519 de una secreta. */
export const publica = (secreta: Uint8Array): Uint8Array => x25519.getPublicKey(secreta);

/** El par X25519 del dueño que corresponde a la semilla de su código. */
export function claveDeDueno(semilla: Uint8Array) {
  const secreta = derivar(semilla, "bm:dueno:x25519:v1");
  return { secreta, publica: publica(secreta) };
}

/** Par Ed25519 de recuperación: lo mismo que `claveDeRecuperacion` de packages/crypto. */
export function claveDeRecuperacion(secretaDueno: Uint8Array) {
  const semilla = derivar(secretaDueno, "bm:dueno:ed25519:recuperacion:v1");
  return { semilla, publica: ed25519.getPublicKey(semilla) };
}

/* ── Código de recuperación ─────────────────────────────────
   8 bloques de 4 en base32 Crockford: 150 bits de semilla + 10 de
   comprobación (los 10 bits altos de SHA-256 de la semilla). Igual que
   leerCodigo en packages/crypto/js/index.ts. */

const ALFABETO = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const N0 = BigInt(0);
const N1 = BigInt(1);
const N5 = BigInt(5);
const N6 = BigInt(6);
const N8 = BigInt(8);
const N10 = BigInt(10);
const N150 = BigInt(150);
const N255 = BigInt(255);

const comprobacion = (semilla: Uint8Array) => {
  const h = sha256(semilla);
  return ((BigInt(h[0]) << N8) | BigInt(h[1])) >> N6;
};

/** La semilla de un código tecleado, o null si no es válido o tiene una errata. */
export function leerCodigo(texto: string): Uint8Array | null {
  const limpio = texto
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (!/^[0-9A-HJKMNP-TV-Z]{32}$/.test(limpio)) return null;
  let n = N0;
  for (const c of limpio) n = (n << N5) | BigInt(ALFABETO.indexOf(c));
  const check = n & ((N1 << N10) - N1);
  let valor = n >> N10;
  if (valor >> N150) return null;
  const semilla = new Uint8Array(19);
  for (let i = 18; i >= 0; i--) {
    semilla[i] = Number(valor & N255);
    valor >>= N8;
  }
  return comprobacion(semilla) === check ? semilla : null;
}

/* ── Sellado (crypto_box_seal) ──────────────────────────────
   sellado = clave efímera pública (32) ‖ caja. La caja es XSalsa20-Poly1305
   con la clave de crypto_box (HSalsa20 del secreto X25519) y el nonce
   BLAKE2b-192(efímera ‖ destinatario). */

const palabras = (b: Uint8Array) => {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return Uint32Array.from({ length: b.length / 4 }, (_, i) => v.getUint32(i * 4, true));
};
const SIGMA = palabras(enc.encode("expand 32-byte k"));

function claveDeCaja(secreta: Uint8Array, otra: Uint8Array): Uint8Array {
  const compartido = x25519.getSharedSecret(secreta, otra);
  const salida = new Uint32Array(8);
  hsalsa(SIGMA, palabras(compartido), new Uint32Array(4), salida);
  const clave = new Uint8Array(32);
  const v = new DataView(clave.buffer);
  salida.forEach((w, i) => v.setUint32(i * 4, w, true));
  return clave;
}

export function abrirSellado(secreta: Uint8Array, sellado: Uint8Array): Uint8Array {
  if (secreta.length !== 32) throw new TypeError("clave secreta: se esperaban 32 bytes");
  if (sellado.length < 32 + 16) throw new ErrorCripto("formato");
  const efimera = sellado.subarray(0, 32);
  const destino = publica(secreta);
  const nonce = blake2b(new Uint8Array([...efimera, ...destino]), { dkLen: 24 });
  try {
    return xsalsa20poly1305(claveDeCaja(secreta, efimera), nonce).decrypt(sellado.subarray(32));
  } catch {
    throw new ErrorCripto("autenticacion");
  }
}

/* ── Firmas Ed25519 ─────────────────────────────────────────── */

/** true si la firma es de esa clave sobre ese mensaje. Modo estricto, como verify_strict. */
export function verificar(clavePub: Uint8Array, mensaje: Uint8Array, firma: Uint8Array): boolean {
  if (clavePub.length !== 32 || firma.length !== 64) return false;
  try {
    return ed25519.verify(firma, mensaje, clavePub, { zip215: false });
  } catch {
    return false;
  }
}

/** Un registro firmado por la clínica: la firma cubre los bytes exactos de `registro`. */
export function firmaValida(f: { registro: string; firma: string; clave: string }): boolean {
  const firma = deBase64(f.firma);
  const clave = deBase64(f.clave);
  if (!firma || !clave) return false;
  return verificar(clave, enc.encode(f.registro), firma);
}

/* ── Base64 ─────────────────────────────────────────────────
   Propio y no atob/btoa: así no depende de qué trae cada versión de Hermes. */

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function aBase64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    s += i + 1 < b.length ? B64[(n >> 6) & 63] : "=";
    s += i + 2 < b.length ? B64[n & 63] : "=";
  }
  return s;
}

/** Acepta base64 estándar o base64url, con o sin relleno. null si no lo es. */
export function deBase64(s: string): Uint8Array | null {
  const limpio = s.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  if (!/^[A-Za-z0-9+/]*$/.test(limpio) || limpio.length % 4 === 1) return null;
  const salida = new Uint8Array(Math.floor((limpio.length * 3) / 4));
  let bits = 0;
  let acumulado = 0;
  let j = 0;
  for (const c of limpio) {
    acumulado = (acumulado << 6) | B64.indexOf(c);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      salida[j++] = (acumulado >> bits) & 255;
    }
  }
  return salida;
}

export const iguales = (a: Uint8Array | null, b: Uint8Array | null) =>
  !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);
