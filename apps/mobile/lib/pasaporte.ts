/* El pasaporte de viaje en el teléfono: el mismo que guarda el portal.

   Aquí se abre, se evalúa para un viaje y se comparte. Lo que firma la clínica
   llega por la bandeja y el portal lo copia al pasaporte al abrirlo; el móvil
   lo enseña también aunque aún no esté copiado, sin guardar nada. Apuntar
   registros a mano sigue en el portal.

   Sin React ni Expo, para probarlo contra el núcleo de la web: el azar lo pasa
   quien llama. */

import {
  pasaporteDueno,
  registroClinico,
  sobreFirmado,
  type PasaporteDueno,
  type RegistroEvaluable,
} from "@barkandmeow/schema";
import { aBase64, aBase64Url, abrir, abrirSellado, cerrar, clavePasaporte, deBase64, firmaValida, ad } from "./cripto";
import { resumenRegistro } from "./bandeja";
import type { MensajeSellado } from "./api";

const enc = new TextEncoder();
const dec = new TextDecoder();

export const PASAPORTE_VACIO: PasaporteDueno = pasaporteDueno.parse({ version: 1 });

/** El pasaporte de un sobre en base64, o el vacío si aún no hay. Si no abre, lanza. */
export function abrirPasaporte(secreta: Uint8Array, petId: string, sobre: string | null): PasaporteDueno {
  if (!sobre) return PASAPORTE_VACIO;
  const bytes = deBase64(sobre);
  if (!bytes) throw new Error("pasaporte mal formado");
  return pasaporteDueno.parse(JSON.parse(dec.decode(abrir(clavePasaporte(secreta), ad.pasaporte(petId), bytes))));
}

type Firmado = { id: string; registro: string; firma: string; clave: string; clinica: string };

/** Los registros firmados de esta mascota que esperan en la bandeja y aún no están en el pasaporte. */
export function firmadosDeBandeja(
  secreta: Uint8Array,
  petId: string,
  chipPista: string | null,
  datos: PasaporteDueno,
  mensajes: MensajeSellado[],
): Firmado[] {
  const textos = new Set(datos.certificados.map((x) => x.registro));
  const nuevos: Firmado[] = [];
  for (const m of mensajes) {
    if (m.petId !== petId || !m.origen?.firma) continue;
    const sobre = deBase64(m.sellado);
    if (!sobre) continue;
    try {
      const f = sobreFirmado.safeParse(JSON.parse(dec.decode(abrirSellado(secreta, sobre))));
      // La firma tiene que ser de la conexión que lo envió, según el servidor.
      if (!f.success || !firmaValida(f.data) || f.data.clave !== m.origen.firma) continue;
      const r = registroClinico.safeParse(JSON.parse(f.data.registro));
      if (!r.success || r.data.tipo === "informe" || textos.has(f.data.registro)) continue;
      if (chipPista && r.data.chip && !r.data.chip.endsWith(chipPista)) continue;
      textos.add(f.data.registro);
      nuevos.push({ id: m.id, registro: f.data.registro, firma: f.data.firma, clave: f.data.clave, clinica: m.origen.clinica });
    } catch {
      // No es un registro firmado, o no es para esta clave.
    }
  }
  return nuevos;
}

export type FilaPasaporte = { id: string; certificado: boolean; titulo: string; detalle: string; clinica: string };

/** Lo que cuenta para un viaje y cómo enseñarlo: lo firmado se comprueba cada vez. */
export function registrosDeViaje(datos: PasaporteDueno, deBandeja: Firmado[] = []) {
  const evaluables: RegistroEvaluable[] = [];
  const filas: FilaPasaporte[] = [];
  const firmados = [...datos.certificados.map((x) => ({ ...x, clinica: x.origen.clinica })), ...deBandeja];
  for (const x of firmados) {
    if (!firmaValida(x)) continue;
    let r;
    try {
      r = registroClinico.safeParse(JSON.parse(x.registro));
    } catch {
      continue;
    }
    if (!r.success || r.data.tipo === "informe") continue;
    evaluables.push({ origen: "certificado", registro: r.data } as RegistroEvaluable);
    filas.push({ id: x.id, certificado: true, ...resumenRegistro(r.data), clinica: r.data.clinica || x.clinica });
  }
  for (const d of datos.declarados) {
    evaluables.push({ origen: "declarado", registro: { ...d.registro, chip: d.registro.chip ?? datos.chip } } as RegistroEvaluable);
    filas.push({ id: d.id, certificado: false, ...resumenRegistro(d.registro), clinica: d.registro.clinica });
  }
  return { evaluables, filas };
}

/** El pasaporte cifrado con la clave del enlace, y el enlace: lo abre la web del veterinario en /p. */
export function sobrePasaporte(
  web: string,
  datos: PasaporteDueno,
  nombre: string,
  ahora: Date,
  azar: { id: string; clave: Uint8Array; nonce: Uint8Array },
) {
  const contenido = { ...datos, tipo: "pasaporte", nombre, generado: ahora.toISOString() };
  return {
    id: azar.id,
    sobre: aBase64(cerrar(azar.clave, `bm:pv:v1:${azar.id}`, azar.nonce, enc.encode(JSON.stringify(contenido)))),
    url: `${web}/p/${azar.id}#${aBase64Url(azar.clave)}`,
  };
}
