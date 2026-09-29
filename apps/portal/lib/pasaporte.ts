import {
  aBase64,
  aBase64Url,
  ad,
  clavePasaporte,
  deBase64,
  firmaValida,
  type Cripto,
} from "@barkandmeow/crypto";
import {
  pasaporteDueno,
  registroClinico,
  sobreFirmado,
  type Certificado,
  type PasaporteDueno,
  type RegistroClinico,
  type RegistroEvaluable,
} from "@barkandmeow/schema";
import { crearEnlace, ErrorApi, guardarPasaporte, leerBandeja, leerPasaporte, type Origen } from "./api";

/* El pasaporte de viaje en el navegador del dueño.

   Se guarda en el servidor cifrado con una clave que sale de su secreta
   X25519 (el código en papel): el servidor ve bytes y un número de versión.
   Los registros firmados llegan por la bandeja; al abrir el pasaporte se
   comprueban y se copian aquí, para que borrar el mensaje no los pierda. */

const enc = new TextEncoder();
const dec = new TextDecoder();

export const VACIO: PasaporteDueno = pasaporteDueno.parse({ version: 1 });

export async function abrirPasaporte(c: Cripto, secreta: Uint8Array, petId: string) {
  const { sobre, version } = await leerPasaporte(petId);
  if (!sobre) return { datos: VACIO, version };
  const bytes = deBase64(sobre);
  if (!bytes) throw new Error("pasaporte mal formado");
  // Si no abre, es otra clave: mejor fallar que enseñar un pasaporte vacío y pisarlo.
  const claro = c.abrir(clavePasaporte(c, secreta), ad.pasaporte(petId), bytes);
  return { datos: pasaporteDueno.parse(JSON.parse(dec.decode(claro))), version };
}

/** Guarda y devuelve la versión nueva. Un 409 sube tal cual: quien llama vuelve a leer. */
export async function guardar(c: Cripto, secreta: Uint8Array, petId: string, datos: PasaporteDueno, version: number) {
  const sobre = c.cerrar(clavePasaporte(c, secreta), ad.pasaporte(petId), enc.encode(JSON.stringify(datos)));
  return (await guardarPasaporte(petId, aBase64(sobre), version)).version;
}

export const esConflicto = (e: unknown) => e instanceof ErrorApi && e.estado === 409;

/**
 * Un registro firmado vale si la firma es de la clave de la conexión que lo
 * envió (la que dice el servidor) y si el chip acaba como el de esta mascota.
 */
export function comprobar(
  c: Cripto,
  f: { registro: string; firma: string; clave: string },
  origen: Pick<Origen, "firma"> | null,
  chipPista: string | null,
): { valido: true; registro: RegistroClinico } | { valido: false; motivo: "firma" | "clave" | "chip" | "formato" } {
  if (!firmaValida(c, f)) return { valido: false, motivo: "firma" };
  if (!origen?.firma || origen.firma !== f.clave) return { valido: false, motivo: "clave" };
  let registro: RegistroClinico;
  try {
    const r = registroClinico.safeParse(JSON.parse(f.registro));
    if (!r.success) return { valido: false, motivo: "formato" };
    registro = r.data;
  } catch {
    return { valido: false, motivo: "formato" };
  }
  if (chipPista && registro.chip && !registro.chip.endsWith(chipPista)) return { valido: false, motivo: "chip" };
  return { valido: true, registro };
}

/** Los registros de viaje firmados que esperan en la bandeja y aún no están en el pasaporte. */
export async function nuevosDeLaBandeja(
  c: Cripto,
  secreta: Uint8Array,
  petId: string,
  chipPista: string | null,
  datos: PasaporteDueno,
): Promise<Certificado[]> {
  const { mensajes } = await leerBandeja();
  const ya = new Set(datos.certificados.map((x) => x.id));
  // El mismo registro firmado dos veces (un reintento del software) cuenta una.
  const textos = new Set(datos.certificados.map((x) => x.registro));
  const nuevos: Certificado[] = [];
  for (const m of mensajes) {
    if (m.petId !== petId || !m.origen || ya.has(m.id)) continue;
    const sobre = deBase64(m.sellado);
    if (!sobre) continue;
    let f;
    try {
      f = sobreFirmado.safeParse(JSON.parse(dec.decode(c.abrirSellado(secreta, sobre))));
    } catch {
      continue;
    }
    if (!f.success) continue;
    const r = comprobar(c, f.data, m.origen, chipPista);
    if (!r.valido || r.registro.tipo === "informe" || textos.has(f.data.registro)) continue;
    textos.add(f.data.registro);
    nuevos.push({
      id: m.id,
      registro: f.data.registro,
      firma: f.data.firma,
      clave: f.data.clave,
      origen: { clinica: m.origen.clinica, pais: m.origen.pais, dominio: m.origen.dominio },
      recibido: m.llegada,
    });
  }
  return nuevos;
}

/**
 * Lo que cuenta para el viaje. Los certificados se vuelven a comprobar cada
 * vez: lo guardado en el pasaporte también lo podría haber tocado alguien.
 */
export function evaluables(c: Cripto, datos: PasaporteDueno): RegistroEvaluable[] {
  const r: RegistroEvaluable[] = [];
  for (const x of datos.certificados) {
    if (!firmaValida(c, x)) continue;
    const p = registroClinico.safeParse(JSON.parse(x.registro));
    if (p.success && p.data.tipo !== "informe") r.push({ origen: "certificado", registro: p.data } as RegistroEvaluable);
  }
  for (const d of datos.declarados)
    r.push({ origen: "declarado", registro: { ...d.registro, chip: d.registro.chip ?? datos.chip } } as RegistroEvaluable);
  return r;
}

/**
 * Enlace temporal para el viaje. La clave nace aquí y viaja en el fragmento
 * `#`, que el navegador no manda al servidor: quien tiene el enlace lo abre;
 * el servidor, no.
 */
export async function compartir(c: Cripto, petId: string, nombre: string, datos: PasaporteDueno, horas: 24 | 72 | 168) {
  const id = crypto.randomUUID();
  const k = crypto.getRandomValues(new Uint8Array(32));
  const contenido = { ...datos, tipo: "pasaporte", nombre, generado: new Date().toISOString() };
  const sobre = c.cerrar(k, ad.pasaporteCompartido(id), enc.encode(JSON.stringify(contenido)));
  const hecho = await crearEnlace(petId, id, aBase64(sobre), horas);
  return { id, caduca: hecho.caduca, url: `${window.location.origin}/p/${id}#${aBase64Url(k)}` };
}

/** Título y una línea de detalle de un registro de viaje, para listas. */
export function resumenRegistro(r: { tipo: string } & Record<string, unknown>): { titulo: string; detalle: string } {
  const f = (x: unknown) => (typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x.split("-").reverse().join("/") : "");
  const partes = (xs: unknown[]) => xs.filter((x) => typeof x === "string" && x).join(" · ");
  if (r.tipo === "vacuna")
    return {
      titulo: r.enfermedad === "rabia" ? "Vacuna de la rabia" : `Vacuna${r.nombre ? `: ${r.nombre}` : ""}`,
      detalle: partes([f(r.fecha), r.producto, r.lote && `lote ${r.lote}`, f(r.validaHasta) && `válida hasta ${f(r.validaHasta)}`]),
    };
  if (r.tipo === "desparasitacion")
    return {
      titulo: r.contra === "equinococo" ? "Tratamiento contra la tenia" : "Desparasitación",
      detalle: partes([f(r.fecha) && `${f(r.fecha)} ${r.hora ?? ""}`.trim(), r.producto]),
    };
  if (r.tipo === "titulacion")
    return {
      titulo: "Análisis de anticuerpos de la rabia",
      detalle: partes([`${r.resultado} UI/ml`, f(r.fechaMuestra) && `muestra del ${f(r.fechaMuestra)}`, r.laboratorio]),
    };
  return { titulo: "Registro", detalle: "" };
}

/** Quita los certificados repetidos (mismo texto firmado). null si no había ninguno. */
export function sinRepetidos(datos: PasaporteDueno): PasaporteDueno | null {
  const vistos = new Set<string>();
  const certificados = datos.certificados.filter((x) => !vistos.has(x.registro) && !!vistos.add(x.registro));
  return certificados.length === datos.certificados.length ? null : { ...datos, certificados };
}
