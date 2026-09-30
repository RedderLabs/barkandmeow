/* El sistema visual en la app: los mismos tokens que las webs, generados
   desde diseno/tokens.json por packages/tokens. Aquí solo se pasan los px a
   números y se eligen las fuentes cargadas en app/_layout.tsx. */

import { useColorScheme } from "react-native";
import { tokens } from "@barkandmeow/tokens";

const px = <T extends Record<string, string>>(o: T) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, parseFloat(v)])) as { [K in keyof T]: number };

export const radio = px(tokens.radius);
export const espacio = px(tokens.space);
export const toque = tokens.minTouchTarget;

export const fuente = {
  display: "Fraunces_600SemiBold",
  texto: "IBMPlexSans_400Regular",
  textoFuerte: "IBMPlexSans_600SemiBold",
  datos: "IBMPlexMono_400Regular",
} as const;

export type Colores = { [K in keyof typeof tokens.light]: string };

export function useColores(): Colores {
  return useColorScheme() === "dark" ? tokens.dark : tokens.light;
}
