import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Raíz del monorepo explícita. El .git que heredó de create-next-app ya no
  // existe —apps/vet forma parte del repo raíz—, pero dejarla escrita evita que
  // Turbopack vuelva a inferirla mal y no encuentre next/package.json.
  turbopack: {
    root: path.join(import.meta.dirname, "..", ".."),
  },
};

export default nextConfig;
