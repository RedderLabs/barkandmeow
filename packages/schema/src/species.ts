import { z } from "zod";

/* Reglamento (UE) 576/2013, Anexo I.
   Parte A: reglas armonizadas en la UE (chip, pasaporte, rabia).
   Parte B: sin armonizar; manda el país de destino y la aerolínea. */

export const regimenViaje = z.enum(["ue-armonizado", "segun-destino"]);
export type RegimenViaje = z.infer<typeof regimenViaje>;

export type Especie = {
  codigo: string;
  nombre: string;
  cientifico?: string;
  regimen: RegimenViaje;
  /** Si la especie lleva microchip ISO de forma habitual o legal. */
  chipHabitual: boolean;
};

export const ESPECIES: Especie[] = [
  // Parte A
  { codigo: "dog", nombre: "Perro", cientifico: "Canis lupus familiaris", regimen: "ue-armonizado", chipHabitual: true },
  { codigo: "cat", nombre: "Gato", cientifico: "Felis silvestris catus", regimen: "ue-armonizado", chipHabitual: true },
  { codigo: "ferret", nombre: "Hurón", cientifico: "Mustela putorius furo", regimen: "ue-armonizado", chipHabitual: true },
  // Parte B
  { codigo: "bird", nombre: "Ave (no de corral)", regimen: "segun-destino", chipHabitual: false },
  { codigo: "rabbit", nombre: "Conejo doméstico", regimen: "segun-destino", chipHabitual: false },
  { codigo: "rodent", nombre: "Roedor doméstico", regimen: "segun-destino", chipHabitual: false },
  { codigo: "reptile", nombre: "Reptil", regimen: "segun-destino", chipHabitual: false },
  { codigo: "amphibian", nombre: "Anfibio", regimen: "segun-destino", chipHabitual: false },
  { codigo: "fish", nombre: "Pez ornamental", regimen: "segun-destino", chipHabitual: false },
  { codigo: "invertebrate", nombre: "Invertebrado", regimen: "segun-destino", chipHabitual: false },
];

export const codigoEspecie = z.enum(
  ESPECIES.map((e) => e.codigo) as [string, ...string[]],
);

const porCodigo = new Map(ESPECIES.map((e) => [e.codigo, e]));
export const buscarEspecie = (codigo: string) => porCodigo.get(codigo);

/** Las especies de la Parte A son las que el checklist de viaje cubre a fondo. */
export const esParteA = (codigo: string) =>
  porCodigo.get(codigo)?.regimen === "ue-armonizado";
