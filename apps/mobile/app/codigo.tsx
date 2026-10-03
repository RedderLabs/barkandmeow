import { useState } from "react";
import { Redirect, router } from "expo-router";
import { View } from "react-native";
import { Boton, Campo, Pantalla, Tarjeta, Texto, Titulo } from "@/components/ui";
import { ErrorApi } from "@/lib/api";
import { useT } from "@/lib/idioma";
import { useSesion } from "@/lib/sesion";
import { espacio } from "@/lib/tema";

/* Entrar, segundo paso: el código de 8 caracteres que llegó por correo o SMS.
   Sin él nadie entra, aunque sepa el número de chip y la contraseña. */

export default function Codigo() {
  const { paso, confirmar, reenviar } = useSesion();
  const t = useT();
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
        setError(
          typeof quedan !== "number"
            ? t("entrada.codigo.incorrecto")
            : quedan === 1
              ? t("entrada.codigo.incorrecto.uno")
              : t("entrada.codigo.incorrecto.varios", { n: quedan }),
        );
      } else if (e instanceof ErrorApi && (e.estado === 410 || e.estado === 429)) {
        setError(t("entrada.codigo.caducado"));
      } else setError(t("entrada.codigo.errorComprobar"));
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
      setNota(t("entrada.codigo.nuevo"));
    } catch (e) {
      const segundos = e instanceof ErrorApi ? e.datos.segundos : undefined;
      if (typeof segundos === "number") setNota(t("entrada.codigo.espera", { n: segundos }));
      else if (e instanceof ErrorApi && e.datos.motivo === "sin-cupo-sms") setNota(t("entrada.codigo.sinSms"));
      else setError(t("entrada.codigo.errorEnvio"));
    } finally {
      setReenviando(false);
    }
  }

  return (
    <Pantalla>
      <View style={{ gap: espacio.sm }}>
        <Titulo>{t("entrada.codigo.titulo")}</Titulo>
        <Texto tono="suave">
          {t(porSms ? "entrada.codigo.porSms" : "entrada.codigo.porCorreo")}{" "}
          <Texto tono="fuerte">{paso.destino}</Texto>. {t("entrada.codigo.caduca")}
        </Texto>
      </View>
      <View style={{ gap: espacio.xl }}>
        <Campo
          etiqueta={t("entrada.codigo.campo")}
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
          {t("entrada.codigo.entrar")}
        </Boton>
        <Boton variante="secundario" alPulsar={() => void alReenviar()} ocupado={reenviando}>
          {t("entrada.codigo.otro")}
        </Boton>
        {paso.otroCanal && (
          <Boton variante="secundario" alPulsar={() => void alReenviar(paso.otroCanal!)}>
            {t(paso.otroCanal === "sms" ? "entrada.codigo.recibirSms" : "entrada.codigo.recibirCorreo")}
          </Boton>
        )}
        <Boton variante="secundario" alPulsar={() => router.replace("/entrar")}>
          {t("entrada.codigo.volver")}
        </Boton>
      </View>
    </Pantalla>
  );
}
