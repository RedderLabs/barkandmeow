import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Los CSS Modules de un paquete del workspace hay que transpilarlos.
  transpilePackages: ["@barkandmeow/ui-web"],
  // Raíz del monorepo explícita, para que Turbopack resuelva las dependencias
  // izadas y no vuelva a inferirla desde un .git anidado.
  turbopack: {
    root: path.join(import.meta.dirname, "..", ".."),
  },
};

export default nextConfig;
