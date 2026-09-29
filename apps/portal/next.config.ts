import path from "node:path";
import type { NextConfig } from "next";

/* Portal del dueño: barkandmeow.app/mi-mascota. En desarrollo apps/vet
   reenvía /mi-mascota aquí; en producción lo hace el proxy. Habla con el API
   por /mi-mascota/api, en su mismo origen: la cookie de sesión es de primera
   parte y httpOnly. */
const nextConfig: NextConfig = {
  basePath: "/mi-mascota",
  transpilePackages: ["@barkandmeow/ui-web", "@barkandmeow/crypto", "@barkandmeow/schema"],
  allowedDevOrigins: ["127.0.0.1"],
  turbopack: {
    root: path.join(import.meta.dirname, "..", ".."),
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4601"}/:path*`,
      },
    ];
  },
};

export default nextConfig;
