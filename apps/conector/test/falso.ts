/* Un fetch falso que responde según método y ruta, y apunta cada llamada. */
import type { Http } from "../src/http.ts";

export type Llamada = { metodo: string; url: URL; cuerpo: string; auth: string };
export type Ruta = (l: Llamada) => { estado?: number; json?: unknown; cabeceras?: Record<string, string> } | undefined;

export function httpFalso(rutas: Ruta[]): Http & { llamadas: Llamada[]; dormido: number[] } {
  const llamadas: Llamada[] = [];
  const dormido: number[] = [];
  return {
    llamadas,
    dormido,
    dormir: async (ms) => {
      dormido.push(ms);
    },
    fetch: (async (entrada: string | URL | Request, init?: RequestInit) => {
      const h = new Headers(init?.headers);
      const l: Llamada = {
        metodo: init?.method ?? "GET",
        url: new URL(String(entrada)),
        cuerpo: typeof init?.body === "string" ? init.body : "",
        auth: h.get("authorization") ?? "",
      };
      llamadas.push(l);
      for (const r of rutas) {
        const res = r(l);
        if (res)
          return new Response(JSON.stringify(res.json ?? {}), {
            status: res.estado ?? 200,
            headers: { "content-type": "application/json", ...res.cabeceras },
          });
      }
      return new Response(JSON.stringify({ error: `sin ruta ${l.metodo} ${l.url.pathname}` }), { status: 599 });
    }) as typeof fetch,
  };
}
