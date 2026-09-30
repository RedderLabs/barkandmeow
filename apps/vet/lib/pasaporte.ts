/* El pasaporte de viaje que comparte el dueño: /p/<id>#<clave>.

   Igual que la copia del historial (nivel 2): el servidor entrega un bloque
   que no puede abrir y la clave viaja en el fragmento. Además, cada registro
   de clínica trae su firma Ed25519, que se comprueba aquí; de quién es cada
   clave lo dice el directorio público de la API (/firmas/v1).

   Sin zod: esta web tiene un presupuesto de peso, y lo que llega se valida
   campo a campo con lo justo para pintarlo sin sorpresas. */

import { ad, cargarCripto, claveDeFragmento, deBase64, ErrorCripto, firmaValida, type Cripto } from "@barkandmeow/crypto";
import { ErrorApi } from "@barkandmeow/schema/cliente";
import { cliente, rutas } from "./api";
import { CRYPTO_WASM_URL } from "./crypto-url";
import { ErrorFicha, type Enlace } from "./ficha";

export type RegistroViaje = {
  tipo: "vacuna" | "desparasitacion" | "titulacion";
  chip: string;
  fecha: string;
  clinica: string;
  veterinario: string;
  enfermedad?: "rabia" | "otra";
  nombre?: string;
  producto?: string;
  lote?: string;
  validaHasta?: string;
  contra?: "equinococo" | "otra";
  hora?: string;
  resultado?: number;
  laboratorio?: string;
  fechaMuestra?: string;
};

export type Firmante = {
  clinica: string;
  pais: string;
  dominio: string | null;
  retirada: string | null;
};

export type Comprobacion =
  | { estado: "ok"; firmante: Firmante }
  | { estado: "mala" }
  | { estado: "desconocida" }
  | { estado: "otro-chip" };

export type Certificado = { registro: RegistroViaje; comprobacion: Comprobacion };

export type PasaporteAbierto = {
  nombre: string;
  especie: string;
  chip: string;
  numeroPasaporte: string;
  generado: string;
  caduca: string;
  certificados: Certificado[];
  declarados: RegistroViaje[];
};

const texto = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");
const fechaIso = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

/** Un registro de viaje, o null si no tiene la forma de uno. */
function leerRegistro(v: unknown): RegistroViaje | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  if (r.tipo !== "vacuna" && r.tipo !== "desparasitacion" && r.tipo !== "titulacion") return null;
  const fecha = fechaIso(r.fecha);
  if (!fecha) return null;
  return {
    tipo: r.tipo,
    chip: texto(r.chip, 23),
    fecha,
    clinica: texto(r.clinica),
    veterinario: texto(r.veterinario),
    enfermedad: r.enfermedad === "rabia" ? "rabia" : r.enfermedad === "otra" ? "otra" : undefined,
    nombre: texto(r.nombre),
    producto: texto(r.producto),
    lote: texto(r.lote, 60),
    validaHasta: fechaIso(r.validaHasta) || undefined,
    contra: r.contra === "equinococo" ? "equinococo" : r.contra === "otra" ? "otra" : undefined,
    hora: typeof r.hora === "string" && /^\d{2}:\d{2}$/.test(r.hora) ? r.hora : undefined,
    resultado: typeof r.resultado === "number" && Number.isFinite(r.resultado) ? r.resultado : undefined,
    laboratorio: texto(r.laboratorio),
    fechaMuestra: fechaIso(r.fechaMuestra) || undefined,
  };
}

let nucleo: Promise<Cripto> | null = null;
function cripto(): Promise<Cripto> {
  nucleo ??= cargarCripto(fetch(CRYPTO_WASM_URL)).catch(() => {
    nucleo = null;
    throw new ErrorFicha("noDisponible");
  });
  return nucleo;
}

/** La copia compartida; los errores de la API en el idioma de la ficha. */
async function leerCopia(id: string) {
  try {
    return await cliente.llamar(rutas.leerCopia, { params: { id } });
  } catch (e) {
    if (e instanceof ErrorApi && (e.estado === 404 || e.estado === 410)) throw new ErrorFicha("ausente");
    if (e instanceof ErrorApi) throw new ErrorFicha("red");
    throw e;
  }
}

/** De qué clínica es una clave de firma, según el directorio. null si no está. */
async function firmante(claveB64: string): Promise<Firmante | null> {
  const b = deBase64(claveB64);
  if (!b || b.length !== 32) return null;
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  const url = btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  try {
    const j = (await cliente.llamar(rutas.firmante, { params: { clave: url } })) as Record<string, unknown>;
    return {
      clinica: texto(j.clinica),
      pais: texto(j.pais, 8),
      dominio: typeof j.dominio === "string" ? j.dominio : null,
      retirada: typeof j.retirada === "string" ? j.retirada : null,
    };
  } catch {
    return null;
  }
}

export async function abrirPasaporte(enlace: Enlace): Promise<PasaporteAbierto> {
  const k = enlace.clave ? claveDeFragmento(enlace.clave) : null;
  if (!k) throw new ErrorFicha("enlace");
  const [c, { sobre, caduca }] = await Promise.all([cripto(), leerCopia(enlace.id)]);

  let j: Record<string, unknown>;
  try {
    const bytes = deBase64(sobre);
    if (!bytes) throw new ErrorFicha("clave");
    j = JSON.parse(new TextDecoder().decode(c.abrir(k, ad.pasaporteCompartido(enlace.id), bytes)));
  } catch (e) {
    if (e instanceof ErrorCripto || e instanceof SyntaxError) throw new ErrorFicha("clave");
    throw e;
  }
  if (j.tipo !== "pasaporte" || j.version !== 1) throw new ErrorFicha("clave");

  const chip = texto(j.chip, 23);
  const brutos = Array.isArray(j.certificados) ? j.certificados.slice(0, 300) : [];
  const claves = new Map<string, Promise<Firmante | null>>();

  const certificados = await Promise.all(
    brutos.map(async (x: unknown): Promise<Certificado | null> => {
      const f = x as Record<string, unknown>;
      if (typeof f?.registro !== "string" || typeof f.firma !== "string" || typeof f.clave !== "string") return null;
      let registro: RegistroViaje | null;
      try {
        registro = leerRegistro(JSON.parse(f.registro));
      } catch {
        return null;
      }
      if (!registro) return null;
      if (!firmaValida(c, { registro: f.registro, firma: f.firma, clave: f.clave }))
        return { registro, comprobacion: { estado: "mala" } };
      if (chip && registro.chip && registro.chip !== chip) return { registro, comprobacion: { estado: "otro-chip" } };
      if (!claves.has(f.clave)) claves.set(f.clave, firmante(f.clave));
      const quien = await claves.get(f.clave)!;
      return { registro, comprobacion: quien ? { estado: "ok", firmante: quien } : { estado: "desconocida" } };
    }),
  );

  const declarados = (Array.isArray(j.declarados) ? j.declarados.slice(0, 300) : [])
    .map((d: unknown) => leerRegistro((d as { registro?: unknown })?.registro))
    .filter((d): d is RegistroViaje => !!d);

  return {
    nombre: texto(j.nombre, 60),
    especie: texto(j.especie, 20),
    chip,
    numeroPasaporte: texto(j.numeroPasaporte, 40),
    generado: texto(j.generado, 40),
    caduca,
    certificados: certificados
      .filter((x): x is Certificado => !!x)
      .sort((a, b) => b.registro.fecha.localeCompare(a.registro.fecha)),
    declarados: declarados.sort((a, b) => b.fecha.localeCompare(a.fecha)),
  };
}
