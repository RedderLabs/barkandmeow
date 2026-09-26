/* Genera el sistema visual desde diseno/tokens.json, que es la fuente única.
   Salidas:
     - apps/clinic/app/tokens.generated.css   variables CSS para la web
     - packages/tokens/dist/tokens.ts         objeto TypeScript para la app nativa
   Nada de lo generado se edita a mano: se edita tokens.json y se vuelve a correr. */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, "..", "..");
const t = JSON.parse(readFileSync(join(raiz, "diseno", "tokens.json"), "utf8"));

const CABECERA = `/* GENERADO por packages/tokens desde diseno/tokens.json.
   No editar a mano: los cambios se pierden en la siguiente generación. */`;

const vars = (obj, prefijo = "") =>
  Object.entries(obj)
    .map(([k, v]) => `  --${prefijo}${k}: ${v};`)
    .join("\n");

const provisionales = Object.keys(t.provisional ?? {}).length
  ? `\n/* PROVISIONAL\n${Object.entries(t.provisional)
      .map(([k, v]) => `   · ${k}: ${v}`)
      .join("\n")}\n*/\n`
  : "";

const css = `${CABECERA}
${provisionales}
:root {
${vars(t.light)}

${vars(t.radius, "r-")}

${vars(t.space, "s-")}

  --font-display: ${t.fontStacks.display};
  --font-text: ${t.fontStacks.text};
  --font-data: ${t.fontStacks.data};

  --tap: ${t.minTouchTarget}px;
  --ease: ${t.motion.ease};
  --t-state: ${t.motion.state};

  color-scheme: light;
}

@media (prefers-color-scheme: dark) {
  :root {
${vars(t.dark)}

    color-scheme: dark;
  }
}
`;

const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const objeto = (obj) =>
  Object.entries(obj)
    .map(([k, v]) => `    ${camel(k)}: ${JSON.stringify(v)},`)
    .join("\n");

const ts = `${CABECERA.replace(/\/\* | \*\//g, "")}
export const tokens = {
  light: {
${objeto(t.light)}
  },
  dark: {
${objeto(t.dark)}
  },
  radius: {
${objeto(t.radius)}
  },
  space: {
${objeto(t.space)}
  },
  fonts: {
${objeto(t.fontStacks)}
  },
  minTouchTarget: ${t.minTouchTarget},
} as const;

export type Tokens = typeof tokens;
export type Modo = keyof Pick<Tokens, "light" | "dark">;
`;

const salidas = [
  [join(raiz, "apps", "clinic", "app", "tokens.generated.css"), css],
  [join(aqui, "dist", "tokens.css"), css],
  [join(aqui, "dist", "tokens.ts"), ts],
];

for (const [ruta, contenido] of salidas) {
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, contenido);
  console.log("escrito", ruta.replace(raiz, "").replace(/\\/g, "/"));
}

const n = Object.keys(t.light).length;
console.log(`${n} colores por modo · ${Object.keys(t.radius).length} radios · ${Object.keys(t.space).length} espacios`);
