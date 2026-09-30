import { useState } from "react";
import { Redirect, router } from "expo-router";
import { View } from "react-native";
import { Boton, Campo, Pantalla, Tarjeta, Texto, Titulo } from "@/components/ui";
import { ErrorApi } from "@/lib/api";
import { useSesion } from "@/lib/sesion";
import { espacio } from "@/lib/tema";

/* Entrar, segundo paso: el código de 8 caracteres que llegó por correo o SMS.
   Sin él nadie entra, aunque sepa el número de chip y la contraseña. */

export default function Codigo() {
  const { paso, confirmar, reenviar } = useSesion();
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [nota, setNota] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [reenviando, setReenviando] = useState(false);

  if (!paso) return <Redirect href="/entrar" />;
  const porSms = paso.canal === "sms";

  async function alConfirmar() {
    setError(null);
    setEnviando(true);
    try {
      await confirmar(codigo);
    } catch (e) {
      if (e instanceof ErrorApi && e.estado === 400) {
        const quedan = e.datos.intentosRestantes;
        setError(typeof quedan === "number" ? `Código incorrecto. Te quedan ${quedan} intentos.` : "Código incorrecto.");
      } else if (e instanceof ErrorApi && (e.estado === 410 || e.estado === 429)) {
        setError("El código ha caducado o se han agotado los intentos. Vuelve a empezar.");
      } else setError("No se ha podido comprobar el código. Vuelve a intentarlo.");
    } finally {
      setEnviando(false);
    }
  }

  async function alReenviar(canal?: "correo" | "sms") {
    setError(null);
    setNota(null);
    setReenviando(true);
    try {
      await reenviar(canal);
      setCodigo("");
      setNota("Te hemos enviado un código nuevo. El anterior ya no vale.");
    } catch (e) {
      const segundos = e instanceof ErrorApi ? e.datos.segundos : undefined;
      if (typeof segundos === "number") setNota(`Espera ${segundos} s antes de pedir otro código.`);
      else if (e instanceof ErrorApi && e.datos.motivo === "sin-cupo-sms")
        setNota("Has llegado al límite de SMS de hoy. Pide el código por correo.");
      else setError("No se ha podido enviar otro código.");
    } finally {
      setReenviando(false);
    }
  }

  return (
    <Pantalla>
      <View style={{ gap: espacio.sm }}>
        <Titulo>Escribe el código</Titulo>
        <Texto tono="suave">
          {porSms ? "Te lo hemos enviado por SMS al " : "Te lo hemos enviado a "}
          <Texto tono="fuerte">{paso.destino}</Texto>. Caduca en 15 minutos.
        </Texto>
      </View>
      <View style={{ gap: espacio.xl }}>
        <Campo
          etiqueta="Código"
          datos
          value={codigo}
          onChangeText={setCodigo}
          placeholder="XXXX-XXXX"
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={12}
          onSubmitEditing={() => void alConfirmar()}
          error={error}
        />
        {nota && (
          <Tarjeta>
            <Texto>{nota}</Texto>
          </Tarjeta>
        )}
        <Boton alPulsar={() => void alConfirmar()} ocupado={enviando} desactivado={codigo.trim().length < 8}>
          Entrar
        </Boton>
        <Boton variante="secundario" alPulsar={() => void alReenviar()} ocupado={reenviando}>
          Enviar otro código
        </Boton>
        {paso.otroCanal && (
          <Boton variante="secundario" alPulsar={() => void alReenviar(paso.otroCanal!)}>
            {paso.otroCanal === "sms" ? "Recibirlo por SMS" : "Recibirlo por correo"}
          </Boton>
        )}
        <Boton variante="secundario" alPulsar={() => router.replace("/entrar")}>
          Volver
        </Boton>
      </View>
    </Pantalla>
  );
}
