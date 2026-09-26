import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { env } from "./core.js";
import rutasChip from "./routes/chip.js";
import rutasClinicas, { sesionDe } from "./routes/clinics.js";

/* apps/api NO depende de packages/crypto, y es a propósito: el servidor guarda
   bloques que no puede abrir. Si algún día aparece esa dependencia en el
   package.json, la revisión tiene que pararlo. */

export async function crearApp() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
    /* Sin rutas ni IP en los logs: el Caddyfile hace lo mismo por delante. */
    // Deprecada en Fastify 5, se retira en la 6. Funciona y la alternativa
    // (logController) no arranca en esta versión: revisar al subir a 6.
    disableRequestLogging: true,
    trustProxy: true,
  });

  await app.register(cookie);

  /* Dos límites, no uno. El de IP protege el nivel 0 de quien recorre números
     desde fuera; el de clínica evita que tener cuenta sea la forma cómoda de
     hacer lo mismo desde dentro. */
  await app.register(rateLimit, {
    global: false,
    max: 60,
    timeWindow: "1 minute",
  });

  app.get("/health", async () => ({ ok: true }));

  await app.register(async (scope) => {
    await scope.register(rateLimit, {
      max: 30,
      timeWindow: "1 minute",
      keyGenerator: async (req) => {
        const s = await sesionDe(req);
        return s ? `clinic:${s.clinicId}` : `ip:${req.ip}`;
      },
    });
    await scope.register(rutasChip);
  });

  await app.register(rutasClinicas);

  return app;
}

const esEntrada =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));

if (esEntrada) {
  const app = await crearApp();
  await app.listen({ port: env.port, host: "127.0.0.1" });
  app.log.info(`api escuchando en http://127.0.0.1:${env.port}`);
}
