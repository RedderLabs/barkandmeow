import { useState } from "react";
import { router } from "expo-router";
import { View } from "react-native";
import { Boton, Campo, Pantalla, Texto, Titulo } from "@/components/ui";
import { yo } from "@/lib/api";
import { guardarClave } from "@/lib/almacen";
import { claveDeDueno, deBase64, iguales, leerCodigo } from "@/lib/cripto";
import { espacio } from "@/lib/tema";

/* Reconstruir la clave del dueño con su código de recuperación en papel.
   Se deriva aquí, se comprueba contra la pública de la cuenta y se guarda en
   el llavero. El código no sale del móvil. */

export default function Clave() {
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [comprobando, setComprobando] = useState(false);

  async function alEnviar() {
    setError(null);
    const semilla = leerCodigo(codigo);
    if (!semilla) {
      setError("El código no es válido: revisa cada bloque en el papel.");
      return;
    }
    setComprobando(true);
    try {
      // Derivar cuesta unos milisegundos; se deja pintar el indicador antes.
      await new Promise((r) => setTimeout(r, 0));
      const clave = claveDeDueno(semilla);
      const { pubKey } = await yo();
      if (!iguales(clave.publica, deBase64(pubKey))) {
        setError("Ese código es válido, pero no es el de esta cuenta.");
        return;
      }
      await guardarClave(clave.secreta);
      router.back();
    } catch {
      setError("No se ha podido comprobar. Revisa la conexión y vuelve a intentarlo.");
    } finally {
      setComprobando(false);
    }
  }

  return (
    <Pantalla>
      <View style={{ gap: espacio.sm }}>
        <Titulo>Tu código de recuperación</Titulo>
        <Texto tono="suave">
          Son 8 bloques de 4 caracteres que apuntaste en papel al darte de alta. Con él, este móvil puede abrir tu
          bandeja.
        </Texto>
      </View>
      <Campo
        etiqueta="Código de recuperación"
        datos
        multiline
        value={codigo}
        onChangeText={setCodigo}
        placeholder="XXXX XXXX XXXX XXXX XXXX XXXX XXXX XXXX"
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        error={error}
      />
      <Boton alPulsar={() => void alEnviar()} ocupado={comprobando} desactivado={!codigo.trim()}>
        Abrir la bandeja
      </Boton>
      <Boton variante="secundario" alPulsar={() => router.back()}>
        Ahora no
      </Boton>
    </Pantalla>
  );
}
