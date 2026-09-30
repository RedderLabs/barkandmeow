/* Conector del software de gestión con Bark & Meow. Corre en la clínica.

     pnpm --filter @barkandmeow/conector start       cada CONECTOR_INTERVALO_MIN minutos
     pnpm --filter @barkandmeow/conector una-vez     una vuelta y termina (para el programador de tareas)

   Ver README.md. */
import { comprobarAlojado } from "./alojado.js";
import { cargarCriptoLocal, crearClienteBM } from "./barkandmeow.js";
import { leerConfig } from "./config.js";
import { leerEstado } from "./estado.js";
import { sincronizar, type Registro } from "./sincronizar.js";

const log: Registro = (nivel, mensaje, datos) =>
  console[nivel === "error" ? "error" : nivel === "aviso" ? "warn" : "log"](
    JSON.stringify({ t: new Date().toISOString(), nivel, mensaje, ...datos }),
  );

async function main() {
  const alojamiento = comprobarAlojado();
  const config = leerConfig();
  const cripto = await cargarCriptoLocal();
  const bm = crearClienteBM({ ...config.bm, cripto });

  // La clave vale y es de esta clínica, antes de leer nada del programa.
  const yo = await bm.me();
  log("info", `conectado como «${yo.clave}» de ${yo.clinica.nombre}`, {
    fuentes: config.fuentes.map((f) => f.nombre),
  });
  if (!yo.clinica.verificada) log("aviso", "la clínica no tiene el correo verificado: la API rechazará los envíos");

  const vuelta = async () => {
    if (alojamiento.alojado)
      log("aviso", "MODO_ALOJADO: el cifrado de extremo a extremo no aplica a este conector", {
        consentimiento: alojamiento.consentimiento,
      });
    const estado = leerEstado(config.rutaEstado);
    const resumen = await sincronizar({
      fuentes: config.fuentes,
      bm,
      estado,
      rutaEstado: config.rutaEstado,
      clinica: yo.clinica.nombre,
      log,
    });
    for (const r of resumen) log(r.fallo ? "error" : "info", `vuelta de ${r.fuente}`, r);
    return resumen;
  };

  if (process.argv.includes("--una-vez")) {
    const r = await vuelta();
    if (r.some((x) => x.fallo)) process.exitCode = 1;
    return;
  }

  let enCurso = false;
  const tic = async () => {
    if (enCurso) return;
    enCurso = true;
    try {
      await vuelta();
    } catch (e) {
      log("error", "vuelta fallida", { error: (e as Error).message });
    } finally {
      enCurso = false;
    }
  };
  await tic();
  setInterval(tic, config.intervaloMin * 60_000);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
