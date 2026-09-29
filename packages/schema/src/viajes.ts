import { esParteA } from "./species.js";
import type { PasaporteDueno, RegistroDesparasitacion, RegistroTitulacion, RegistroVacuna } from "./pasaporte.js";

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
    nombre: "Irlanda, Finlandia, Malta, Noruega o Irlanda del Norte",
    detalle: "Piden además tratamiento contra la tenia a los perros",
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
