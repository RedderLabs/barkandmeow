import { leerReglas } from "./reglas.js";
import { FuenteEzyVet } from "./fuentes/ezyvet.js";
import { FuenteProvet } from "./fuentes/provet.js";
import { FuenteQvet } from "./fuentes/qvet.js";
import type { Fuente } from "./sincronizar.js";

/* Todo sale de variables de entorno (.env junto al conector), salvo las
   reglas de validez de vacunas y las columnas de QVET, que van en un JSON
   (CONECTOR_REGLAS). Ver .env.example. */

export type Config = {
  bm: { url: string; clave: string; firma: string };
  rutaEstado: string;
  intervaloMin: number;
  fuentes: Fuente[];
};

const num = (v: string | undefined, def: number) => (v && Number.isFinite(Number(v)) ? Number(v) : def);

export function leerConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const falta = (k: string) => {
    throw new Error(`falta ${k} (ver .env.example)`);
  };
  const reglas = leerReglas(env.CONECTOR_REGLAS);
  const dias = num(env.CONECTOR_DIAS_INICIALES, 30);
  const fuentes: Fuente[] = [];

  if (env.EZYVET_CLIENT_ID)
    fuentes.push(
      new FuenteEzyVet({
        url: (env.EZYVET_URL || "https://api.ezyvet.com").replace(/\/$/, ""),
        partnerId: env.EZYVET_PARTNER_ID || falta("EZYVET_PARTNER_ID"),
        clientId: env.EZYVET_CLIENT_ID,
        clientSecret: env.EZYVET_CLIENT_SECRET || falta("EZYVET_CLIENT_SECRET"),
        scope: env.EZYVET_SCOPE || "read-animal,read-consult,read-vaccination,read-history,read-product",
        siteUid: env.EZYVET_SITE_UID || undefined,
        diasIniciales: dias,
        esperaHoras: num(env.EZYVET_ESPERA_HORAS, 24),
        reglas,
      }),
    );

  if (env.PROVET_URL)
    fuentes.push(
      new FuenteProvet({
        url: env.PROVET_URL,
        clientId: env.PROVET_CLIENT_ID,
        clientSecret: env.PROVET_CLIENT_SECRET,
        tokenAntiguo: env.PROVET_TOKEN || undefined,
        diasIniciales: dias,
        reglas,
      }),
    );

  if (env.QVET_CARPETA) fuentes.push(new FuenteQvet({ carpeta: env.QVET_CARPETA, reglas }));

  if (!fuentes.length) throw new Error("ninguna fuente configurada: EZYVET_CLIENT_ID, PROVET_URL o QVET_CARPETA");

  return {
    bm: {
      url: env.BM_API_URL || "https://api.barkandmeow.app",
      clave: env.BM_API_KEY || falta("BM_API_KEY"),
      firma: env.BM_FIRMA || falta("BM_FIRMA"),
    },
    rutaEstado: env.CONECTOR_ESTADO || "./estado-conector.json",
    intervaloMin: num(env.CONECTOR_INTERVALO_MIN, 15),
    fuentes,
  };
}
