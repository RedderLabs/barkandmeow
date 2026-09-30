import type { z } from "zod";
import type { Ruta } from "./api/tipos";

/* Cliente tipado de apps/api, el mismo para el portal, la app y la clínica.
   Cada uno lo crea con su forma de hablar con el servidor:
   - portal y clínica: `base` es su proxy del mismo origen y la cookie httpOnly
     viaja sola (`credentials: "same-origin"`);
   - app: `base` es la URL pública y `cabeceras` añade `x-bm-cliente: app` y el
     `Bearer` que guarda el llavero;
   - servidor de Next: `base` es la URL interna y `cabeceras` reenvía la cookie.
   No valida las respuestas en ejecución: de eso se encargan los tests de la
   API, que comprueban cada una contra el catálogo. */

export class ErrorApi extends Error {
  readonly estado: number;
  /** El cuerpo de la respuesta de error: motivo, segundos, intentos… */
  readonly datos: Record<string, unknown>;
  constructor(estado: number, mensaje: string, datos: Record<string, unknown> = {}) {
    super(mensaje);
    this.estado = estado;
    this.datos = datos;
  }
}

/** `/pets/:id/shares/:shareId` → `{ id: string; shareId: string }`. */
type ParamsDe<P extends string> = P extends `${string}:${infer K}/${infer Resto}`
  ? { [k in K]: string } & ParamsDe<`/${Resto}`>
  : P extends `${string}:${infer K}`
    ? { [k in K]: string }
    : Record<never, never>;

type ConParams<R extends Ruta> = keyof ParamsDe<R["ruta"]> extends never
  ? { params?: undefined }
  : { params: ParamsDe<R["ruta"]> };

type ConCuerpo<R extends Ruta> = R["cuerpo"] extends z.ZodType
  ? { cuerpo: z.input<R["cuerpo"]> }
  : R["cuerpoBinario"] extends readonly string[]
    ? { cuerpo: Blob; tipo: string }
    : { cuerpo?: undefined };

type Extra = {
  /** Cabeceras solo para esta llamada (p. ej. el token de la sesión pendiente). */
  cabeceras?: Record<string, string>;
  cache?: RequestCache;
  /** Para no avisar de sesión caducada en una llamada que ya la espera. */
  sinAvisoDeSesion?: boolean;
};

export type Opciones<R extends Ruta> = ConParams<R> & ConCuerpo<R> & Extra;

/** Obligatorio solo si la ruta lleva parámetros o cuerpo. */
type Args<R extends Ruta> = keyof ParamsDe<R["ruta"]> extends never
  ? R["cuerpo"] extends z.ZodType
    ? [Opciones<R>]
    : R["cuerpoBinario"] extends readonly string[]
      ? [Opciones<R>]
      : [Opciones<R>?]
  : [Opciones<R>];

export type Respuesta<R extends Ruta> = R["respuesta"] extends z.ZodType ? z.output<R["respuesta"]> : never;

export type Config = {
  /** Sin barra final: `/mi-mascota/api`, `https://barkandmeow.app/api`… */
  base: string;
  credentials?: RequestCredentials;
  /** Cabeceras de cada llamada. Puede ser asíncrona (el llavero de la app lo es). */
  cabeceras?: () => Record<string, string> | Promise<Record<string, string>>;
  /** El servidor respondió 401 a una llamada con sesión. */
  alCaducar?: () => void | Promise<void>;
  fetch?: typeof fetch;
};

/** Sustituye `:param` por su valor, siempre codificado. */
export function rellenar(ruta: string, params: Record<string, string> = {}): string {
  return ruta.replace(/:([A-Za-z]+)/g, (_, k: string) => {
    const v = params[k];
    if (v === undefined) throw new Error(`falta el parámetro ${k} de ${ruta}`);
    return encodeURIComponent(v);
  });
}

export function crearCliente(config: Config) {
  const f = config.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));

  async function pedir<R extends Ruta>(r: R, o: Partial<Opciones<R>> & { tipo?: string } = {}): Promise<Response> {
    const cabeceras: Record<string, string> = { ...(await config.cabeceras?.()), ...o.cabeceras };
    let cuerpo: BodyInit | undefined;
    if (r.cuerpo) {
      cabeceras["content-type"] = "application/json";
      cuerpo = JSON.stringify(o.cuerpo ?? {});
    } else if (r.cuerpoBinario && o.cuerpo) {
      cabeceras["content-type"] = o.tipo ?? "application/octet-stream";
      cuerpo = o.cuerpo as unknown as Blob;
    }
    let res: Response;
    try {
      res = await f(`${config.base}${rellenar(r.ruta, o.params as Record<string, string> | undefined)}`, {
        method: r.metodo,
        headers: cabeceras,
        body: cuerpo,
        credentials: config.credentials,
        cache: o.cache,
      });
    } catch {
      throw new ErrorApi(0, "sin conexión");
    }
    /* Solo con sesión de verdad: un 401 en la entrada o en el paso del código
       es una contraseña o un código equivocados, no una sesión caducada. */
    const conSesion = r.acceso === "dueno" || r.acceso === "clinica";
    if (res.status === 401 && conSesion && !o.sinAvisoDeSesion) await config.alCaducar?.();
    if (!res.ok) {
      const datos = (await res.json().catch(() => ({}))) as { error?: string };
      throw new ErrorApi(res.status, datos.error ?? `error ${res.status}`, datos);
    }
    return res;
  }

  return {
    /** Llamada con respuesta JSON, tipada por la ruta del catálogo. */
    async llamar<R extends Ruta>(r: R, ...[o]: Args<R>): Promise<Respuesta<R>> {
      const res = await pedir(r, o as Partial<Opciones<R>>);
      return (await res.json().catch(() => ({}))) as Respuesta<R>;
    },
    /** Llamada con respuesta binaria (foto, adjunto sellado…). */
    async bytes<R extends Ruta>(r: R, ...[o]: Args<R>): Promise<Uint8Array> {
      const res = await pedir(r, o as Partial<Opciones<R>>);
      return new Uint8Array(await res.arrayBuffer());
    },
  };
}

export type Cliente = ReturnType<typeof crearCliente>;
