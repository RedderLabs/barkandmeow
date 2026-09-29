import { esParteA } from "./species";
import type { PasaporteDueno, RegistroDesparasitacion, RegistroTitulacion, RegistroVacuna } from "./pasaporte";

/* Requisitos de viaje para perros, gatos y hurones que salen de España sin
   fines comerciales.

   Base legal: Reglamento Delegado (UE) 2026/131, que desde el 22/04/2026
   sustituye al Reglamento (UE) 576/2013 para estos movimientos. El contenido
   de los requisitos no cambió. Revisado el 29/09/2026 contra las fuentes que
   enlaza cada destino; los requisitos cambian, y la app enseña la fecha de
   revisión y la fuente para que el dueño lo compruebe antes de viajar.

   Esto es una ayuda para preparar el viaje, no un certificado: en la frontera
   vale el pasaporte europeo en papel, sellado por un veterinario autorizado. */

export const REVISADO = "2026-09-29";

export type Destino = "ue" | "ue-equinococo" | "gb" | "fuera-ue";

type Fuente = { nombre: string; url: string };

const UE: Fuente = {
  nombre: "Comisión Europea: viajar con mascotas dentro de la UE",
  url: "https://food.ec.europa.eu/animals/movement-pets/eu-legislation/non-commercial-movement-within-eu_en",
};
const MAPA: Fuente = {
  nombre: "Ministerio de Agricultura: viajar con perros, gatos y hurones",
  url: "https://www.mapa.gob.es/es/ganaderia/temas/comercio-exterior-ganadero/desplazamiento-animales-compania/viajar-perros-gatos-hurones",
};

export const DESTINOS: Record<Destino, { nombre: string; detalle: string; fuentes: Fuente[] }> = {
  ue: {
    nombre: "Otro país de la UE",
    detalle: "Francia, Portugal, Italia, Alemania…",
    fuentes: [UE, MAPA],
  },
  "ue-equinococo": {
    nombre: "Irlanda, Finlandia, Malta o Noruega",
    detalle: "También Irlanda del Norte. Piden además tratamiento contra la tenia a los perros",
    fuentes: [
      UE,
      {
        nombre: "Finlandia (Ruokavirasto)",
        url: "https://www.ruokavirasto.fi/en/themes/import-and-export/eu-countries-norway-and-switzerland/animals/dogs-cats-and-ferrets/trade-of-dogs-cats-and-ferrets-from-eu-countries-to-finland-non-commercial-movement/",
      },
      {
        nombre: "Noruega (Mattilsynet)",
        url: "https://www.mattilsynet.no/dyr/kjaeledyr/reise-med-kjaeledyr/reise-til-norge-med-hund-fra-eu-eos",
      },
    ],
  },
  gb: {
    nombre: "Gran Bretaña",
    detalle: "Inglaterra, Escocia y Gales",
    fuentes: [{ nombre: "GOV.UK: bring your pet to Great Britain", url: "https://www.gov.uk/bring-pet-to-great-britain" }],
  },
  "fuera-ue": {
    nombre: "Fuera de la UE, con vuelta",
    detalle: "Para volver sin cuarentena desde un país que no está en la lista de la UE",
    fuentes: [
      {
        nombre: "Comisión Europea: entrar en la UE desde fuera",
        url: "https://food.ec.europa.eu/animals/movement-pets/eu-legislation/non-commercial-movement-non-eu-countries_en",
      },
      MAPA,
    ],
  },
};

export type Estado = "ok" | "falta" | "aviso" | "info";

export type Requisito = {
  clave: string;
  estado: Estado;
  titulo: string;
  detalle: string;
  /** Si lo cumple un registro firmado por una clínica o solo lo declaró el dueño. */
  origen?: "certificado" | "declarado";
};

/** Un registro del pasaporte con su origen ya resuelto (firma comprobada o no). */
export type RegistroEvaluable =
  | { origen: "certificado" | "declarado"; registro: RegistroVacuna }
  | { origen: "certificado" | "declarado"; registro: RegistroDesparasitacion }
  | { origen: "certificado" | "declarado"; registro: RegistroTitulacion };

const DIA = 864e5;
const dia = (iso: string) => new Date(`${iso}T00:00:00`);
const fechaCorta = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
const fechaHora = (d: Date) =>
  `${fechaCorta(d)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** Lo certificado antes que lo declarado; dentro de cada uno, lo más reciente. */
const mejor = <T extends RegistroEvaluable>(xs: T[], fecha: (x: T) => string) =>
  [...xs].sort(
    (a, b) =>
      (a.origen === b.origen ? 0 : a.origen === "certificado" ? -1 : 1) || fecha(b).localeCompare(fecha(a)),
  )[0];

/**
 * Qué falta para un viaje. `llegada` es cuándo entra el animal en el país de
 * destino: el tratamiento contra la tenia se cuenta en horas hasta entonces.
 */
export function evaluarViaje(
  pasaporte: Pick<PasaporteDueno, "especie" | "chip" | "numeroPasaporte">,
  registros: RegistroEvaluable[],
  destino: Destino,
  llegada: Date,
): Requisito[] {
  if (!esParteA(pasaporte.especie))
    return [
      {
        clave: "especie",
        estado: "info",
        titulo: "Requisitos según el destino",
        detalle:
          "Las reglas armonizadas de la UE son para perros, gatos y hurones. Para esta especie, consulta los servicios veterinarios del país de destino.",
      },
    ];

  const r: Requisito[] = [];
  const vacunas = registros.filter(
    (x): x is Extract<RegistroEvaluable, { registro: RegistroVacuna }> =>
      x.registro.tipo === "vacuna" && x.registro.enfermedad === "rabia",
  );
  const certificadoConChip = registros.some((x) => x.origen === "certificado" && x.registro.chip);

  r.push(
    pasaporte.chip || certificadoConChip
      ? {
          clave: "chip",
          estado: "ok",
          titulo: "Microchip",
          detalle: "Tiene que estar puesto antes o el mismo día que la vacuna de la rabia.",
          origen: certificadoConChip ? "certificado" : "declarado",
        }
      : {
          clave: "chip",
          estado: "falta",
          titulo: "Microchip",
          detalle: "Apunta el número de chip en el pasaporte.",
        },
  );

  r.push(
    destino === "fuera-ue" || pasaporte.numeroPasaporte
      ? {
          clave: "pasaporte",
          estado: pasaporte.numeroPasaporte ? "ok" : "aviso",
          titulo: "Pasaporte europeo en papel",
          detalle: pasaporte.numeroPasaporte
            ? `Número ${pasaporte.numeroPasaporte}. Llévalo contigo: es el documento que vale en la frontera.`
            : "Para volver a la UE hace falta el pasaporte europeo o un certificado sanitario. Apunta su número aquí.",
          origen: pasaporte.numeroPasaporte ? "declarado" : undefined,
        }
      : {
          clave: "pasaporte",
          estado: "falta",
          titulo: "Pasaporte europeo en papel",
          detalle: "Lo expide un veterinario autorizado. Cuando lo tengas, apunta su número aquí.",
        },
  );

  const vigentes = vacunas.filter((v) => dia(v.registro.validaHasta).getTime() >= llegada.getTime());
  const rabia = mejor(vigentes, (v) => v.registro.fecha);
  if (!rabia) {
    const ultima = mejor(vacunas, (v) => v.registro.fecha);
    r.push({
      clave: "rabia",
      estado: "falta",
      titulo: "Vacuna de la rabia vigente",
      detalle: ultima
        ? `La última consta válida hasta el ${fechaCorta(dia(ultima.registro.validaHasta))}, antes del viaje. Hace falta revacunar, y si ya había caducado, esperar 21 días.`
        : "No consta ninguna. Se pone a partir de las 12 semanas de edad, y tras la primera hay que esperar 21 días para viajar.",
    });
  } else {
    const desde = new Date(dia(rabia.registro.fecha).getTime() + 21 * DIA);
    r.push({
      clave: "rabia",
      estado: desde.getTime() > llegada.getTime() ? "aviso" : "ok",
      titulo: "Vacuna de la rabia vigente",
      detalle:
        desde.getTime() > llegada.getTime()
          ? `Puesta el ${fechaCorta(dia(rabia.registro.fecha))}. Si es la primera, o la anterior ya había caducado, no puede viajar hasta el ${fechaCorta(desde)}. Si es un refuerzo a tiempo, no hay espera.`
          : `Válida hasta el ${fechaCorta(dia(rabia.registro.validaHasta))}.`,
      origen: rabia.origen,
    });
  }

  if ((destino === "ue-equinococo" || destino === "gb") && pasaporte.especie === "dog") {
    const desde = new Date(llegada.getTime() - 120 * 3600_000);
    const hasta = new Date(llegada.getTime() - 24 * 3600_000);
    const tratamientos = registros.filter(
      (x): x is Extract<RegistroEvaluable, { registro: RegistroDesparasitacion }> =>
        x.registro.tipo === "desparasitacion" && x.registro.contra === "equinococo",
    );
    const aTiempo = tratamientos.filter((t) => {
      const cuando = new Date(`${t.registro.fecha}T${t.registro.hora}:00`).getTime();
      return cuando >= desde.getTime() && cuando <= hasta.getTime();
    });
    const t = mejor(aTiempo, (x) => `${x.registro.fecha}T${x.registro.hora}`);
    r.push(
      t
        ? {
            clave: "equinococo",
            estado: "ok",
            titulo: "Tratamiento contra la tenia",
            detalle: `Dado el ${fechaCorta(dia(t.registro.fecha))} a las ${t.registro.hora}, dentro del plazo.`,
            origen: t.origen,
          }
        : {
            clave: "equinococo",
            estado: "falta",
            titulo: "Tratamiento contra la tenia",
            detalle: `Un veterinario tiene que darle praziquantel entre el ${fechaHora(desde)} y el ${fechaHora(hasta)}, y anotarlo en el pasaporte. No hace falta si llega directamente desde otro de estos países${destino === "gb" ? " o desde Irlanda del Norte" : ""}.`,
          },
    );
  }

  if (destino === "gb")
    r.push({
      clave: "ruta",
      estado: "info",
      titulo: "Ruta y compañía aprobadas",
      detalle: "Gran Bretaña acepta el pasaporte europeo, pero hay que entrar por una ruta y con una compañía aprobadas, salvo desde Irlanda.",
    });

  if (destino === "fuera-ue") {
    const analisis = registros.filter(
      (x): x is Extract<RegistroEvaluable, { registro: RegistroTitulacion }> =>
        x.registro.tipo === "titulacion" && x.registro.resultado >= 0.5,
    );
    const a = mejor(analisis, (x) => x.registro.fechaMuestra);
    r.push(
      a
        ? {
            clave: "titulacion",
            estado: "ok",
            titulo: "Análisis de anticuerpos de la rabia",
            detalle: `${a.registro.resultado} UI/ml, muestra del ${fechaCorta(dia(a.registro.fechaMuestra))}. Hecho antes de salir y anotado en el pasaporte, a la vuelta no hay que esperar 3 meses, siempre que la vacuna no caduque.`,
            origen: a.origen,
          }
        : {
            clave: "titulacion",
            estado: "aviso",
            titulo: "Análisis de anticuerpos de la rabia",
            detalle:
              "Para volver desde un país que no está en la lista de la UE: al menos 0,5 UI/ml, con la muestra tomada 30 días o más después de la vacuna. Hazlo antes de salir y que conste en el pasaporte; si no, a la vuelta hay que esperar 3 meses desde la muestra.",
          },
    );
    r.push({
      clave: "destino",
      estado: "info",
      titulo: "Requisitos del país de destino",
      detalle: "Cada país pone los suyos para entrar (certificado sanitario, permisos, cuarentena). Consulta su embajada o sus servicios veterinarios.",
    });
  }

  return r;
}

/* ── Recordatorios ─────────────────────────────────────────────
   Las fechas que el dueño no puede dejar pasar. Se convierten en un archivo
   de calendario en su navegador: el servidor no sabe nada del pasaporte, así
   que tampoco podría avisar él. */

export type Recordatorio = {
  clave: string;
  titulo: string;
  descripcion: string;
  inicio: Date;
  /** Sin fin: un día entero. Con fin: una franja con hora. */
  fin?: Date;
};

export function recordatoriosViaje(
  pasaporte: Pick<PasaporteDueno, "especie" | "chip" | "numeroPasaporte">,
  registros: RegistroEvaluable[],
  destino: Destino,
  llegada: Date,
  nombre: string,
  ahora = new Date(),
): Recordatorio[] {
  const quien = nombre || "tu mascota";
  const r: Recordatorio[] = [];
  const requisitos = evaluarViaje(pasaporte, registros, destino, llegada);
  const estado = (clave: string) => requisitos.find((x) => x.clave === clave)?.estado;

  const vacunas = registros.filter(
    (x): x is Extract<RegistroEvaluable, { registro: RegistroVacuna }> =>
      x.registro.tipo === "vacuna" && x.registro.enfermedad === "rabia",
  );
  const ultima = mejor(vacunas, (v) => v.registro.validaHasta);
  if (ultima) {
    const caduca = dia(ultima.registro.validaHasta);
    const aviso = new Date(caduca.getTime() - 30 * DIA);
    if (aviso.getTime() > ahora.getTime())
      r.push({
        clave: "rabia-renovar",
        titulo: `Renovar la vacuna de la rabia de ${quien}`,
        descripcion: `Caduca el ${fechaCorta(caduca)}. Si se renueva antes, no hay espera para viajar; si caduca, tras la nueva vacuna hay que esperar 21 días.`,
        inicio: aviso,
      });
    if (estado("rabia") === "aviso") {
      const desde = new Date(dia(ultima.registro.fecha).getTime() + 21 * DIA);
      if (desde.getTime() > ahora.getTime())
        r.push({
          clave: "rabia-espera",
          titulo: `${quien} ya puede viajar`,
          descripcion: "Han pasado 21 días desde la vacuna de la rabia.",
          inicio: desde,
        });
    }
  }

  if (estado("equinococo") === "falta") {
    const desde = new Date(llegada.getTime() - 120 * 3600_000);
    const hasta = new Date(llegada.getTime() - 24 * 3600_000);
    if (hasta.getTime() > ahora.getTime())
      r.push({
        clave: "equinococo",
        titulo: `Tratamiento contra la tenia de ${quien}`,
        descripcion: `Entre el ${fechaHora(desde)} y el ${fechaHora(hasta)}, un veterinario tiene que darle praziquantel y anotarlo en el pasaporte europeo.`,
        inicio: desde,
        fin: hasta,
      });
  }

  const vispera = new Date(llegada.getTime() - DIA);
  if (vispera.getTime() > ahora.getTime())
    r.push({
      clave: "viaje",
      titulo: `Viaje de ${quien}: lleva el pasaporte europeo`,
      descripcion: `Llegada a ${DESTINOS[destino].nombre} el ${fechaHora(llegada)}. En la frontera vale el pasaporte de papel.`,
      inicio: new Date(vispera.getFullYear(), vispera.getMonth(), vispera.getDate()),
    });

  return r;
}

/** Los recordatorios en formato iCalendar (RFC 5545), con aviso incluido. */
export function aCalendario(recordatorios: Recordatorio[], ahora = new Date()): string {
  const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const soloDia = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const escapar = (t: string) =>
    t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  // Líneas de más de 75 octetos se parten con un espacio al principio.
  const plegar = (linea: string) => {
    const bytes = new TextEncoder().encode(linea);
    if (bytes.length <= 75) return linea;
    const trozos: string[] = [];
    let actual = "";
    for (const ch of linea) {
      if (new TextEncoder().encode(actual + ch).length > (trozos.length ? 74 : 75)) {
        trozos.push(actual);
        actual = "";
      }
      actual += ch;
    }
    trozos.push(actual);
    return trozos.join("\r\n ");
  };
  const lineas = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Bark & Meow//Pasaporte de viaje//ES", "CALSCALE:GREGORIAN"];
  for (const x of recordatorios) {
    lineas.push(
      "BEGIN:VEVENT",
      `UID:${x.clave}-${x.inicio.getTime()}@barkandmeow.app`,
      `DTSTAMP:${utc(ahora)}`,
      ...(x.fin
        ? [`DTSTART:${utc(x.inicio)}`, `DTEND:${utc(x.fin)}`]
        : [`DTSTART;VALUE=DATE:${soloDia(x.inicio)}`, `DTEND;VALUE=DATE:${soloDia(new Date(x.inicio.getTime() + DIA))}`]),
      `SUMMARY:${escapar(x.titulo)}`,
      `DESCRIPTION:${escapar(x.descripcion)}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapar(x.titulo)}`,
      x.fin ? "TRIGGER:-PT12H" : "TRIGGER:-PT15H",
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lineas.push("END:VCALENDAR");
  return lineas.map(plegar).join("\r\n") + "\r\n";
}
