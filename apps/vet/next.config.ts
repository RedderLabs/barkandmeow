import path from "node:path";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import type { NextConfig } from "next";

/** Donde escucha apps/clinic en desarrollo. No se abre: se entra por /clinica. */
const CLINIC_DEV = process.env.CLINIC_DEV_URL ?? "http://127.0.0.1:4520";
/** Dónde escucha apps/portal (el portal del dueño) en desarrollo. */
const PORTAL_DEV = process.env.PORTAL_DEV_URL ?? "http://127.0.0.1:4530";

export default function config(phase: string): NextConfig {
  const base: NextConfig = {
    // i18n y ui-web se publican como TypeScript sin compilar; ui-web trae
    // además los componentes de shadcn compartidos.
    transpilePackages: ["@barkandmeow/i18n", "@barkandmeow/ui-web", "@barkandmeow/crypto"],
    // Raíz del monorepo explícita. El .git que heredó de create-next-app ya no
    // existe —apps/vet forma parte del repo raíz—, pero dejarla escrita evita que
    // Turbopack vuelva a inferirla mal y no encuentre next/package.json.
    turbopack: {
      root: path.join(import.meta.dirname, "..", ".."),
    },
  };

  /* En desarrollo, vet es la puerta única: /clinica se reenvía a apps/clinic,
     que tiene basePath /clinica, y /e/<id> y /s/<id> caen en la página única de
     cada nivel (el id lo lee el navegador). La exportación estática no admite
     rewrites, así que solo existen aquí; en producción el proxy hace el mismo
     reparto. */
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    return {
      ...base,
      // Next solo admite localhost por defecto; abrir por 127.0.0.1 dejaba la
      // página sin hidratar (sin JS, sin idioma, sin consulta).
      allowedDevOrigins: ["127.0.0.1"],
      async rewrites() {
        return [
          { source: "/clinica", destination: `${CLINIC_DEV}/clinica` },
          { source: "/clinica/:path*", destination: `${CLINIC_DEV}/clinica/:path*` },
          { source: "/mi-mascota", destination: `${PORTAL_DEV}/mi-mascota` },
          { source: "/mi-mascota/:path*", destination: `${PORTAL_DEV}/mi-mascota/:path*` },
          { source: "/e/:id", destination: "/e" },
          { source: "/s/:id", destination: "/s" },
          { source: "/p/:id", destination: "/p" },
        ];
      },
    };
  }

  // La web del veterinario es estática: se sirve desde Cloudflare y tiene que
  // pesar menos de 300 KB. Nada de servidor, nada de rutas de API propias.
  return { ...base, output: "export" };
}
