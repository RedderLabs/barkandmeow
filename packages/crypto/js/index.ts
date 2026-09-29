/* Envoltorio del núcleo bm_crypto (Rust → WASM) para el navegador y Node.

   El .wasm no importa nada: ni wasm-bindgen ni aleatoriedad propia. Nonces,
   prefijos y claves efímeras salen de crypto.getRandomValues aquí fuera. */

export type FalloCripto = "formato" | "autenticacion";

export class ErrorCripto extends Error {
  readonly fallo: FalloCripto;
  constructor(fallo: FalloCripto) {
    super(`bm_crypto: ${fallo}`);
    this.fallo = fallo;
  }
}

type Exports = {
  memory: WebAssembly.Memory;
  bm_reservar(n: number): number;
  bm_liberar(p: number, n: number): void;
  bm_salida_ptr(): number;
  bm_abrir(clave: number, ad: number, adN: number, s: number, sN: number): number;
  bm_cerrar(clave: number, ad: number, adN: number, nonce: number, t: number, tN: number): number;
  bm_abrir_documento(clave: number, ad: number, adN: number, d: number, dN: number): number;
  bm_sellar(destino: number, efimera: number, t: number, tN: number): number;
  bm_abrir_sellado(secreta: number, s: number, sN: number): number;
  bm_publica(secreta: number): number;
  bm_derivar(s: number, sN: number, info: number, infoN: number): number;
  bm_cerrar_documento(clave: number, ad: number, adN: number, prefijo: number, t: number, tN: number): number;
  bm_publica_firma(semilla: number): number;
  bm_firmar(semilla: number, m: number, mN: number): number;
  bm_verificar(publica: number, m: number, mN: number, f: number, fN: number): number;
};

export type Cripto = {
  /** Abre un sobre (resumen de emergencia, copia temporal del historial). */
  abrir(clave: Uint8Array, ad: string, sobre: Uint8Array): Uint8Array;
  /** Cierra un sobre con un nonce aleatorio. */
  cerrar(clave: Uint8Array, ad: string, texto: Uint8Array): Uint8Array;
  /** Abre un documento cifrado en bloques de 1 MiB. */
  abrirDocumento(clave: Uint8Array, ad: string, doc: Uint8Array): Uint8Array;
  /** Cierra un documento en bloques de 1 MiB con un prefijo aleatorio. */
  cerrarDocumento(clave: Uint8Array, ad: string, texto: Uint8Array): Uint8Array;
  /** Sella para una clave pública X25519: solo su dueño lo abre. */
  sellar(destino: Uint8Array, texto: Uint8Array): Uint8Array;
  /** Abre lo sellado con la clave secreta X25519 (lado del dueño). */
  abrirSellado(secreta: Uint8Array, sellado: Uint8Array): Uint8Array;
  /** Clave pública X25519 de una secreta. */
  publica(secreta: Uint8Array): Uint8Array;
  /** HKDF-SHA256 de una semilla a 32 bytes, separando usos por info. */
  derivar(semilla: Uint8Array, info: string): Uint8Array;
  /** Clave pública Ed25519 de una semilla de firma de 32 bytes. */
  publicaFirma(semilla: Uint8Array): Uint8Array;
  /** Firma Ed25519 (64 bytes) de un mensaje. */
  firmar(semilla: Uint8Array, mensaje: Uint8Array): Uint8Array;
  /** true si la firma es de esa clave y de ese mensaje, sin tocar nada. */
  verificar(publica: Uint8Array, mensaje: Uint8Array, firma: Uint8Array): boolean;
};

const texto = new TextEncoder();
const enc = texto;
const azar = (n: number) => crypto.getRandomValues(new Uint8Array(n));

/** Carga el núcleo desde los bytes del .wasm o desde la respuesta de un fetch. */
export async function cargarCripto(
  fuente: BufferSource | Response | Promise<Response>,
): Promise<Cripto> {
  const origen = await fuente;
  const bytes = origen instanceof Response ? await origen.arrayBuffer() : origen;
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const w = instance.exports as unknown as Exports;

  /* Copia cada argumento a la memoria lineal, llama y libera. Los de tamaño
     fijo (claves, nonces) pasan solo el puntero; el resto, puntero y longitud.
     La memoria puede crecer durante la llamada: la vista se crea de nuevo. */
  type Arg = { b: Uint8Array; fijo?: boolean };
  function llamar(args: Arg[], f: (...ptrs: number[]) => number): Uint8Array {
    const reservas = args.map(({ b }) => {
      const p = w.bm_reservar(b.length);
      new Uint8Array(w.memory.buffer, p, b.length).set(b);
      return p;
    });
    try {
      const planos = args.flatMap((a, i) => (a.fijo ? [reservas[i]] : [reservas[i], a.b.length]));
      const n = f(...planos);
      if (n < 0) throw new ErrorCripto(n === -1 ? "formato" : "autenticacion");
      return new Uint8Array(w.memory.buffer, w.bm_salida_ptr(), n).slice();
    } finally {
      reservas.forEach((p, i) => w.bm_liberar(p, args[i].b.length));
    }
  }

  const exigir = (b: Uint8Array, n: number, nombre: string) => {
    if (b.length !== n) throw new TypeError(`${nombre}: se esperaban ${n} bytes`);
  };

  return {
    abrir(clave, ad, sobre) {
      exigir(clave, 32, "clave");
      return llamar([{ b: clave, fijo: true }, { b: texto.encode(ad) }, { b: sobre }], w.bm_abrir);
    },
    cerrar(clave, ad, t) {
      exigir(clave, 32, "clave");
      return llamar(
        [{ b: clave, fijo: true }, { b: texto.encode(ad) }, { b: azar(24), fijo: true }, { b: t }],
        w.bm_cerrar,
      );
    },
    abrirDocumento(clave, ad, doc) {
      exigir(clave, 32, "clave");
      return llamar([{ b: clave, fijo: true }, { b: texto.encode(ad) }, { b: doc }], w.bm_abrir_documento);
    },
    cerrarDocumento(clave, ad, t) {
      exigir(clave, 32, "clave");
      return llamar(
        [{ b: clave, fijo: true }, { b: texto.encode(ad) }, { b: azar(19), fijo: true }, { b: t }],
        w.bm_cerrar_documento,
      );
    },
    abrirSellado(secreta, sellado) {
      exigir(secreta, 32, "clave secreta");
      return llamar([{ b: secreta, fijo: true }, { b: sellado }], w.bm_abrir_sellado);
    },
    derivar(semilla, info) {
      return llamar([{ b: semilla }, { b: texto.encode(info) }], w.bm_derivar);
    },
    publica(secreta) {
      exigir(secreta, 32, "clave secreta");
      return llamar([{ b: secreta, fijo: true }], w.bm_publica);
    },
    publicaFirma(semilla) {
      exigir(semilla, 32, "semilla de firma");
      return llamar([{ b: semilla, fijo: true }], w.bm_publica_firma);
    },
    firmar(semilla, m) {
      exigir(semilla, 32, "semilla de firma");
      return llamar([{ b: semilla, fijo: true }, { b: m }], w.bm_firmar);
    },
    verificar(publica, m, firma) {
      if (publica.length !== 32) return false;
      try {
        llamar([{ b: publica, fijo: true }, { b: m }, { b: firma }], w.bm_verificar);
        return true;
      } catch (e) {
        if (e instanceof ErrorCripto) return false;
        throw e;
      }
    },
    sellar(destino, t) {
      exigir(destino, 32, "clave pública");
      return llamar([{ b: destino, fijo: true }, { b: azar(32), fijo: true }, { b: t }], w.bm_sellar);
    },
  };
}

/* ── Claves en el fragmento de la URL ─────────────────────────
   32 bytes en base64url sin relleno: 43 caracteres tras el #. */

export function aBase64Url(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function deBase64(s: string): Uint8Array | null {
  try {
    const std = s.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(std + "=".repeat((4 - (std.length % 4)) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** La clave del fragmento, o null si no tiene la forma de una clave. */
export function claveDeFragmento(fragmento: string): Uint8Array | null {
  const limpio = fragmento.replace(/^#/, "").trim();
  if (!/^[A-Za-z0-9_-]{43}$/.test(limpio)) return null;
  const b = deBase64(limpio);
  return b && b.length === 32 ? b : null;
}

/** Datos asociados: atan cada bloque a su nivel y a su identificador. */
export const ad = {
  emergencia: (id: string) => `bm:e:v1:${id}`,
  historial: (id: string) => `bm:s:v1:${id}`,
  documento: (id: string) => `bm:d:v1:${id}`,
  /** El pasaporte del dueño, cifrado con su clave (ver clavePasaporte). */
  pasaporte: (petId: string) => `bm:p:v1:${petId}`,
  /** El pasaporte compartido para un viaje, con la clave del fragmento. */
  pasaporteCompartido: (id: string) => `bm:pv:v1:${id}`,
};

/* ── Registros firmados ──────────────────────────────────────
   La clínica firma el JSON del registro con Ed25519 y lo sella para el dueño.
   La firma cubre los bytes exactos del texto: se guarda el texto, no el objeto,
   y nadie tiene que volver a serializarlo igual para comprobarla. */

export type Firmado = { version: 1; tipo: "firmado"; registro: string; firma: string; clave: string };

export function firmarRegistro(cripto: Cripto, semilla: Uint8Array, registro: object): Firmado {
  const texto = JSON.stringify(registro);
  return {
    version: 1,
    tipo: "firmado",
    registro: texto,
    firma: aBase64(cripto.firmar(semilla, enc.encode(texto))),
    clave: aBase64(cripto.publicaFirma(semilla)),
  };
}

/** true si `firma` es de `clave` sobre `registro`. No dice de quién es la clave. */
export function firmaValida(cripto: Cripto, f: { registro: string; firma: string; clave: string }): boolean {
  const firma = deBase64(f.firma);
  const clave = deBase64(f.clave);
  if (!firma || !clave || firma.length !== 64 || clave.length !== 32) return false;
  return cripto.verificar(clave, enc.encode(f.registro), firma);
}

/** Clave simétrica del pasaporte, derivada de la secreta X25519 del dueño:
    el mismo papel la reconstruye en cualquier navegador. */
export const clavePasaporte = (cripto: Cripto, secretaDueno: Uint8Array) =>
  cripto.derivar(secretaDueno, "bm:dueno:pasaporte:v1");

export function aBase64(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}

/* Código de recuperación de la clave de la clínica.

   8 bloques de 4 caracteres en base32 Crockford (sin I, L, O ni U, que se
   confunden al copiar a mano): 160 bits = 150 aleatorios + 10 de comprobación.
   La comprobación detecta una errata al teclearlo en vez de derivar en
   silencio otra clave. La clave X25519 de la clínica se deriva de los 150 bits
   con HKDF-SHA256 (bm_derivar), así que el papel ES la clave. */

/* Constantes BigInt sin literales 123n: las webs compilan para ES2017. */
const N0 = BigInt(0);
const N1 = BigInt(1);
const N5 = BigInt(5);
const N6 = BigInt(6);
const N8 = BigInt(8);
const N10 = BigInt(10);
const N31 = BigInt(31);
const N150 = BigInt(150);
const N255 = BigInt(255);

const ALFABETO = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const BITS_SEMILLA = N150;
const BITS_CHECK = N10;
const INFO_CLINICA = "bm:clinica:x25519:v1";

export type CodigoRecuperacion = {
  /** Los 8 bloques, tal como se imprimen. */
  bloques: string[];
  /** 19 bytes (152 bits, los 2 más altos a cero) de los que se deriva la clave. */
  semilla: Uint8Array;
};

const aBytes = (n: bigint, largo: number) => {
  const b = new Uint8Array(largo);
  for (let i = largo - 1; i >= 0; i--) {
    b[i] = Number(n & N255);
    n >>= N8;
  }
  return b;
};
const aEntero = (b: Uint8Array) => b.reduce((n, x) => (n << N8) | BigInt(x), N0);

async function comprobacion(semilla: Uint8Array): Promise<bigint> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", semilla as BufferSource));
  return ((BigInt(h[0]) << N8) | BigInt(h[1])) >> N6; // 10 bits
}

async function codificar(semilla: Uint8Array): Promise<string[]> {
  let n = (aEntero(semilla) << BITS_CHECK) | (await comprobacion(semilla));
  const caracteres: string[] = [];
  for (let i = 0; i < 32; i++) {
    caracteres.unshift(ALFABETO[Number(n & N31)]);
    n >>= N5;
  }
  return Array.from({ length: 8 }, (_, i) => caracteres.slice(i * 4, i * 4 + 4).join(""));
}

/** Un código nuevo, con azar del sistema. */
export async function nuevoCodigo(): Promise<CodigoRecuperacion> {
  const azar = crypto.getRandomValues(new Uint8Array(19));
  azar[0] &= 0b0011_1111; // 152 → 150 bits
  return { bloques: await codificar(azar), semilla: azar };
}

/** La semilla de un código tecleado, o null si no es válido o tiene una errata. */
export async function leerCodigo(texto: string): Promise<Uint8Array | null> {
  const limpio = texto
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (!/^[0-9A-HJKMNP-TV-Z]{32}$/.test(limpio)) return null;
  let n = N0;
  for (const c of limpio) n = (n << N5) | BigInt(ALFABETO.indexOf(c));
  const check = n & ((N1 << BITS_CHECK) - N1);
  const valor = n >> BITS_CHECK;
  if (valor >> BITS_SEMILLA) return null;
  const semilla = aBytes(valor, 19);
  return (await comprobacion(semilla)) === check ? semilla : null;
}

/** El par X25519 de la clínica que corresponde a un código. */
export function claveDeClinica(cripto: Cripto, semilla: Uint8Array) {
  const secreta = cripto.derivar(semilla, INFO_CLINICA);
  return { secreta, publica: cripto.publica(secreta) };
}

/** El par X25519 del dueño que corresponde a su código. Otro uso, otra clave:
    el mismo papel no sirve a la vez de clave de clínica y de dueño. */
export function claveDeDueno(cripto: Cripto, semilla: Uint8Array) {
  const secreta = cripto.derivar(semilla, "bm:dueno:x25519:v1");
  return { secreta, publica: cripto.publica(secreta) };
}
