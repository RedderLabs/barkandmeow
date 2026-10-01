"use client";

import { aBase64, aBase64Url, ad, deBase64, type Cripto } from "@barkandmeow/crypto";
import {
  historialDe,
  registroDeNota,
  registrosDelPasaporte,
  type FichaDueno,
  type RegistroHistorial,
} from "@barkandmeow/schema";
import { crearEnlace, leerBandeja } from "./api";
import { abrirPasaporte } from "./pasaporte";

/* El historial que el dueño enseña a un veterinario durante unas horas
   (nivel 2). Qué lleva y cómo se monta está en packages/schema (historial.ts),
   que comparten el portal y la app. Aquí se abre lo que hace falta con la
   clave del dueño y se cifra el resultado con la clave del enlace. */

/** Las notas que dejaron los veterinarios en la bandeja, abiertas con la clave del dueño. */
async function notasDe(c: Cripto, secreta: Uint8Array, petId: string): Promise<RegistroHistorial[]> {
  const { mensajes } = await leerBandeja();
  const notas: RegistroHistorial[] = [];
  for (const m of mensajes) {
    // Lo que llega con clave de API es un informe o un certificado, no una nota.
    if (m.petId !== petId || m.origen) continue;
    const sobre = deBase64(m.sellado);
    if (!sobre) continue;
    try {
      const nota = registroDeNota(m.id, m.llegada, JSON.parse(new TextDecoder().decode(c.abrirSellado(secreta, sobre))));
      if (nota) notas.push(nota);
    } catch {
      // Otro tipo de mensaje, o uno que no es para esta clave: no es una nota.
    }
  }
  return notas;
}

/**
 * Enlace temporal al historial. La clave nace aquí y viaja en el fragmento
 * `#`: quien tiene el enlace lo abre; el servidor, no.
 */
export async function compartirHistorial(
  c: Cripto,
  secreta: Uint8Array,
  petId: string,
  ficha: FichaDueno,
  opciones: { nombre: string; telefono: string; horas: 24 | 72 | 168 },
) {
  const [pasaporte, notas] = await Promise.all([
    abrirPasaporte(c, secreta, petId).then((p) => registrosDelPasaporte(p.datos)).catch(() => []),
    notasDe(c, secreta, petId).catch(() => []),
  ]);
  const historial = historialDe(ficha, { nombre: opciones.nombre, telefono: opciones.telefono, hoy: new Date() }, [...pasaporte, ...notas]);

  const id = crypto.randomUUID();
  const k = crypto.getRandomValues(new Uint8Array(32));
  const sobre = c.cerrar(k, ad.historial(id), new TextEncoder().encode(JSON.stringify(historial)));
  const hecho = await crearEnlace(petId, id, aBase64(sobre), opciones.horas);
  return {
    id,
    caduca: hecho.caduca,
    url: `${window.location.origin}/s/${id}#${aBase64Url(k)}`,
    registros: historial.registros.length,
  };
}
