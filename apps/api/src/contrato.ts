import type { FastifyInstance } from "fastify";
import { buscarRuta } from "@barkandmeow/schema/api";

/* El contrato de la API vive en packages/schema/src/api. Aquí se vigila:
   - `rutasRegistradas` guarda cada ruta que monta Fastify, para que un test
     compruebe que el catálogo y el servidor tienen las mismas;
   - con VALIDAR_CONTRATO=1 (lo pone el preload de los tests) cada respuesta
     buena se contrasta con su esquema, y si no lo cumple se convierte en un
     500 con el motivo. Así los tests de siempre prueban también el contrato.
   En producción no valida nada: solo cuesta lo que cuesta anotar las rutas. */

export const rutasRegistradas: { metodo: string; ruta: string }[] = [];

export function vigilarContrato(app: FastifyInstance) {
  app.addHook("onRoute", (o) => {
    for (const m of [o.method].flat()) {
      if (m === "HEAD" || m === "OPTIONS") continue;
      rutasRegistradas.push({ metodo: m, ruta: o.url });
    }
  });

  if (process.env.VALIDAR_CONTRATO !== "1") return;

  app.addHook("onSend", async (req, reply, payload) => {
    const patron = req.routeOptions.url;
    if (!patron || reply.statusCode >= 300) return payload;
    const r = buscarRuta(req.method, patron);
    if (!r) throw new Error(`contrato: ${req.method} ${patron} no está en el catálogo`);
    if (r.estado !== undefined && reply.statusCode !== r.estado)
      throw new Error(`contrato: ${req.method} ${patron} respondió ${reply.statusCode}, el catálogo dice ${r.estado}`);
    if (!r.respuesta || typeof payload !== "string") return payload;
    const tipo = String(reply.getHeader("content-type") ?? "");
    if (!tipo.includes("json")) return payload;
    const enviado: unknown = JSON.parse(payload);
    const v = r.respuesta.safeParse(enviado);
    if (!v.success)
      throw new Error(`contrato: ${req.method} ${patron} no cumple su respuesta: ${JSON.stringify(v.error.issues)}`);
    const sobra = sobrante(enviado, v.data);
    if (sobra) throw new Error(`contrato: ${req.method} ${patron} envía «${sobra}», que el catálogo no recoge`);
    return payload;
  });
}

/** zod quita en silencio los campos que no conoce: esto los encuentra. */
function sobrante(enviado: unknown, leido: unknown, camino = ""): string | null {
  if (Array.isArray(enviado) && Array.isArray(leido)) {
    for (let i = 0; i < enviado.length; i++) {
      const s = sobrante(enviado[i], leido[i], `${camino}[${i}]`);
      if (s) return s;
    }
    return null;
  }
  if (enviado && typeof enviado === "object" && leido && typeof leido === "object") {
    for (const [k, valor] of Object.entries(enviado)) {
      if (!(k in leido)) return `${camino}.${k}`.replace(/^\./, "");
      const s = sobrante(valor, (leido as Record<string, unknown>)[k], `${camino}.${k}`);
      if (s) return s;
    }
  }
  return null;
}
