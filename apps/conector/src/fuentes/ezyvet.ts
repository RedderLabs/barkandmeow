import { httpReal, pedirJson, type Http } from "../http.js";
import { vacunaORegistro, type Reglas } from "../reglas.js";
import { fechaDe, limpiarChip, recortar, type Hallazgo } from "../registros.js";
import type { Fuente, Lectura } from "../sincronizar.js";

/* ezyVet (https://developers.ezyvet.com).

   - Token: POST /v1/oauth/access_token con partner_id, client_id,
     client_secret, grant_type=client_credentials y scope. Dura 12 horas.
   - Listas: {"meta": {items_page_total…}, "items": [{"<recurso>": {…}}]},
     hasta 200 por página con ?limit=200&page=N.
   - Filtros: campo={"gt":…} en JSON dentro de la query.
   - Fechas en epoch (segundos), como texto.

   Qué se lee:
   - Vacunaciones (/v1/vaccination) modificadas desde la última vuelta. No
     llevan el animal: se llega a él por consult_id → consulta → animal_id.
   - Consultas (/v1/consult) cuya fecha quedó atrás hace más de
     EZYVET_ESPERA_HORAS (24 por defecto). ezyVet no marca una consulta como
     cerrada, así que se espera a que deje de editarse para no mandar al dueño
     cada versión. Sus entradas de historial (/v1/history) van como
     observaciones y la descripción como motivo. */

type Meta = { items_page?: string | number; items_page_total?: string | number };
type Lista<K extends string, T> = { meta?: Meta; items?: Record<K, T>[] };

export type ConsultaEzy = { id: string; active?: string; date?: string; animal_id?: string; description?: string };
export type VacunaEzy = {
  id: string;
  active?: string;
  consult_id?: string;
  product_id?: string;
  description?: string;
  notes?: string;
  date_of_administration?: string;
  date_of_next_administration?: string;
};
type AnimalEzy = { id: string; microchip_number?: string };
type ProductoEzy = { id: string; name?: string };
type HistoriaEzy = { id: string; active?: string; consult_id?: string; comments?: string; timestamp?: string };

export type ConfigEzyVet = {
  url: string;
  partnerId: string;
  clientId: string;
  clientSecret: string;
  scope: string;
  siteUid?: string;
  diasIniciales: number;
  esperaHoras: number;
  reglas: Reglas;
};

export type CursorEzyVet = { vacunas: number; consultas: number };

const POR_PAGINA = 200;
const TROZO_IN = 100;
/** Solapamiento entre vueltas: las huellas quitan los repetidos. */
const SOLAPE_S = 300;

const vivo = (x: { active?: string | boolean }) => !(x.active === "0" || x.active === "false" || x.active === false);
const epoch = (s: string | undefined) => {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const trozos = <T>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

export class FuenteEzyVet implements Fuente {
  readonly nombre = "ezyvet";
  private token: { valor: string; caduca: number } | null = null;

  constructor(
    private readonly c: ConfigEzyVet,
    private readonly http: Http = httpReal,
    private readonly ahora: () => number = Date.now,
  ) {}

  private async pedirToken(): Promise<string> {
    if (this.token && this.token.caduca > this.ahora()) return this.token.valor;
    const t = await pedirJson<{ access_token: string; expires_in?: number }>(
      this.http,
      `${this.c.url}/v1/oauth/access_token`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          partner_id: this.c.partnerId,
          client_id: this.c.clientId,
          client_secret: this.c.clientSecret,
          grant_type: "client_credentials",
          scope: this.c.scope,
          ...(this.c.siteUid ? { site_uid: this.c.siteUid } : {}),
        }),
      },
      "ezyvet",
    );
    /* La documentación dice que el token dura 12 horas, pero el ejemplo de
       expires_in no cuadra ni como duración ni como epoch. Se renueva a las
       11 horas, o antes si expires_in es una duración más corta. */
    const dura = t.expires_in && t.expires_in < 11 * 3600 ? t.expires_in * 1000 : 11 * 3600_000;
    this.token = { valor: t.access_token, caduca: this.ahora() + dura - 60_000 };
    return t.access_token;
  }

  /** Todas las páginas de una lista, ya desenvueltas del nombre del recurso. */
  private async lista<K extends string, T>(ruta: string, clave: K, filtros: Record<string, unknown>): Promise<T[]> {
    const fuera: T[] = [];
    for (let pagina = 1; ; pagina++) {
      const q = new URLSearchParams({ limit: String(POR_PAGINA), page: String(pagina) });
      for (const [k, v] of Object.entries(filtros)) q.set(k, typeof v === "string" ? v : JSON.stringify(v));
      const url = `${this.c.url}${ruta}?${q}`;
      let r: Lista<K, T>;
      try {
        r = await pedirJson<Lista<K, T>>(this.http, url, { headers: { authorization: `Bearer ${await this.pedirToken()}` } }, "ezyvet");
      } catch (e) {
        // Token caducado antes de tiempo: uno nuevo y otra vez.
        if (!/ezyvet: 401/.test((e as Error).message)) throw e;
        this.token = null;
        r = await pedirJson<Lista<K, T>>(this.http, url, { headers: { authorization: `Bearer ${await this.pedirToken()}` } }, "ezyvet");
      }
      for (const it of r.items ?? []) if (it[clave]) fuera.push(it[clave]);
      if (pagina >= Number(r.meta?.items_page_total ?? 1)) return fuera;
    }
  }

  private async porIds<K extends string, T extends { id: string }>(ruta: string, clave: K, ids: string[], campo = "id") {
    const unicos = [...new Set(ids.filter(Boolean))];
    const fuera: T[] = [];
    for (const t of trozos(unicos, TROZO_IN)) fuera.push(...(await this.lista<K, T>(ruta, clave, { [campo]: { in: t } })));
    return fuera;
  }

  async leer(cursor: unknown): Promise<Lectura> {
    const ahora = Math.floor(this.ahora() / 1000);
    const previo = cursor as CursorEzyVet | undefined;
    const inicio = ahora - this.c.diasIniciales * 86400;
    const hastaConsultas = ahora - this.c.esperaHoras * 3600;
    const desdeVacunas = (previo?.vacunas ?? inicio) - SOLAPE_S;
    const desdeConsultas = (previo?.consultas ?? inicio - this.c.esperaHoras * 3600) - SOLAPE_S;

    const vacunas = (
      await this.lista<"vaccination", VacunaEzy>("/v1/vaccination", "vaccination", {
        modified_at: { gt: desdeVacunas, lte: ahora },
      })
    ).filter(vivo);
    const consultas = (
      await this.lista<"consult", ConsultaEzy>("/v1/consult", "consult", {
        date: { gt: desdeConsultas, lte: hastaConsultas },
      })
    ).filter(vivo);

    // Las consultas de las vacunas que no vinieron en la lista.
    const porId = new Map(consultas.map((c) => [c.id, c]));
    const faltan = vacunas.map((v) => v.consult_id ?? "").filter((id) => id && !porId.has(id));
    for (const c of await this.porIds<"consult", ConsultaEzy>("/v1/consult", "consult", faltan)) porId.set(c.id, c);

    const animales = new Map(
      (await this.porIds<"animal", AnimalEzy>("/v1/animal", "animal", [...porId.values()].map((c) => c.animal_id ?? ""))).map(
        (a) => [a.id, limpiarChip(a.microchip_number)],
      ),
    );
    const productos = new Map(
      (await this.porIds<"product", ProductoEzy>("/v1/product", "product", vacunas.map((v) => v.product_id ?? ""))).map((p) => [
        p.id,
        p.name ?? "",
      ]),
    );
    const historia = new Map<string, HistoriaEzy[]>();
    for (const h of (
      await this.porIds<"history", HistoriaEzy & { id: string }>("/v1/history", "history", consultas.map((c) => c.id), "consult_id")
    ).filter(vivo)) {
      const k = h.consult_id ?? "";
      historia.set(k, [...(historia.get(k) ?? []), h]);
    }

    const chipDe = (consultId?: string) => animales.get(porId.get(consultId ?? "")?.animal_id ?? "") ?? "";
    const hallazgos: Hallazgo[] = [];

    for (const v of vacunas) {
      const dada = epoch(v.date_of_administration);
      if (!dada) continue;
      const proxima = epoch(v.date_of_next_administration);
      const fecha = fechaDe(new Date(dada * 1000));
      hallazgos.push({
        ref: `ezyvet:vaccination:${v.id}`,
        registro: vacunaORegistro({
          chip: chipDe(v.consult_id),
          fecha,
          producto: productos.get(v.product_id ?? "") || v.description || "",
          enfermedad: v.description,
          validaHasta: proxima ? fechaDe(new Date(proxima * 1000)) : null,
          reglas: this.c.reglas,
        }),
      });
    }

    for (const c of consultas) {
      const f = epoch(c.date);
      if (!f) continue;
      const notas = (historia.get(c.id) ?? [])
        .sort((a, b) => Number(a.timestamp ?? 0) - Number(b.timestamp ?? 0))
        .map((h) => (h.comments ?? "").trim())
        .filter(Boolean);
      if (!c.description?.trim() && !notas.length) continue;
      hallazgos.push({
        ref: `ezyvet:consult:${c.id}`,
        registro: {
          version: 1,
          tipo: "informe",
          chip: animales.get(c.animal_id ?? "") ?? "",
          fecha: fechaDe(new Date(f * 1000)),
          motivo: recortar(c.description, 200),
          observaciones: recortar(notas.join("\n\n"), 8000),
        },
      });
    }

    return { hallazgos, cursor: { vacunas: ahora, consultas: hastaConsultas } satisfies CursorEzyVet };
  }
}
