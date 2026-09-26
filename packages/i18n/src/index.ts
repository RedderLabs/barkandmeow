/* Traducciones de catálogo y de interfaz.
   La web del veterinario se abre en el idioma de su navegador: es lo primero
   que ve, y por eso los idiomas de partida del doc son es, pt, en y fr.

   Regla que no se puede romper: el texto libre del historial NO se traduce
   automáticamente aquí. Se muestra en su idioma original con aviso, y la
   traducción es opcional, marcada como tal, y ocurre en el navegador del lector. */

export const IDIOMAS = ["es", "pt", "en", "fr"] as const;
export type Idioma = (typeof IDIOMAS)[number];
export const IDIOMA_POR_DEFECTO: Idioma = "es";

/** Coge el primer idioma soportado del Accept-Language o del navegador. */
export function resolverIdioma(preferidos: readonly string[]): Idioma {
  for (const p of preferidos) {
    const base = p.toLowerCase().split("-")[0];
    const hit = IDIOMAS.find((i) => i === base);
    if (hit) return hit;
  }
  return IDIOMA_POR_DEFECTO;
}

type Diccionario = Record<string, string>;

export const ESPECIES: Record<Idioma, Diccionario> = {
  es: {
    dog: "Perro", cat: "Gato", ferret: "Hurón", bird: "Ave (no de corral)",
    rabbit: "Conejo doméstico", rodent: "Roedor doméstico", reptile: "Reptil",
    amphibian: "Anfibio", fish: "Pez ornamental", invertebrate: "Invertebrado",
  },
  pt: {
    dog: "Cão", cat: "Gato", ferret: "Furão", bird: "Ave (não de capoeira)",
    rabbit: "Coelho doméstico", rodent: "Roedor doméstico", reptile: "Réptil",
    amphibian: "Anfíbio", fish: "Peixe ornamental", invertebrate: "Invertebrado",
  },
  en: {
    dog: "Dog", cat: "Cat", ferret: "Ferret", bird: "Bird (other than poultry)",
    rabbit: "Domestic rabbit", rodent: "Domestic rodent", reptile: "Reptile",
    amphibian: "Amphibian", fish: "Ornamental fish", invertebrate: "Invertebrate",
  },
  fr: {
    dog: "Chien", cat: "Chat", ferret: "Furet", bird: "Oiseau (hors volaille)",
    rabbit: "Lapin domestique", rodent: "Rongeur domestique", reptile: "Reptile",
    amphibian: "Amphibien", fish: "Poisson d'ornement", invertebrate: "Invertébré",
  },
};

export const NIVELES: Record<Idioma, Diccionario> = {
  es: {
    "0": "NIVEL 0", "1": "NIVEL 1", "2": "NIVEL 2", "3": "NIVEL 3",
    "0.que": "Localizar", "1.que": "Emergencia", "2.que": "Historial",
    "3.que": "Veterinario habitual",
  },
  pt: {
    "0": "NÍVEL 0", "1": "NÍVEL 1", "2": "NÍVEL 2", "3": "NÍVEL 3",
    "0.que": "Localizar", "1.que": "Emergência", "2.que": "Histórico",
    "3.que": "Veterinário habitual",
  },
  en: {
    "0": "LEVEL 0", "1": "LEVEL 1", "2": "LEVEL 2", "3": "LEVEL 3",
    "0.que": "Locate", "1.que": "Emergency", "2.que": "History",
    "3.que": "Regular vet",
  },
  fr: {
    "0": "NIVEAU 0", "1": "NIVEAU 1", "2": "NIVEAU 2", "3": "NIVEAU 3",
    "0.que": "Localiser", "1.que": "Urgence", "2.que": "Historique",
    "3.que": "Vétérinaire habituel",
  },
};

/** Etiquetas de la web del veterinario de guardia. Las que se ven con prisa. */
export const UI: Record<Idioma, Diccionario> = {
  es: {
    alergias: "Alergias",
    medicacionActual: "Medicación actual",
    cronicas: "Enfermedades crónicas",
    ningunaRegistrada: "Ninguna registrada",
    vacunaRabia: "Vacuna antirrábica",
    validaHasta: "Válida hasta",
    llamarTutor: "Llamar al dueño",
    pedirHistorial: "Pedir historial completo",
    declaradoPorTutor: "Declarado por el dueño",
    documentoClinica: "Documento de la clínica",
    numeroChip: "Número del microchip",
    existeFicha: "Existe una ficha para este microchip",
    sinVistaPrevia: "Sellado para el dueño · sin vista previa",
    traducirAuto: "Traducir (automático)",
    notaIdiomaOriginal: "Nota en su idioma original",
  },
  pt: {
    alergias: "Alergias",
    medicacionActual: "Medicação atual",
    cronicas: "Doenças crónicas",
    ningunaRegistrada: "Nenhuma registada",
    vacunaRabia: "Vacina antirrábica",
    validaHasta: "Válida até",
    llamarTutor: "Ligar ao tutor",
    pedirHistorial: "Pedir histórico completo",
    declaradoPorTutor: "Declarado pelo tutor",
    documentoClinica: "Documento da clínica",
    numeroChip: "Número do microchip",
    existeFicha: "Existe uma ficha para este microchip",
    sinVistaPrevia: "Selado para o tutor · sem pré-visualização",
    traducirAuto: "Traduzir (automático)",
    notaIdiomaOriginal: "Nota no idioma original",
  },
  en: {
    alergias: "Allergies",
    medicacionActual: "Current medication",
    cronicas: "Chronic conditions",
    ningunaRegistrada: "None recorded",
    vacunaRabia: "Rabies vaccination",
    validaHasta: "Valid until",
    llamarTutor: "Call the owner",
    pedirHistorial: "Request full history",
    declaradoPorTutor: "Declared by the owner",
    documentoClinica: "Clinic document",
    numeroChip: "Microchip number",
    existeFicha: "There is a record for this microchip",
    sinVistaPrevia: "Sealed for the owner · no preview",
    traducirAuto: "Translate (automatic)",
    notaIdiomaOriginal: "Note in its original language",
  },
  fr: {
    alergias: "Allergies",
    medicacionActual: "Traitement en cours",
    cronicas: "Maladies chroniques",
    ningunaRegistrada: "Aucune enregistrée",
    vacunaRabia: "Vaccin antirabique",
    validaHasta: "Valable jusqu'au",
    llamarTutor: "Appeler le propriétaire",
    pedirHistorial: "Demander l'historique complet",
    declaradoPorTutor: "Déclaré par le propriétaire",
    documentoClinica: "Document de la clinique",
    numeroChip: "Numéro de puce",
    existeFicha: "Une fiche existe pour cette puce",
    sinVistaPrevia: "Scellé pour le propriétaire · sans aperçu",
    traducirAuto: "Traduire (automatique)",
    notaIdiomaOriginal: "Note dans sa langue d'origine",
  },
};

export function t(idioma: Idioma, clave: string): string {
  return UI[idioma][clave] ?? UI[IDIOMA_POR_DEFECTO][clave] ?? clave;
}

export function especie(idioma: Idioma, codigo: string): string {
  return ESPECIES[idioma][codigo] ?? ESPECIES[IDIOMA_POR_DEFECTO][codigo] ?? codigo;
}

/** Las claves tienen que existir en los cuatro idiomas: lo comprueba el test. */
export function clavesQueFaltan(): string[] {
  const faltan: string[] = [];
  for (const tabla of [UI, ESPECIES, NIVELES]) {
    const base = Object.keys(tabla[IDIOMA_POR_DEFECTO]);
    for (const idioma of IDIOMAS) {
      for (const k of base) {
        if (!(k in tabla[idioma])) faltan.push(`${idioma}:${k}`);
      }
    }
  }
  return faltan;
}
