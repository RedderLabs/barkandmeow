import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Image, useColorScheme, View } from "react-native";
import { Boton, Campo, Pantalla, Tarjeta, Texto, Titulo } from "@/components/ui";
import { ErrorApi, identificar } from "@/lib/api";
import { useT } from "@/lib/idioma";
import { useSesion } from "@/lib/sesion";
import { espacio } from "@/lib/tema";

/* Entrar, primer paso: el número de chip (identifica, no autoriza) y la
   contraseña. Después llega un código por correo o por SMS. Desde aquí se va
   también al alta y a recuperar la contraseña con el código en papel; al
   volver de recuperarla, llega con el chip y el aviso de que ya puede entrar. */

export default function Entrar() {
  const { entrar } = useSesion();
  const t = useT();
  const oscuro = useColorScheme() === "dark";
  const params = useLocalSearchParams<{ chip?: string; aviso?: string }>();
  const [chip, setChip] = useState(params.chip ?? "");
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
        {params.aviso === "recuperada" && (
          <Tarjeta>
            <Texto tono="fuerte">{t("entrada.recuperar.hecho.titulo")}</Texto>
            <Texto>{t("entrada.recuperar.hecho.texto")}</Texto>
          </Tarjeta>
        )}
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
        {/* Quien acaba de descargar la app aún no tiene cuenta: el alta, a la vista, justo debajo. */}
        <Tarjeta>
          <Texto tono="fuerte">{t("entrada.entrar.sinCuenta")}</Texto>
          <Boton variante="secundario" alPulsar={() => router.push("/alta")}>
            {t("entrada.entrar.crear")}
          </Boton>
        </Tarjeta>
        {/* La recuperación pide el código en papel: se teclea aquí y no sale del móvil. */}
        <Boton variante="secundario" alPulsar={() => router.push("/recuperar")}>
          {t("entrada.entrar.olvidada")}
        </Boton>
      </View>
    </Pantalla>
  );
}
