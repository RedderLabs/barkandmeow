import path from "node:path";
import type { NextConfig } from "next";

/* Panel del operador: revisión manual de reclamaciones de chip. No se
   publica: escucha en 127.0.0.1 y se entra por la red interna (túnel SSH o
   VPN). Habla con el API desde el servidor, nunca desde el navegador. */
const nextConfig: NextConfig = {
  basePath: "/operador",
  transpilePackages: ["@barkandmeow/ui-web", "@barkandmeow/schema"],
  allowedDevOrigins: ["127.0.0.1"],
  turbopack: {
    root: path.join(import.meta.dirname, "..", ".."),
  },
};

export default nextConfig;
