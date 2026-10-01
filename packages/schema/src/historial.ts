import { resumenDeFicha, type FichaDueno, type ResumenEmergencia, type Termino } from "./ficha";
import { registroClinico, type Declarado, type PasaporteDueno } from "./pasaporte";

/* El historial que el dueño enseña a un veterinario durante unas horas
   (nivel 2). Lleva el resumen de la ficha y lo que ya consta: lo que firmó su
   clínica, lo que apuntó él y las notas que le dejaron otros veterinarios.

   Aquí está solo la forma y cómo se monta, sin cifrado: el portal y la app lo
   cifran cada uno con su núcleo, con la clave del enlace. Cada registro dice
   de dónde sale: lo declarado por el dueño no pesa como lo firmado. */

export type RegistroHistorial = {
  id: string;
  /** AAAA-MM-DD. */
  fecha: string;
  lugar: string;
  procedencia: "dueno" | "clinica" | "veterinario";
  titulo: Termino;
  /** Texto libre, en su idioma original: se enseña tal cual, con aviso. */
  texto: string | null;
  idiomaTexto: "es";
  vacuna: { lote: string; validezMeses: number } | null;
  documento: null;
};

export type HistorialCompartido = {
  resumen: ResumenEmergencia;
  peso: { kg: string; fecha: string } | null;
  registros: RegistroHistorial[];
};

const TITULOS = {
  rabia: { es: "Vacuna de la rabia", pt: "Vacina antirrábica", en: "Rabies vaccine", fr: "Vaccin antirabique" },
  vacuna: { es: "Vacuna", pt: "Vacina", en: "Vaccine", fr: "Vaccin" },
  tenia: {
    es: "Tratamiento contra la tenia",
    pt: "Tratamento contra a ténia",
    en: "Tapeworm treatment",
    fr: "Traitement contre le ténia",
  },
  desparasitacion: { es: "Desparasitación", pt: "Desparasitação", en: "Deworming", fr: "Vermifugation" },
  titulacion: {
    es: "Análisis de anticuerpos de la rabia",
    pt: "Titulação de anticorpos da raiva",
    en: "Rabies antibody test",
    fr: "Titrage des anticorps antirabiques",
  },
  nota: { es: "Nota de consulta", pt: "Nota de consulta", en: "Consultation note", fr: "Note de consultation" },
} satisfies Record<string, Termino>;

const meses = (desde: string, hasta: string) => {
  const [a1, m1] = desde.split("-").map(Number);
  const [a2, m2] = hasta.split("-").map(Number);
  return Math.max(0, (a2 - a1) * 12 + (m2 - m1));
};

const unir = (xs: (string | undefined | false)[]) => xs.filter(Boolean).join(" · ") || null;

/** Vacuna, desparasitación o análisis: lo firmado y lo declarado tienen la misma forma. */
function deViaje(
  id: string,
  r: Declarado["registro"],
  procedencia: "dueno" | "clinica",
  lugar: string,
): RegistroHistorial {
  const base = { id, lugar, procedencia, idiomaTexto: "es" as const, documento: null };
  if (r.tipo === "vacuna")
    return {
      ...base,
      fecha: r.fecha,
      titulo: r.enfermedad === "rabia" ? TITULOS.rabia : TITULOS.vacuna,
      texto: unir([r.nombre, r.producto]),
      vacuna: { lote: r.lote, validezMeses: meses(r.fecha, r.validaHasta) },
    };
  if (r.tipo === "desparasitacion")
    return {
      ...base,
      fecha: r.fecha,
      titulo: r.contra === "equinococo" ? TITULOS.tenia : TITULOS.desparasitacion,
      texto: unir([r.producto, r.hora]),
      vacuna: null,
    };
  return {
    ...base,
    fecha: r.fechaMuestra,
    titulo: TITULOS.titulacion,
    texto: unir([`${String(r.resultado).replace(".", ",")} UI/ml`, r.laboratorio]),
    vacuna: null,
  };
}

/** Lo que consta en el pasaporte de viaje: lo firmado por la clínica y lo declarado por el dueño. */
export function registrosDelPasaporte(datos: PasaporteDueno): RegistroHistorial[] {
  const registros: RegistroHistorial[] = [];
  for (const x of datos.certificados) {
    let r;
    try {
      r = registroClinico.safeParse(JSON.parse(x.registro));
    } catch {
      continue;
    }
    if (r.success && r.data.tipo !== "informe")
      registros.push(deViaje(x.id, r.data, "clinica", r.data.clinica || x.origen.clinica));
  }
  for (const d of datos.declarados) registros.push(deViaje(d.id, d.registro, "dueno", d.registro.clinica));
  return registros;
}

const t = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Una nota de consulta de la bandeja, ya abierta. null si el mensaje no es una nota. */
export function registroDeNota(id: string, llegada: string, contenido: unknown): RegistroHistorial | null {
  const j = contenido as Record<string, unknown> | null;
  if (!j || j.tipo !== "nota") return null;
  return {
    id,
    fecha: (/^\d{4}-\d{2}-\d{2}/.test(t(j.fecha)) ? t(j.fecha) : llegada).slice(0, 10),
    lugar: t(j.clinica),
    procedencia: "veterinario",
    titulo: TITULOS.nota,
    texto:
      [
        t(j.motivo) && `Motivo: ${t(j.motivo)}`,
        t(j.diagnostico) && `Diagnóstico: ${t(j.diagnostico)}`,
        t(j.tratamiento) && `Tratamiento: ${t(j.tratamiento)}`,
        t(j.observaciones),
      ]
        .filter(Boolean)
        .join("\n") || null,
    idiomaTexto: "es",
    vacuna: null,
    documento: null,
  };
}

/** El historial entero, con lo más reciente primero. */
export function historialDe(
  ficha: FichaDueno,
  opciones: { nombre: string; telefono: string; hoy: Date },
  registros: RegistroHistorial[],
): HistorialCompartido {
  return {
    resumen: resumenDeFicha(ficha, opciones),
    peso: ficha.pesoKg
      ? { kg: ficha.pesoKg.replace(".", ","), fecha: ficha.pesoFecha || opciones.hoy.toISOString().slice(0, 10) }
      : null,
    registros: [...registros].sort((a, b) => b.fecha.localeCompare(a.fecha)),
  };
}
