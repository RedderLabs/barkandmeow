import { httpReal, pedirJson, type Http } from "../http.js";
import { vacunaORegistro, type Reglas } from "../reglas.js";
import { fechaDe, limpiarChip, recortar, type Hallazgo } from "../registros.js";
import type { Fuente, Lectura } from "../sincronizar.js";

/* Provet Cloud (https://developers.provetcloud.com/restapi/).

   - Base: https://provetcloud.com/<provet_id>/api/0.1/ (PROVET_URL es la
     parte hasta <provet_id>).
   - Token: OAuth 2.0 client_credentials en <PROVET_URL>/oauth2/token/, con
     scope restapi. El token de API antiguo («Authorization: Token …») está
     retirado; se admite con PROVET_TOKEN solo para instalaciones que aún lo
     tengan.
   - Listas paginadas: {count, next, previous, results}; se sigue `next`.
   - Filtros: campo__gt=valor, fechas como «AAAA-MM-DD hh:mm+00:00».

   Qué se lee:
   - Vacunas: líneas de medicamento con vaccination=true
     (/consultation_items/medicine/), modificadas desde la última vuelta. Traen
     nombre, lote (batch_number), enfermedad (vaccination_disease), fecha de
     uso y el paciente. No traen fecha de revacunación: la pone una regla de
     validez de la clínica o la vacuna viaja como informe.
   - Consultas cerradas (ended) desde la última vuelta, con sus diagnósticos,
     sus notas clínicas y los medicamentos que no son vacunas. Una por
     paciente de la consulta. */

type Pagina<T> = { count?: number; next?: string | null; results?: T[] };

export type MedicinaProvet = {
  url?: string;
  name?: string;
  batch_number?: string;
  vaccination?: boolean;
  vaccination_disease?: string;
  used?: string;
  created?: string;
  quantity?: number;
  unit?: string;
  patient?: string;
  consultation?: string;
};
export type ConsultaProvet = {
  id: number;
  url?: string;
  patients?: string[];
  complaint?: string;
  started?: string;
  ended?: string;
  finished?: string;
};
type PacienteProvet = { id: number; microchip?: string };
type DiagnosticoProvet = { name?: string; type?: number | string };
type NotaProvet = { text?: string; note?: string; type?: number | string };

export type ConfigProvet = {
  /** https://provetcloud.com/<provet_id> */
  url: string;
  clientId?: string;
  clientSecret?: string;
  tokenAntiguo?: string;
  diasIniciales: number;
  reglas: Reglas;
};

export type CursorProvet = { vacunas: string; consultas: string };

const SOLAPE_MS = 5 * 60_000;
/** Formato de fecha de los filtros de Provet: «2017-12-24 15:30+00:00». */
const filtroFecha = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ") + "+00:00";

export class FuenteProvet implements Fuente {
  readonly nombre = "provet";
  private token: { valor: string; caduca: number } | null = null;
  private readonly api: string;

  constructor(
    private readonly c: ConfigProvet,
    private readonly http: Http = httpReal,
    private readonly ahora: () => number = Date.now,
  ) {
    this.api = `${c.url.replace(/\/$/, "")}/api/0.1`;
    if (!c.tokenAntiguo && !(c.clientId && c.clientSecret))
      throw new Error("Provet: faltan PROVET_CLIENT_ID y PROVET_CLIENT_SECRET");
  }

  private async autorizacion(): Promise<string> {
    if (this.c.tokenAntiguo) return `Token ${this.c.tokenAntiguo}`;
    if (this.token && this.token.caduca > this.ahora()) return `Bearer ${this.token.valor}`;
    const t = await pedirJson<{ access_token: string; expires_in?: number }>(
      this.http,
      `${this.c.url.replace(/\/$/, "")}/oauth2/token/`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: this.c.clientId!,
          client_secret: this.c.clientSecret!,
          scope: "restapi",
        }).toString(),
      },
      "provet",
    );
    this.token = { valor: t.access_token, caduca: this.ahora() + (t.expires_in ?? 36000) * 1000 - 60_000 };
    return `Bearer ${t.access_token}`;
  }

  private async get<T>(url: string): Promise<T> {
    return pedirJson<T>(this.http, url, { headers: { authorization: await this.autorizacion() } }, "provet");
  }

  /** Todas las páginas, siguiendo `next`. Acepta también una lista sin paginar. */
  private async todas<T>(ruta: string, filtros: Record<string, string> = {}): Promise<T[]> {
    let url: string | null | undefined = `${this.api}${ruta}?${new URLSearchParams({ page_size: "500", ...filtros })}`;
    const fuera: T[] = [];
    while (url) {
      const r: Pagina<T> | T[] = await this.get<Pagina<T> | T[]>(url);
      if (Array.isArray(r)) return [...fuera, ...r];
      fuera.push(...(r.results ?? []));
      url = r.next;
    }
    return fuera;
  }

  private readonly chips = new Map<string, string>();
  private async chipDe(urlPaciente: string | undefined): Promise<string> {
    if (!urlPaciente) return "";
    if (!this.chips.has(urlPaciente)) {
      const p = await this.get<PacienteProvet>(urlPaciente);
      this.chips.set(urlPaciente, limpiarChip(p.microchip));
    }
    return this.chips.get(urlPaciente)!;
  }

  async leer(cursor: unknown): Promise<Lectura> {
    const ahora = this.ahora();
    const previo = cursor as CursorProvet | undefined;
    const inicio = ahora - this.c.diasIniciales * 864e5;
    const desdeV = (previo ? Date.parse(previo.vacunas) : inicio) - SOLAPE_MS;
    const desdeC = (previo ? Date.parse(previo.consultas) : inicio) - SOLAPE_MS;
    const hallazgos: Hallazgo[] = [];

    const vacunas = await this.todas<MedicinaProvet>("/consultation_items/medicine/", {
      vaccination__is: "true",
      modified__gt: filtroFecha(desdeV),
      modified__lte: filtroFecha(ahora),
    });
    for (const v of vacunas) {
      const cuando = v.used ?? v.created;
      if (!cuando) continue;
      hallazgos.push({
        ref: `provet:medicine:${v.url ?? cuando}`,
        registro: vacunaORegistro({
          chip: await this.chipDe(v.patient),
          fecha: fechaDe(new Date(cuando)),
          producto: v.name ?? "",
          enfermedad: v.vaccination_disease,
          lote: v.batch_number,
          reglas: this.c.reglas,
        }),
      });
    }

    const consultas = await this.todas<ConsultaProvet>("/consultation/", {
      ended__gt: filtroFecha(desdeC),
      ended__lte: filtroFecha(ahora),
    });
    for (const c of consultas) {
      if (!c.ended) continue;
      const [diagnosticos, notas, medicinas] = await Promise.all([
        this.todas<DiagnosticoProvet>(`/consultation/${c.id}/consultationdiagnosis/`),
        this.todas<NotaProvet>(`/consultation/${c.id}/consultationnote/`),
        this.todas<MedicinaProvet>("/consultation_items/medicine/", {
          consultation__is: String(c.id),
          vaccination__is: "false",
        }),
      ]);
      const diagnostico = diagnosticos.map((d) => d.name?.trim()).filter(Boolean).join("\n");
      const tratamiento = medicinas
        .map((m) => [m.name, m.quantity != null ? `${m.quantity} ${m.unit ?? ""}`.trim() : ""].filter(Boolean).join(" · "))
        .filter(Boolean)
        .join("\n");
      const observaciones = notas.map((n) => (n.text ?? n.note ?? "").trim()).filter(Boolean).join("\n\n");
      if (!c.complaint?.trim() && !diagnostico && !tratamiento && !observaciones) continue;

      for (const p of c.patients ?? [])
        hallazgos.push({
          ref: `provet:consultation:${c.id}:${p}`,
          registro: {
            version: 1,
            tipo: "informe",
            chip: await this.chipDe(p),
            fecha: fechaDe(new Date(c.started ?? c.ended)),
            motivo: recortar(c.complaint, 200),
            diagnostico: recortar(diagnostico, 4000),
            tratamiento: recortar(tratamiento, 4000),
            observaciones: recortar(observaciones, 8000),
          },
        });
    }

    const marca = new Date(ahora).toISOString();
    return { hallazgos, cursor: { vacunas: marca, consultas: marca } satisfies CursorProvet };
  }
}
