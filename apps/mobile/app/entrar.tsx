import { useState } from "react";
import { router } from "expo-router";
import { Image, useColorScheme, View } from "react-native";
import { Boton, Campo, Pantalla, Tarjeta, Texto, Titulo } from "@/components/ui";
import { ErrorApi, identificar } from "@/lib/api";
import { useSesion } from "@/lib/sesion";
import { espacio } from "@/lib/tema";

/* Entrar, primer paso: el número de chip (identifica, no autoriza) y la
   contraseña. Después llega un código por correo o por SMS. El alta se hace
   en el portal web: ahí se genera y se imprime el código de recuperación. */

export default function Entrar() {
  const { entrar } = useSesion();
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
      setErrorChip("Escribe los 15 dígitos del chip (o los 9–10 caracteres de un chip antiguo).");
      return;
    }
    setErrorChip(null);
    setEnviando(true);
    try {
      await entrar(id, password);
      router.push("/codigo");
    } catch (e) {
      if (e instanceof ErrorApi && e.estado === 401) setError("El chip o la contraseña no son correctos.");
      else if (e instanceof ErrorApi && e.estado === 429)
        setError("Demasiados intentos seguidos. Espera un minuto y vuelve a probar.");
      else if (e instanceof ErrorApi && e.estado === 0) setError("Sin conexión. Comprueba la red y vuelve a intentarlo.");
      else setError("No se ha podido enviar el código. Vuelve a intentarlo en un momento.");
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
        <Titulo>Entrar</Titulo>
        <Texto tono="suave">Con el chip de tu mascota y tu contraseña.</Texto>
      </View>
      <View style={{ gap: espacio.xl }}>
        <Campo
          etiqueta="Número de chip"
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
          etiqueta="Contraseña"
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
          Continuar
        </Boton>
      </View>
      <Texto tono="suave">
        ¿Aún no tienes cuenta? Date de alta en barkandmeow.app/mi-mascota: allí se genera el código de
        recuperación en papel que abre tu bandeja.
      </Texto>
    </Pantalla>
  );
}
