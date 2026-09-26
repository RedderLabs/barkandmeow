import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // apps/vet tiene su propio .git heredado de create-next-app, y Turbopack usa
  // ese límite para decidir la raíz del workspace: sin esto resuelve la raíz en
  // apps/vet y no encuentra next/package.json, que está izado en la raíz del
  // monorepo. Se puede quitar el día que ese .git anidado desaparezca.
  turbopack: {
    root: path.join(import.meta.dirname, "..", ".."),
  },
};

export default nextConfig;
