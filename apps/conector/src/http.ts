/* Peticiones a las APIs de los programas de gestión, con reintento cuando
   piden esperar (429). ezyVet limita a unas 60 llamadas por minuto y
   endpoint; Provet también tiene límite. */

export type Http = {
  fetch: typeof fetch;
  dormir: (ms: number) => Promise<void>;
};

export const httpReal: Http = {
  fetch: (...a) => fetch(...a),
  dormir: (ms) => new Promise((r) => setTimeout(r, ms)),
};

const REINTENTOS = 5;

/** Segundos de espera según Retry-After o x-ratelimit-reset (epoch o segundos). */
function espera(r: Response): number {
  const ra = Number(r.headers.get("retry-after"));
  if (ra > 0) return ra * 1000;
  const reset = Number(r.headers.get("x-ratelimit-reset"));
  if (reset > 1e9) return Math.max(1000, reset * 1000 - Date.now());
  if (reset > 0) return reset * 1000;
  return 60_000;
}

export async function pedirJson<T>(http: Http, url: string, init: RequestInit, fuente: string): Promise<T> {
  for (let i = 0; ; i++) {
    const r = await http.fetch(url, init);
    if (r.status === 429 && i < REINTENTOS) {
      await http.dormir(espera(r));
      continue;
    }
    if (!r.ok) {
      const cuerpo = await r.text().catch(() => "");
      // Sin la URL completa en el error: puede llevar filtros con datos.
      throw new Error(`${fuente}: ${r.status} en ${new URL(url).pathname} ${cuerpo.slice(0, 200)}`);
    }
    return (await r.json()) as T;
  }
}
