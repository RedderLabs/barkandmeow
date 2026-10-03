/* Text y TextInput con el tamaño de letra que el dueño eligió en Cuenta.
   Escalan fontSize y lineHeight; el resto del estilo pasa tal cual. El
   tamaño del sistema (accesibilidad) se sigue aplicando encima. */

import { forwardRef } from "react";
import {
  StyleSheet,
  Text as TextoNativo,
  TextInput as CampoNativo,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
} from "react-native";
import { useEscala } from "@/lib/ajustes";

export function escalar(estilo: StyleProp<TextStyle>, k: number): StyleProp<TextStyle> {
  if (k === 1 || !estilo) return estilo;
  const plano = StyleSheet.flatten(estilo);
  return {
    ...plano,
    ...(plano.fontSize ? { fontSize: plano.fontSize * k } : null),
    ...(plano.lineHeight ? { lineHeight: plano.lineHeight * k } : null),
  };
}

export function Text({ style, ...props }: TextProps) {
  return <TextoNativo {...props} style={escalar(style, useEscala())} />;
}

export const TextInput = forwardRef<CampoNativo, TextInputProps>(function TextInput({ style, ...props }, ref) {
  return <CampoNativo ref={ref} {...props} style={escalar(style, useEscala())} />;
});
