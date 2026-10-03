/* Los requisitos de viaje los escribe evaluarViaje() en español, en el núcleo
   compartido con la web. El móvil los traduce reconociendo cada texto con su
   plantilla «pasaporte.req.*»: si alguien cambia una frase en el paquete y no
   aquí, esto falla en vez de enseñar el requisito sin traducir. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fmt } from "@barkandmeow/i18n";
import { evaluarViaje, pasaporteDueno, type Destino, type RegistroEvaluable } from "@barkandmeow/schema";
import { traducirRequisito } from "../lib/pasaporte.ts";
import { TEXTOS } from "../lib/textos";
import type { T } from "../lib/idioma";

const es: T = (k, v) => fmt(TEXTOS.es[k], v ?? {});
const en: T = (k, v) => fmt(TEXTOS.en[k], v ?? {});
// Devuelve la clave: así se ve qué plantilla reconoció cada texto.
const claves: T = (k) => k;

const vacuna = (fecha: string, validaHasta: string): RegistroEvaluable => ({
  origen: "declarado",
  registro: { version: 1, tipo: "vacuna", fecha, enfermedad: "rabia", producto: "Rabisin", lote: "L1", validaHasta },
} as RegistroEvaluable);
const tenia = (fecha: string, hora: string): RegistroEvaluable => ({
  origen: "certificado",
  registro: { version: 1, tipo: "desparasitacion", fecha, hora, contra: "equinococo", producto: "Milbemax" },
} as RegistroEvaluable);
const analisis = (fechaMuestra: string): RegistroEvaluable => ({
  origen: "certificado",
  registro: { version: 1, tipo: "titulacion", fechaMuestra, resultado: 1.2, laboratorio: "Lab" },
} as RegistroEvaluable);

const vacio = pasaporteDueno.parse({ version: 1, especie: "dog" });
const completo = pasaporteDueno.parse({ version: 1, especie: "dog", chip: "724098060143113", numeroPasaporte: "ES012345678" });
const casos: [ReturnType<typeof pasaporteDueno.parse>, RegistroEvaluable[], Destino, string][] = [
  [pasaporteDueno.parse({ version: 1, especie: "rabbit" }), [], "ue", "2026-10-20T10:00:00"],
  [vacio, [], "gb", "2026-10-20T10:00:00"],
  [vacio, [vacuna("2025-01-10", "2026-01-10")], "ue-equinococo", "2026-10-20T10:00:00"],
  [completo, [vacuna("2026-10-10", "2027-10-10")], "ue", "2026-10-20T10:00:00"],
  [completo, [vacuna("2026-03-14", "2027-03-14"), tenia("2026-10-18", "09:30")], "gb", "2026-10-20T10:00:00"],
  [vacio, [], "fuera-ue", "2026-10-20T10:00:00"],
  [completo, [vacuna("2026-03-14", "2027-03-14"), analisis("2026-05-01")], "fuera-ue", "2026-10-20T10:00:00"],
];

test("cada requisito de evaluarViaje tiene su plantilla, y en español sale igual", () => {
  const vistas = new Set<string>();
  for (const [datos, registros, destino, llegada] of casos)
    for (const r of evaluarViaje(datos, registros, destino, new Date(llegada))) {
      const k = traducirRequisito(r, claves);
      assert.match(k.titulo, /^pasaporte\.req\./, r.titulo);
      assert.match(k.detalle, /^pasaporte\.req\./, r.detalle);
      vistas.add(k.titulo).add(k.detalle);
      assert.deepEqual(traducirRequisito(r, es), { titulo: r.titulo, detalle: r.detalle });
    }
  // Todas las plantillas de requisitos salen en algún caso.
  const todas = Object.keys(TEXTOS.es).filter((k) => k.startsWith("pasaporte.req."));
  assert.deepEqual(todas.filter((k) => !vistas.has(k)), []);
});

test("los huecos pasan a la traducción", () => {
  const [r] = evaluarViaje(completo, [vacuna("2026-03-14", "2027-03-14")], "ue", new Date("2026-10-20T10:00:00")).filter(
    (x) => x.clave === "rabia",
  );
  assert.deepEqual(traducirRequisito(r, en), { titulo: "Valid rabies vaccination", detalle: "Valid until 14/03/2027." });
  // Un texto desconocido se enseña tal cual.
  assert.deepEqual(traducirRequisito({ titulo: "Otra cosa", detalle: "" }, en), { titulo: "Otra cosa", detalle: "" });
});
