/* La ficha de salud en el teléfono: la misma que escribe el portal.

   Se guarda en el servidor cifrada con la clave de esa mascota (`claveFicha`),
   que sale de la secreta del dueño. De ella salen la placa del collar (el
   resumen de urgencia, con la clave del QR) y el historial que se enseña unas
   horas (con la clave del enlace).

   Aquí no hay nada de React ni de Expo, para poder probarlo contra el núcleo
   de la web: el azar (nonces, claves, ids) lo pasa quien llama. */

import {
  FICHA_VACIA,
  fichaDueno,
  fichaLista,
  historialDe,
  pasaporteDueno,
  registroDeNota,
  registrosDelPasaporte,
  resumenDeFicha,
  type FichaDueno,
  type PlacaFicha,
  type RegistroHistorial,
} from "@barkandmeow/schema";
import { aBase64, aBase64Url, abrir, abrirSellado, ad, cerrar, claveFicha, clavePasaporte, deBase64 } from "./cripto";
import type { MensajeSellado } from "./api";

const enc = new TextEncoder();
const dec = new TextDecoder();

/** La ficha de un sobre en base64, o la vacía si aún no hay. Si no abre, lanza:
    mejor fallar que enseñar una ficha vacía y pisar la buena. */
export function abrirFicha(secreta: Uint8Array, petId: string, sobre: string | null): FichaDueno {
  if (!sobre) return FICHA_VACIA;
  const bytes = deBase64(sobre);
  if (!bytes) throw new Error("ficha mal formada");
  return fichaDueno.parse(JSON.parse(dec.decode(abrir(claveFicha(secreta, petId), ad.ficha(petId), bytes))));
}

export const cerrarFicha = (secreta: Uint8Array, petId: string, datos: FichaDueno, nonce: Uint8Array) =>
  aBase64(cerrar(claveFicha(secreta, petId), ad.ficha(petId), nonce, enc.encode(JSON.stringify(datos))));

/** Una placa nueva. `clave` son 32 bytes de azar: lo que irá tras el # del QR. */
export const nuevaPlaca = (id: string, clave: Uint8Array, telefono: string, ahora: Date): PlacaFicha => ({
  id,
  clave: aBase64Url(clave),
  telefono: telefono.trim(),
  creada: ahora.toISOString(),
});

export const enlacePlaca = (web: string, p: PlacaFicha) => `${web}/e/${p.id}#${p.clave}`;

/** El resumen de urgencia cifrado con la clave de la placa, o null si no hay placa que publicar. */
export function sobrePlaca(ficha: FichaDueno, nombre: string, nonce: Uint8Array, hoy: Date): string | null {
  if (!ficha.placa || !fichaLista(ficha)) return null;
  const k = deBase64(ficha.placa.clave);
  if (!k || k.length !== 32) throw new Error("clave de placa mal formada");
  const resumen = resumenDeFicha(ficha, { nombre, telefono: ficha.placa.telefono, hoy });
  return aBase64(cerrar(k, ad.emergencia(ficha.placa.id), nonce, enc.encode(JSON.stringify(resumen))));
}

/** Lo que consta en el pasaporte de viaje, si lo hay y abre con esta clave. */
export function registrosDePasaporte(secreta: Uint8Array, petId: string, sobre: string | null): RegistroHistorial[] {
  const bytes = sobre ? deBase64(sobre) : null;
  if (!bytes) return [];
  try {
    const claro = abrir(clavePasaporte(secreta), ad.pasaporte(petId), bytes);
    return registrosDelPasaporte(pasaporteDueno.parse(JSON.parse(dec.decode(claro))));
  } catch {
    return [];
  }
}

/** Las notas de consulta de esta mascota que esperan en la bandeja. */
export function notasDeBandeja(secreta: Uint8Array, petId: string, mensajes: MensajeSellado[]): RegistroHistorial[] {
  const notas: RegistroHistorial[] = [];
  for (const m of mensajes) {
    // Lo que llega con clave de API es un informe o un certificado, no una nota.
    if (m.petId !== petId || m.origen) continue;
    const sobre = deBase64(m.sellado);
    if (!sobre) continue;
    try {
      const nota = registroDeNota(m.id, m.llegada, JSON.parse(dec.decode(abrirSellado(secreta, sobre))));
      if (nota) notas.push(nota);
    } catch {
      // Otro tipo de mensaje, o uno que no es para esta clave.
    }
  }
  return notas;
}

/** El historial cifrado con la clave del enlace, y el enlace. */
export function sobreHistorial(
  web: string,
  ficha: FichaDueno,
  opciones: { nombre: string; telefono: string; hoy: Date },
  registros: RegistroHistorial[],
  azar: { id: string; clave: Uint8Array; nonce: Uint8Array },
) {
  const historial = historialDe(ficha, opciones, registros);
  return {
    id: azar.id,
    sobre: aBase64(cerrar(azar.clave, ad.historial(azar.id), azar.nonce, enc.encode(JSON.stringify(historial)))),
    url: `${web}/s/${azar.id}#${aBase64Url(azar.clave)}`,
    registros: historial.registros.length,
  };
}
