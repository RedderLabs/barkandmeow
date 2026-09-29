/* La ficha que abre la web del veterinario en los niveles 1 y 2.

   El enlace es siempre /<nivel>/<id>#<clave>: `e` para la placa del collar
   (nivel 1) y `s` para el QR de acceso temporal (nivel 2). El fragmento `#`
   nunca sale del navegador, así que el servidor solo entrega bloques cifrados
   que no puede abrir; se descifran aquí.

   El descifrado lo hace packages/crypto (Rust → WASM). Cada bloque va atado a
   su id por los datos asociados: si el servidor sirviera la ficha de otra
   placa, el descifrado fallaría. La ficha de ejemplo (`/e/ejemplo`,
   `/s/ejemplo`) no toca el servidor y se marca como tal en pantalla. */

import type { Idioma } from "@barkandmeow/i18n";
import {
  ad,
  cargarCripto,
  claveDeFragmento,
  deBase64,
  ErrorCripto,
  type Cripto,
} from "@barkandmeow/crypto";
import { API_URL } from "./api";
import { CRYPTO_WASM_URL } from "./crypto-url";

/* ── Modelo ─────────────────────────────────────────────────── */

/** Término de catálogo (VeNom, ATCvet) ya traducido a los cuatro idiomas.
    Lo estructurado se traduce; el texto libre, no. */
export type Termino = Record<Idioma, string>;

export type Procedencia = "dueno" | "clinica" | "veterinario";
export type Gravedad = "alta" | "media" | "baja";

export type Animal = {
  nombre: string;
  /** Código del catálogo de especies de packages/schema. */
  especie: string;
  sexo: "hembra" | "macho";
  esterilizado: boolean;
  /* Los formatea la app del dueño; en la ficha de ejemplo son huecos. */
  raza: string;
  edad: string;
  pesoKg: string;
  /** Tal como lo dicta el lector, sin espacios. */
  chip: string | null;
};

export type Alergia = {
  /** Principio activo, nunca marca comercial. */
  sustancia: string;
  reaccion: Termino;
  gravedad: Gravedad;
  atcvet: string | null;
};

export type Medicacion = {
  principio: string;
  dosis: string;
  cadaHoras: number;
};

/** Lo que el dueño publica para quien encuentre al animal. Va sin cifrar. */
export type Perfil = {
  /** Cómo se llama, si el dueño lo puso en su perfil público. */
  nombre?: string;
  bio: string;
  telefonos: { etiqueta: string; numero: string }[];
  /** URL absoluta de la foto, o null. */
  foto: string | null;
};

export type Resumen = {
  animal: Animal;
  alergias: Alergia[];
  medicacion: Medicacion[];
  cronicas: Termino[];
  /** Fecha ISO hasta la que vale la antirrábica, o null si no consta. */
  rabiaHasta: string | null;
  /** Teléfono del dueño, solo si él decidió incluirlo en la placa. */
  telefono: string | null;
  actualizado: string;
  /** Idioma en el que el dueño escribió el texto libre. */
  idioma: Idioma;
  /** No va en el bloque cifrado: lo añade el servidor si el dueño lo publicó. */
  perfil?: Perfil | null;
};

export type Registro = {
  id: string;
  fecha: string;
  lugar: string;
  procedencia: Procedencia;
  titulo: Termino;
  texto: string | null;
  /** Idioma original del texto libre: se muestra tal cual, con aviso. */
  idiomaTexto: Idioma;
  vacuna: { lote: string; validezMeses: number } | null;
  documento: { nombre: string; sha256: string; blobId: string } | null;
};

export type Historial = {
  resumen: Resumen;
  peso: { kg: string; fecha: string } | null;
  registros: Registro[];
  /** Fecha ISO en la que el acceso deja de valer. */
  caduca: string;
  /** Para sellar la nota de la consulta a nombre del dueño. */
  ownerPubKey: Uint8Array;
};

/* ── Enlace ─────────────────────────────────────────────────── */

export type Enlace = { id: string; clave: string | null; ejemplo: boolean };

export const ID_EJEMPLO = "ejemplo";

/** Lee el id del último tramo de la ruta y la clave del fragmento. */
export function leerEnlace(nivel: "e" | "s"): Enlace | null {
  const tramos = window.location.pathname.split("/").filter(Boolean);
  const i = tramos.lastIndexOf(nivel);
  const id = i >= 0 ? tramos[i + 1] : undefined;
  if (!id) return null;
  const clave = window.location.hash.slice(1) || null;
  return { id: decodeURIComponent(id), clave, ejemplo: id === ID_EJEMPLO };
}

/* ── Carga ──────────────────────────────────────────────────── */

export type FalloFicha =
  | "enlace" // falta la clave del fragmento o el id
  | "ausente" // la placa se desactivó, o el acceso caducó o se revocó
  | "clave" // el bloque no se descifra con esa clave
  | "red"
  | "huella" // el documento no coincide con el que firmó la clínica
  | "noDisponible"; // el núcleo criptográfico no ha podido cargarse

export class ErrorFicha extends Error {
  readonly fallo: FalloFicha;
  constructor(fallo: FalloFicha) {
    super(fallo);
    this.fallo = fallo;
  }
}

/* El núcleo se carga una vez, la primera vez que hace falta. */
let nucleo: Promise<Cripto> | null = null;
function cripto(): Promise<Cripto> {
  nucleo ??= cargarCripto(fetch(CRYPTO_WASM_URL)).catch(() => {
    nucleo = null;
    throw new ErrorFicha("noDisponible");
  });
  return nucleo;
}

function clave(enlace: Enlace): Uint8Array {
  const k = enlace.clave ? claveDeFragmento(enlace.clave) : null;
  if (!k) throw new ErrorFicha("enlace");
  return k;
}

async function pedir(ruta: string, init?: RequestInit): Promise<Response> {
  let r: Response;
  try {
    r = await fetch(`${API_URL}${ruta}`, init);
  } catch {
    throw new ErrorFicha("red");
  }
  if (r.status === 404 || r.status === 410) throw new ErrorFicha("ausente");
  if (!r.ok) throw new ErrorFicha("red");
  return r;
}

function descifrarJson<T>(c: Cripto, k: Uint8Array, datos: string, sobreB64: string): T {
  const sobre = deBase64(sobreB64);
  if (!sobre) throw new ErrorFicha("clave");
  try {
    return JSON.parse(new TextDecoder().decode(c.abrir(k, datos, sobre))) as T;
  } catch (e) {
    // Clave equivocada, bloque de otra placa o manipulado: no se distingue.
    if (e instanceof ErrorCripto || e instanceof SyntaxError) throw new ErrorFicha("clave");
    throw e;
  }
}

type PerfilApi = { bio: string; telefonos: Perfil["telefonos"]; foto: string | null } | null;
const perfilAbsoluto = (p: PerfilApi): Perfil | null =>
  p && { ...p, foto: p.foto ? `${API_URL}${p.foto}` : null };

const aBase64 = (b: Uint8Array) => {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
};

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function abrirResumen(enlace: Enlace): Promise<Resumen> {
  if (enlace.ejemplo) {
    await esperar(350);
    return RESUMEN_EJEMPLO;
  }
  const k = clave(enlace);
  const [c, r] = await Promise.all([cripto(), pedir(`/e/v1/${encodeURIComponent(enlace.id)}`)]);
  const { sobre, perfil } = (await r.json()) as { sobre: string; perfil: PerfilApi };
  const resumen = descifrarJson<Resumen>(c, k, ad.emergencia(enlace.id), sobre);
  return { ...resumen, perfil: perfilAbsoluto(perfil) };
}

export async function abrirHistorial(enlace: Enlace): Promise<Historial> {
  if (enlace.ejemplo) {
    await esperar(450);
    return historialEjemplo();
  }
  const k = clave(enlace);
  const [c, r] = await Promise.all([cripto(), pedir(`/s/v1/${encodeURIComponent(enlace.id)}`)]);
  const { sobre, caduca, ownerPubKey, perfil } = (await r.json()) as {
    sobre: string;
    caduca: string;
    ownerPubKey: string;
    perfil: PerfilApi;
  };
  const datos = descifrarJson<Omit<Historial, "caduca" | "ownerPubKey">>(
    c,
    k,
    ad.historial(enlace.id),
    sobre,
  );
  const clavePublica = deBase64(ownerPubKey);
  if (!clavePublica || clavePublica.length !== 32) throw new ErrorFicha("red");
  return {
    ...datos,
    resumen: { ...datos.resumen, perfil: perfilAbsoluto(perfil) },
    caduca,
    ownerPubKey: clavePublica,
  };
}

export type Nota = {
  motivo: string;
  diagnostico: string;
  tratamiento: string;
  observaciones: string;
  clinica: string;
};

/** Sella la nota a la clave pública del dueño y la envía. El veterinario
    escribe pero no puede volver a leerla. */
export async function enviarNota(
  enlace: Enlace,
  historial: Historial,
  nota: Nota,
  idioma: Idioma,
): Promise<"enviada" | "ejemplo"> {
  if (enlace.ejemplo) {
    await esperar(500);
    return "ejemplo";
  }
  const c = await cripto();
  const claro = JSON.stringify({
    tipo: "nota",
    version: 1,
    fecha: new Date().toISOString(),
    idioma,
    ...nota,
  });
  const sellado = c.sellar(historial.ownerPubKey, new TextEncoder().encode(claro));
  await pedir(`/s/v1/${encodeURIComponent(enlace.id)}/nota`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sellado: aBase64(sellado) }),
  });
  return "enviada";
}

/** Descarga el documento original, lo descifra aquí y comprueba que su huella
    SHA-256 es la que firmó la clínica. Solo entonces lo entrega. */
export async function abrirDocumento(enlace: Enlace, registro: Registro): Promise<Blob> {
  if (enlace.ejemplo || !registro.documento) throw new ErrorFicha("ausente");
  const doc = registro.documento;
  const k = clave(enlace);
  const [c, r] = await Promise.all([
    cripto(),
    pedir(`/s/v1/${encodeURIComponent(enlace.id)}/doc/${encodeURIComponent(doc.blobId)}`),
  ]);
  let claro: Uint8Array;
  try {
    claro = c.abrirDocumento(k, ad.documento(doc.blobId), new Uint8Array(await r.arrayBuffer()));
  } catch (e) {
    if (e instanceof ErrorCripto) throw new ErrorFicha("clave");
    throw e;
  }
  const huella = new Uint8Array(await crypto.subtle.digest("SHA-256", claro as BufferSource));
  const hex = Array.from(huella, (b) => b.toString(16).padStart(2, "0")).join("");
  if (hex !== doc.sha256.toLowerCase()) throw new ErrorFicha("huella");
  return new Blob([claro as BlobPart], { type: "application/pdf" });
}

/* ── Ficha de ejemplo ───────────────────────────────────────────
   La misma del lienzo (diseno/fuente-lienzo). Los huecos entre corchetes son
   huecos a propósito: no hay animales, clínicas ni dueños reales. */

const RESUMEN_EJEMPLO: Resumen = {
  animal: {
    nombre: "[Nombre]",
    especie: "dog",
    sexo: "hembra",
    esterilizado: true,
    raza: "[Raza]",
    edad: "[Edad]",
    pesoKg: "[Peso]",
    chip: "724098100001234",
  },
  alergias: [
    {
      sustancia: "Amoxicilina",
      reaccion: {
        es: "Urticaria generalizada",
        pt: "Urticária generalizada",
        en: "Generalised urticaria",
        fr: "Urticaire généralisée",
      },
      gravedad: "alta",
      atcvet: "QJ01CA04",
    },
  ],
  medicacion: [{ principio: "Omeprazol", dosis: "1 mg/kg", cadaHoras: 24 }],
  cronicas: [],
  rabiaHasta: "2027-03-14",
  telefono: "+34000000000",
  actualizado: "2026-06-02",
  idioma: "es",
};

function historialEjemplo(): Historial {
  // El ejemplo caduca siempre a 71 h 12 min de abrirlo, como en el lienzo.
  const caduca = new Date(Date.now() + (71 * 60 + 12) * 60_000 + 30_000).toISOString();
  return {
    resumen: RESUMEN_EJEMPLO,
    peso: { kg: "[Peso]", fecha: "2026-06-02" },
    caduca,
    // Clave de relleno: la nota de ejemplo nunca se sella ni se envía.
    ownerPubKey: new Uint8Array(32),
    registros: [
      {
        id: "r3",
        fecha: "2026-06-02",
        lugar: "Madrid, ES",
        procedencia: "clinica",
        titulo: { es: "Revisión anual", pt: "Revisão anual", en: "Annual check-up", fr: "Bilan annuel" },
        texto: "Sin alteraciones relevantes. Analítica sanguínea dentro de los valores de referencia.",
        idiomaTexto: "es",
        vacuna: null,
        documento: { nombre: "revision-anual.pdf", blobId: "00000000-0000-4000-8000-000000000000", sha256: "3f9a1c07e2b84d5a9c61f0d2b7e3a8c45d1e9f60b2a7c3d8e4f1a0b9c6d2e21e" },
      },
      {
        id: "r2",
        fecha: "2026-03-14",
        lugar: "Madrid, ES",
        procedencia: "clinica",
        titulo: {
          es: "Vacunación antirrábica",
          pt: "Vacinação antirrábica",
          en: "Rabies vaccination",
          fr: "Vaccination antirabique",
        },
        texto: null,
        idiomaTexto: "es",
        vacuna: { lote: "[lote]", validezMeses: 12 },
        documento: null,
      },
      {
        id: "r1",
        fecha: "2025-11-20",
        lugar: "Madrid, ES",
        procedencia: "dueno",
        titulo: {
          es: "Reacción alérgica a amoxicilina",
          pt: "Reação alérgica à amoxicilina",
          en: "Allergic reaction to amoxicillin",
          fr: "Réaction allergique à l’amoxicilline",
        },
        texto: "Urticaria en todo el cuerpo a las pocas horas de empezar el antibiótico.",
        idiomaTexto: "es",
        vacuna: null,
        documento: null,
      },
    ],
  };
}
