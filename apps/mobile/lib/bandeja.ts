/* Abrir la bandeja en el teléfono: la misma lectura que
   apps/portal/components/Bandeja.tsx, sin nada de React para poder probarla.

   Llegan notas de consulta, avisos de nivel 0, informes del software de
   gestión y registros firmados (vacunas, desparasitaciones, análisis). El
   contenido lo escribe quien sella, no el servidor: se valida campo a campo. */

import { fmt } from "@barkandmeow/i18n";
import { registroClinico, sobreFirmado, type RegistroClinico } from "@barkandmeow/schema";
import { abrirSellado, deBase64, firmaValida } from "./cripto";
import type { MensajeSellado, Origen } from "./api";
import type { T } from "./idioma";
import { TEXTOS } from "./textos";

export type Contenido =
  | { tipo: "nota"; clinica: string; motivo: string; diagnostico: string; tratamiento: string; observaciones: string }
  | { tipo: "aviso"; clinica: string; telefono: string; motivo: string }
  | {
      tipo: "informe";
      fecha: string;
      veterinario: string;
      motivo: string;
      diagnostico: string;
      tratamiento: string;
      observaciones: string;
      firmado?: boolean;
    }
  // El título se escribe al enseñarlo, en el idioma de la app: resumenRegistro.
  | { tipo: "certificado"; registro: Exclude<RegistroClinico, { tipo: "informe" }> }
  | { tipo: "firma-mala" }
  | { tipo: "ilegible" };

export type Mensaje = { id: string; petId: string; llegada: string; origen: Origen | null; contenido: Contenido };

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Para quien no tiene `t` a mano (y las pruebas): los textos en español. */
const enEspanol: T = (clave, valores) => (valores ? fmt(TEXTOS.es[clave], valores) : TEXTOS.es[clave]);

/**
 * Un registro firmado vale si la firma es de la clave de la conexión que lo
 * envió (la que dice el servidor), como `comprobar` en el portal.
 */
function comprobar(
  f: { registro: string; firma: string; clave: string },
  origen: Origen | null,
): RegistroClinico | null {
  if (!firmaValida(f)) return null;
  if (!origen?.firma || origen.firma !== f.clave) return null;
  try {
    const r = registroClinico.safeParse(JSON.parse(f.registro));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

/** Título y una línea de detalle de un registro de viaje. Las fechas, dd/mm/aaaa en todos los idiomas. */
export function resumenRegistro(
  r: { tipo: string } & Record<string, unknown>,
  t: T = enEspanol,
): { titulo: string; detalle: string } {
  const f = (x: unknown) => (typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x.split("-").reverse().join("/") : "");
  const partes = (xs: unknown[]) => xs.filter((x) => typeof x === "string" && x).join(" · ");
  if (r.tipo === "vacuna")
    return {
      titulo:
        r.enfermedad === "rabia"
          ? t("bandeja.reg.vacunaRabia")
          : r.nombre
            ? t("bandeja.reg.vacunaDe", { nombre: String(r.nombre) })
            : t("bandeja.reg.vacuna"),
      detalle: partes([
        f(r.fecha),
        r.producto,
        r.lote && t("bandeja.reg.lote", { lote: String(r.lote) }),
        f(r.validaHasta) && t("bandeja.reg.validaHasta", { fecha: f(r.validaHasta) }),
      ]),
    };
  if (r.tipo === "desparasitacion")
    return {
      titulo: r.contra === "equinococo" ? t("bandeja.reg.tenia") : t("bandeja.reg.desparasitacion"),
      detalle: partes([f(r.fecha) && `${f(r.fecha)} ${r.hora ?? ""}`.trim(), r.producto]),
    };
  if (r.tipo === "titulacion")
    return {
      titulo: t("bandeja.reg.titulacion"),
      detalle: partes([
        `${r.resultado} UI/ml`,
        f(r.fechaMuestra) && t("bandeja.reg.muestra", { fecha: f(r.fechaMuestra) }),
        r.laboratorio,
      ]),
    };
  return { titulo: t("bandeja.reg.registro"), detalle: "" };
}

export function interpretar(claro: Uint8Array, origen: Origen | null): Contenido {
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(new TextDecoder().decode(claro)) as Record<string, unknown>;
  } catch {
    return { tipo: "ilegible" };
  }
  if (j?.version !== 1) return { tipo: "ilegible" };
  if (j.tipo === "firmado") {
    const f = sobreFirmado.safeParse(j);
    if (!f.success) return { tipo: "ilegible" };
    const r = comprobar(f.data, origen);
    if (!r) return { tipo: "firma-mala" };
    if (r.tipo === "informe")
      return {
        tipo: "informe",
        fecha: r.fecha,
        veterinario: r.veterinario,
        motivo: r.motivo,
        diagnostico: r.diagnostico,
        tratamiento: r.tratamiento,
        observaciones: r.observaciones,
        firmado: true,
      };
    return { tipo: "certificado", registro: r };
  }
  if (j.tipo === "nota")
    return {
      tipo: "nota",
      clinica: texto(j.clinica),
      motivo: texto(j.motivo),
      diagnostico: texto(j.diagnostico),
      tratamiento: texto(j.tratamiento),
      observaciones: texto(j.observaciones),
    };
  if (j.tipo === "aviso")
    return { tipo: "aviso", clinica: texto(j.clinica), telefono: texto(j.telefono), motivo: texto(j.motivo) };
  if (j.tipo === "informe") {
    const campos = {
      motivo: texto(j.motivo),
      diagnostico: texto(j.diagnostico),
      tratamiento: texto(j.tratamiento),
      observaciones: texto(j.observaciones),
    };
    // Sin clave de API no se sabe qué clínica lo envió: se enseña como nota.
    if (!origen) return { tipo: "nota", clinica: "", ...campos };
    const fecha = texto(j.fecha);
    return {
      tipo: "informe",
      fecha: /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : "",
      veterinario: texto(j.veterinario),
      ...campos,
    };
  }
  return { tipo: "ilegible" };
}

export function abrirTodos(secreta: Uint8Array, sellados: MensajeSellado[]): Mensaje[] {
  return sellados.map((m) => {
    let contenido: Contenido = { tipo: "ilegible" };
    const sobre = deBase64(m.sellado);
    if (sobre) {
      try {
        contenido = interpretar(abrirSellado(secreta, sobre), m.origen);
      } catch {
        // Sellado para otra clave o dañado: se enseña como ilegible.
      }
    }
    return { id: m.id, petId: m.petId, llegada: m.llegada, origen: m.origen, contenido };
  });
}
