import { useState } from "react";
import { router } from "expo-router";
import { View } from "react-native";
import { Boton, Campo, Pantalla, Texto, Titulo } from "@/components/ui";
import { yo } from "@/lib/api";
import { guardarClave } from "@/lib/almacen";
import { useT } from "@/lib/idioma";
import { rellenarRecuperacion } from "@/lib/recuperacion";
import { claveDeDueno, deBase64, iguales, leerCodigo } from "@/lib/cripto";
import { espacio } from "@/lib/tema";

/* Reconstruir la clave del dueño con su código de recuperación en papel.
   Se deriva aquí, se comprueba contra la pública de la cuenta y se guarda en
   el llavero. El código no sale del móvil. */

export default function Clave() {
  const t = useT();
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [comprobando, setComprobando] = useState(false);

  async function alEnviar() {
    setError(null);
    const semilla = leerCodigo(codigo);
    if (!semilla) {
      setError(t("entrada.clave.invalido"));
      return;
    }
    setComprobando(true);
    try {
      // Derivar cuesta unos milisegundos; se deja pintar el indicador antes.
      await new Promise((r) => setTimeout(r, 0));
      const clave = claveDeDueno(semilla);
      const y = await yo();
      if (!iguales(clave.publica, deBase64(y.pubKey))) {
        setError(t("entrada.clave.otraCuenta"));
        return;
      }
      await guardarClave(clave.secreta);
      rellenarRecuperacion(y, clave.secreta);
      router.back();
    } catch {
      setError(t("entrada.clave.error"));
    } finally {
      setComprobando(false);
    }
  }

  return (
    <Pantalla>
      <View style={{ gap: espacio.sm }}>
        <Titulo>{t("entrada.clave.titulo")}</Titulo>
        <Texto tono="suave">{t("entrada.clave.intro")}</Texto>
      </View>
      <Campo
        etiqueta={t("entrada.clave.campo")}
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
        {t("entrada.clave.guardar")}
      </Boton>
      <Boton variante="secundario" alPulsar={() => router.back()}>
        {t("entrada.clave.ahoraNo")}
      </Boton>
    </Pantalla>
  );
}
