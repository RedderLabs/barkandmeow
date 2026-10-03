import { useState } from "react";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { Image, useColorScheme, View } from "react-native";
import { Boton, Campo, Pantalla, Tarjeta, Texto, Titulo } from "@/components/ui";
import { API, ErrorApi, identificar } from "@/lib/api";
import { useT } from "@/lib/idioma";
import { useSesion } from "@/lib/sesion";
import { espacio } from "@/lib/tema";

/* Entrar, primer paso: el número de chip (identifica, no autoriza) y la
   contraseña. Después llega un código por correo o por SMS. El alta se hace
   en el portal web: ahí se genera y se imprime el código de recuperación. */

/** El portal vive en el mismo origen que la API, sin el /api. */
const URL_RECUPERAR = `${API.replace(/\/api$/, "")}/mi-mascota/recuperar`;

export default function Entrar() {
  const { entrar } = useSesion();
  const t = useT();
  const oscuro = useColorScheme() === "dark";
  const [chip, setChip] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorChip, setErrorChip] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function alEnviar() {
    setError(null);
    const id = identificar(chip);
    if (!id) {
      setErrorChip(t("entrada.entrar.errorChip"));
      return;
    }
    setErrorChip(null);
    setEnviando(true);
    try {
      await entrar(id, password);
      router.push("/codigo");
    } catch (e) {
      if (e instanceof ErrorApi && e.estado === 401) setError(t("entrada.entrar.error401"));
      else if (e instanceof ErrorApi && e.estado === 429) setError(t("entrada.entrar.error429"));
      else if (e instanceof ErrorApi && e.estado === 0) setError(t("entrada.entrar.errorRed"));
      else setError(t("entrada.entrar.errorEnvio"));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Pantalla>
      <View style={{ gap: espacio.md }}>
        {/* Siempre el logotipo, nunca el nombre como texto (PRODUCT.md). */}
        <Image
          accessibilityRole="image"
          accessibilityLabel="Bark & Meow"
          source={oscuro ? require("@/assets/logo_horizontal_oscuro.png") : require("@/assets/logo_horizontal_claro.png")}
          style={{ width: 200, height: oscuro ? 75 : 65 }}
          resizeMode="contain"
        />
        <Titulo>{t("entrada.entrar.titulo")}</Titulo>
        <Texto tono="suave">{t("entrada.entrar.intro")}</Texto>
      </View>
      <View style={{ gap: espacio.xl }}>
        <Campo
          etiqueta={t("entrada.entrar.chip")}
          datos
          value={chip}
          onChangeText={setChip}
          placeholder="941 000 012 345 678"
          keyboardType="number-pad"
          autoComplete="off"
          autoCorrect={false}
          error={errorChip}
        />
        <Campo
          etiqueta={t("entrada.entrar.clave")}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          onSubmitEditing={() => void alEnviar()}
        />
        {error && (
          <Tarjeta tono="alerta">
            <Texto>{error}</Texto>
          </Tarjeta>
        )}
        <Boton alPulsar={() => void alEnviar()} ocupado={enviando} desactivado={!chip.trim() || !password}>
          {t("entrada.entrar.continuar")}
        </Boton>
        {/* La recuperación pide el código en papel: se hace en el portal web. */}
        <Boton variante="secundario" alPulsar={() => void Linking.openURL(URL_RECUPERAR)}>
          {t("entrada.entrar.olvidada")}
        </Boton>
      </View>
      <Texto tono="suave">{t("entrada.entrar.alta")}</Texto>
    </Pantalla>
  );
}
