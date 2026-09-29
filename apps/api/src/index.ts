import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { env } from "./core.js";
import rutasChip, { caducarPeticiones } from "./routes/chip.js";
import rutasClinicas, { sesionDe } from "./routes/clinics.js";
import rutasDuenos from "./routes/duenos.js";
import rutasFicha from "./routes/ficha.js";
import { purgarSinVerificar } from "./limpieza.js";
import rutasMascotas, { resolverReclamaciones } from "./routes/mascotas.js";

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
    /* Solo se cree X-Forwarded-For si llega del Caddy local, que la reescribe
       con la IP validada. Con `true`, cualquiera la inventaba y los límites
       por IP no frenaban nada. */
    trustProxy: process.env.TRUST_PROXY ?? "loopback",
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

  /* La web del veterinario es estática y vive en otro origen. Solo se le abren
     sus rutas (nivel 0, placa, copia temporal y foto del perfil), sin
     credenciales: no llevan sesión, y la de clínica no sale de su origen. */
  const WEB_VET = ["/chip/v1/", "/e/v1/", "/s/v1/", "/perfil/v1/"];
  app.addHook("onRequest", async (req, reply) => {
    const origen = req.headers.origin;
    if (!origen || !WEB_VET.some((p) => req.url.startsWith(p))) return;
    if (!env.vetOrigins.includes(origen)) return;
    reply.header("Access-Control-Allow-Origin", origen);
    reply.header("Vary", "Origin");
    if (req.method === "OPTIONS") {
      reply.header("Access-Control-Allow-Methods", "GET, POST");
      reply.header("Access-Control-Allow-Headers", "content-type");
      reply.header("Access-Control-Max-Age", "600");
      return reply.code(204).send();
    }
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

  /* Placa, copia temporal, notas y avisos: límite por IP. Los id son
     aleatorios de 128 bits; el límite frena a quien prueba a ciegas. */
  await app.register(async (scope) => {
    await scope.register(rateLimit, { max: 60, timeWindow: "1 minute" });
    await scope.register(rutasFicha);
    await scope.register(rutasMascotas);
  });

  await app.register(rutasClinicas);

  /* Portal del dueño: límite propio y más estricto, porque la entrada prueba
     contraseñas contra números de chip que cualquiera puede leer. */
  await app.register(async (scope) => {
    await scope.register(rateLimit, { max: Number(process.env.LIMITE_DUENOS ?? 20), timeWindow: "1 minute" });
    await scope.register(rutasDuenos);
  });

  return app;
}

const esEntrada =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));

/* Tareas periódicas dentro del propio proceso: caducar peticiones de alta y
   resolver reclamaciones de chip vencidas (14 días). Son idempotentes, así
   que si algún día hay varias réplicas, repetirlas no hace daño. CRON=off las
   desactiva; CRON_MINUTOS cambia el intervalo (60 por defecto). */
function iniciarCron(app: Awaited<ReturnType<typeof crearApp>>) {
  if (process.env.CRON === "off") return;
  const minutos = Number(process.env.CRON_MINUTOS ?? 60);
  const vuelta = async () => {
    try {
      const caducadas = await caducarPeticiones();
      const resueltas = await resolverReclamaciones();
      const purgadas = await purgarSinVerificar();
      if (caducadas || resueltas || purgadas.duenos || purgadas.clinicas || purgadas.invitaciones)
        app.log.info({ caducadas, resueltas, purgadas }, "cron: tareas periódicas");
    } catch (e) {
      app.log.error({ err: (e as Error).message }, "cron: fallo en tareas periódicas");
    }
  };
  void vuelta();
  setInterval(vuelta, minutos * 60_000).unref();
}

if (esEntrada) {
  const app = await crearApp();
  await app.listen({ port: env.port, host: "127.0.0.1" });
  app.log.info(`api escuchando en http://127.0.0.1:${env.port}`);
  iniciarCron(app);
}
