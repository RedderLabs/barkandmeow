import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Raíz del monorepo explícita, para que Turbopack resuelva las dependencias
  // izadas y no vuelva a inferirla desde un .git anidado.
  turbopack: {
    root: path.join(import.meta.dirname, "..", ".."),
  },
};

export default nextConfig;
