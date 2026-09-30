import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // La clínica cuelga de la web del veterinario: un solo origen, un solo puerto
  // público. En desarrollo apps/vet reenvía /clinica aquí; en producción lo
  // hace el proxy.
  basePath: "/clinica",
  // Solo en desarrollo: se entra por la puerta de vet, en localhost o 127.0.0.1.
  allowedDevOrigins: ["127.0.0.1"],
  // Los CSS Modules de un paquete del workspace hay que transpilarlos; crypto
  // se publica como TypeScript sin compilar.
  transpilePackages: ["@barkandmeow/ui-web", "@barkandmeow/crypto", "@barkandmeow/schema"],
  /* El SaaS habla con apps/api por /clinica/api, en su mismo origen: la cookie
     de sesión es de primera parte y nunca sale del dominio de la clínica. En
     producción Next hace el mismo reenvío; API_INTERNAL_URL apunta a la API
     dentro del homelab. */
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4601"}/:path*`,
      },
    ];
  },
  // Raíz del monorepo explícita, para que Turbopack resuelva las dependencias
  // izadas y no vuelva a inferirla desde un .git anidado.
  turbopack: {
    root: path.join(import.meta.dirname, "..", ".."),
  },
};

export default nextConfig;
