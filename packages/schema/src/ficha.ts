import { z } from "zod";
import { codigoEspecie } from "./species";

/* La ficha de salud que escribe el dueño (decidido 2026-10-01).

   Es lo que un veterinario que no conoce al animal necesita en segundos:
   alergias, medicación, enfermedades crónicas y la rabia. El dueño la escribe
   en su portal o en su app y se guarda cifrada con la clave de esa mascota
   (`claveFicha`, la misma K que entrega a su clínica con el nivel 3): el
   servidor guarda bytes y un número de versión.

   De la ficha salen dos copias, cada una con su propia clave:
   · la placa del collar (nivel 1): el resumen de emergencia, cifrado con la
     clave que va en el QR;
   · el historial temporal (nivel 2): cifrado con la clave de un enlace que
     caduca.

   Lo estructurado se traduce; el texto libre, no. Reacciones y enfermedades
   salen de un catálogo propio ya traducido a los cuatro idiomas de la web del
   veterinario. Es un catálogo corto de partida, sin códigos VeNom ni ATCvet:
   esos mapeos están por hacer y no se inventan. */

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha AAAA-MM-DD");
const fechaOpcional = fecha.or(z.literal("")).default("");
const texto = (max: number) => z.string().trim().max(max);

export type Termino = { es: string; pt: string; en: string; fr: string };

/* ── Catálogos ───────────────────────────────────────────── */

export const REACCIONES = {
  urticaria: { es: "Urticaria", pt: "Urticária", en: "Hives", fr: "Urticaire" },
  "hinchazon-cara": { es: "Hinchazón de la cara", pt: "Inchaço da face", en: "Facial swelling", fr: "Gonflement de la face" },
  "dificultad-respirar": {
    es: "Dificultad para respirar",
    pt: "Dificuldade respiratória",
    en: "Breathing difficulty",
    fr: "Difficulté respiratoire",
  },
  anafilaxia: { es: "Anafilaxia", pt: "Anafilaxia", en: "Anaphylaxis", fr: "Anaphylaxie" },
  vomitos: { es: "Vómitos", pt: "Vómitos", en: "Vomiting", fr: "Vomissements" },
  diarrea: { es: "Diarrea", pt: "Diarreia", en: "Diarrhoea", fr: "Diarrhée" },
  picor: { es: "Picor intenso", pt: "Prurido intenso", en: "Intense itching", fr: "Démangeaisons intenses" },
  piel: { es: "Reacción en la piel", pt: "Reação cutânea", en: "Skin reaction", fr: "Réaction cutanée" },
  convulsiones: { es: "Convulsiones", pt: "Convulsões", en: "Seizures", fr: "Convulsions" },
  decaimiento: { es: "Decaimiento", pt: "Letargia", en: "Lethargy", fr: "Léthargie" },
} as const satisfies Record<string, Termino>;

export const CRONICAS = {
  diabetes: { es: "Diabetes mellitus", pt: "Diabetes mellitus", en: "Diabetes mellitus", fr: "Diabète sucré" },
  renal: {
    es: "Enfermedad renal crónica",
    pt: "Doença renal crónica",
    en: "Chronic kidney disease",
    fr: "Maladie rénale chronique",
  },
  cardiaca: { es: "Enfermedad cardíaca", pt: "Doença cardíaca", en: "Heart disease", fr: "Maladie cardiaque" },
  epilepsia: { es: "Epilepsia", pt: "Epilepsia", en: "Epilepsy", fr: "Épilepsie" },
  hipotiroidismo: { es: "Hipotiroidismo", pt: "Hipotiroidismo", en: "Hypothyroidism", fr: "Hypothyroïdie" },
  hipertiroidismo: { es: "Hipertiroidismo", pt: "Hipertiroidismo", en: "Hyperthyroidism", fr: "Hyperthyroïdie" },
  artrosis: { es: "Artrosis", pt: "Osteoartrite", en: "Osteoarthritis", fr: "Arthrose" },
  "dermatitis-atopica": {
    es: "Dermatitis atópica",
    pt: "Dermatite atópica",
    en: "Atopic dermatitis",
    fr: "Dermatite atopique",
  },
  "alergia-alimentaria": { es: "Alergia alimentaria", pt: "Alergia alimentar", en: "Food allergy", fr: "Allergie alimentaire" },
  leishmaniosis: { es: "Leishmaniosis", pt: "Leishmaniose", en: "Leishmaniosis", fr: "Leishmaniose" },
  "inflamatoria-intestinal": {
    es: "Enfermedad inflamatoria intestinal",
    pt: "Doença inflamatória intestinal",
    en: "Inflammatory bowel disease",
    fr: "Maladie inflammatoire chronique de l'intestin",
  },
  hepatica: {
    es: "Enfermedad hepática crónica",
    pt: "Doença hepática crónica",
    en: "Chronic liver disease",
    fr: "Maladie hépatique chronique",
  },
  pancreatitis: { es: "Pancreatitis crónica", pt: "Pancreatite crónica", en: "Chronic pancreatitis", fr: "Pancréatite chronique" },
  cushing: {
    es: "Síndrome de Cushing",
    pt: "Síndrome de Cushing",
    en: "Cushing's syndrome",
    fr: "Syndrome de Cushing",
  },
  addison: { es: "Enfermedad de Addison", pt: "Doença de Addison", en: "Addison's disease", fr: "Maladie d'Addison" },
  asma: { es: "Asma felina", pt: "Asma felina", en: "Feline asthma", fr: "Asthme félin" },
  fiv: {
    es: "Inmunodeficiencia felina (FIV)",
    pt: "Imunodeficiência felina (FIV)",
    en: "Feline immunodeficiency virus (FIV)",
    fr: "Virus de l'immunodéficience féline (FIV)",
  },
  felv: {
    es: "Leucemia felina (FeLV)",
    pt: "Leucemia felina (FeLV)",
    en: "Feline leukaemia virus (FeLV)",
    fr: "Leucose féline (FeLV)",
  },
} as const satisfies Record<string, Termino>;

export type CodigoReaccion = keyof typeof REACCIONES;
export type CodigoCronica = keyof typeof CRONICAS;

const codigos = <T extends Record<string, Termino>>(c: T) => Object.keys(c) as [keyof T & string, ...(keyof T & string)[]];

/* ── La ficha ────────────────────────────────────────────── */

export const gravedad = z.enum(["alta", "media", "baja"]);
export type Gravedad = z.infer<typeof gravedad>;

/** «otra»: no está en el catálogo y va en `texto`, sin traducir. */
export const alergiaFicha = z.object({
  id: z.string().max(64),
  /** Principio activo o alimento, nunca marca comercial. */
  sustancia: texto(80).min(1),
  reaccion: z.enum([...codigos(REACCIONES), "otra"]),
  texto: texto(80).default(""),
  gravedad,
});
export type AlergiaFicha = z.infer<typeof alergiaFicha>;

export const medicacionFicha = z.object({
  id: z.string().max(64),
  principio: texto(80).min(1),
  dosis: texto(40).default(""),
  cadaHoras: z.number().int().min(1).max(720),
});
export type MedicacionFicha = z.infer<typeof medicacionFicha>;

export const cronicaFicha = z.object({
  id: z.string().max(64),
  codigo: z.enum([...codigos(CRONICAS), "otra"]),
  texto: texto(80).default(""),
});
export type CronicaFicha = z.infer<typeof cronicaFicha>;

/** La placa del collar: su id y su clave. Van dentro de la ficha cifrada para
    que el dueño pueda actualizar el resumen sin cambiar de placa. */
export const placaFicha = z.object({
  id: z.string().uuid(),
  /** 32 bytes en base64url: lo que va tras el # del enlace del QR. */
  clave: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  /** Teléfono que el dueño decide enseñar en la placa, o vacío. */
  telefono: texto(24).default(""),
  creada: z.string(),
});
export type PlacaFicha = z.infer<typeof placaFicha>;

export const fichaDueno = z.object({
  version: z.literal(1),
  especie: codigoEspecie.default("dog"),
  sexo: z.enum(["hembra", "macho"]).nullable().default(null),
  esterilizado: z.boolean().default(false),
  raza: texto(80).default(""),
  nacimiento: fechaOpcional,
  /** Como lo escribe el dueño: «12,4». */
  pesoKg: z.string().regex(/^\d{1,3}([.,]\d{1,2})?$/).or(z.literal("")).default(""),
  pesoFecha: fechaOpcional,
  /** El chip completo: el servidor solo tiene su HMAC y los últimos 4 dígitos. */
  chip: z.string().regex(/^[0-9A-Za-z]{6,23}$/).or(z.literal("")).default(""),
  alergias: z.array(alergiaFicha).max(20).default([]),
  medicacion: z.array(medicacionFicha).max(20).default([]),
  cronicas: z.array(cronicaFicha).max(20).default([]),
  /** Hasta cuándo vale la vacuna de la rabia. */
  rabiaHasta: fechaOpcional,
  placa: placaFicha.nullable().default(null),
  /** Cuándo se guardó por última vez, en ISO. */
  actualizado: z.string().default(""),
});
export type FichaDueno = z.infer<typeof fichaDueno>;

export const FICHA_VACIA: FichaDueno = fichaDueno.parse({ version: 1 });

/** Lo mínimo para enseñarla a un veterinario: sin el sexo, la ficha engaña. */
export const fichaLista = (f: FichaDueno) => f.sexo !== null;

/** ¿Hay algo de salud apuntado, aparte de los datos del animal? */
export const fichaConSalud = (f: FichaDueno) =>
  f.alergias.length + f.medicacion.length + f.cronicas.length > 0 || f.rabiaHasta !== "";

/* ── Lo que ve el veterinario ────────────────────────────── */

/** El resumen de emergencia, tal como lo abre la web del veterinario. */
export type ResumenEmergencia = {
  animal: {
    nombre: string;
    especie: string;
    sexo: "hembra" | "macho";
    esterilizado: boolean;
    raza: string;
    edad: string;
    pesoKg: string;
    chip: string | null;
  };
  alergias: { sustancia: string; reaccion: Termino; gravedad: Gravedad; atcvet: string | null }[];
  medicacion: { principio: string; dosis: string; cadaHoras: number }[];
  cronicas: Termino[];
  rabiaHasta: string | null;
  telefono: string | null;
  actualizado: string;
  idioma: "es";
};

/** El mismo texto en los cuatro idiomas: no se traduce lo que no está en el catálogo. */
const sinTraducir = (t: string): Termino => ({ es: t, pt: t, en: t, fr: t });

export const terminoReaccion = (a: AlergiaFicha): Termino =>
  a.reaccion === "otra" ? sinTraducir(a.texto || "Reacción sin especificar") : REACCIONES[a.reaccion];

export const terminoCronica = (c: CronicaFicha): Termino =>
  c.codigo === "otra" ? sinTraducir(c.texto || "Sin especificar") : CRONICAS[c.codigo];

/** «3 años», «8 meses». Vacío si no hay fecha de nacimiento o es futura. */
export function edadTexto(nacimiento: string, hoy: Date): string {
  if (!nacimiento) return "";
  const [a, m, d] = nacimiento.split("-").map(Number);
  let meses = (hoy.getFullYear() - a) * 12 + (hoy.getMonth() + 1 - m);
  if (hoy.getDate() < d) meses -= 1;
  if (meses < 0) return "";
  if (meses < 1) return "Menos de 1 mes";
  if (meses < 12) return meses === 1 ? "1 mes" : `${meses} meses`;
  const anos = Math.floor(meses / 12);
  return anos === 1 ? "1 año" : `${anos} años`;
}

/** Las alergias graves, primero: es lo que se lee con prisa. */
const ORDEN: Record<Gravedad, number> = { alta: 0, media: 1, baja: 2 };

/**
 * El resumen de emergencia de una ficha. `telefono` es el que el dueño decide
 * enseñar (en la placa, el de la placa); el nombre sale de su perfil.
 */
export function resumenDeFicha(
  f: FichaDueno,
  opciones: { nombre: string; telefono: string; hoy: Date },
): ResumenEmergencia {
  if (f.sexo === null) throw new Error("la ficha no tiene el sexo del animal");
  return {
    animal: {
      nombre: opciones.nombre,
      especie: f.especie,
      sexo: f.sexo,
      esterilizado: f.esterilizado,
      raza: f.raza,
      edad: edadTexto(f.nacimiento, opciones.hoy),
      pesoKg: f.pesoKg.replace(".", ","),
      chip: f.chip || null,
    },
    alergias: [...f.alergias]
      .sort((a, b) => ORDEN[a.gravedad] - ORDEN[b.gravedad])
      .map((a) => ({ sustancia: a.sustancia, reaccion: terminoReaccion(a), gravedad: a.gravedad, atcvet: null })),
    medicacion: f.medicacion.map((m) => ({ principio: m.principio, dosis: m.dosis, cadaHoras: m.cadaHoras })),
    cronicas: f.cronicas.map(terminoCronica),
    rabiaHasta: f.rabiaHasta || null,
    telefono: opciones.telefono.trim() || null,
    actualizado: opciones.hoy.toISOString().slice(0, 10),
    idioma: "es",
  };
}

/* ── Contratos de la API ─────────────────────────────────── */

const sobre = (maxBytes: number) =>
  z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).refine((s) => (s.length * 3) / 4 <= maxBytes, "demasiado grande");

/** La ficha cifrada y la versión que el navegador leyó (0 si aún no había). */
export const fichaBody = z.object({
  sobre: sobre(64 * 1024),
  version: z.number().int().nonnegative(),
});

/** La placa: el id lo pone el navegador, porque el cifrado va atado a él. */
export const placaBody = z.object({
  id: z.string().uuid(),
  sobre: sobre(32 * 1024),
});
