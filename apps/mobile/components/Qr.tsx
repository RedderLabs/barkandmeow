import { useMemo } from "react";
import { View } from "react-native";
import { encode } from "uqr";

/* Un código QR dibujado con vistas, sin módulos nativos. Siempre negro sobre
   blanco, también en modo oscuro: los lectores no leen bien el invertido.
   El enlace lleva la clave: se dibuja aquí y no sale del teléfono. */
export function Qr({ valor, lado = 240, etiqueta }: { valor: string; lado?: number; etiqueta: string }) {
  const { data, size } = useMemo(() => encode(valor, { border: 2, ecc: "M" }), [valor]);
  // Un tamaño entero por módulo: sin medias líneas que confundan al lector.
  const modulo = Math.max(2, Math.floor(lado / size));
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={etiqueta}
      style={{ alignSelf: "center", backgroundColor: "#FFFFFF", borderRadius: 12, padding: 4 }}
    >
      {data.map((fila, y) => (
        <View key={y} style={{ flexDirection: "row" }}>
          {fila.map((negro, x) => (
            <View key={x} style={{ width: modulo, height: modulo, backgroundColor: negro ? "#000000" : "#FFFFFF" }} />
          ))}
        </View>
      ))}
    </View>
  );
}
