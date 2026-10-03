import { useState } from "react";
import { router } from "expo-router";
import { View } from "react-native";
import { mensajeRecuperacion } from "@barkandmeow/schema";
import { Boton, Campo, Pantalla, Tarjeta, Texto, Titulo } from "@/components/ui";
import { empezarRecuperacion, ErrorApi, identificar, probarPapel, terminarRecuperacion } from "@/lib/api";
import { guardarClave } from "@/lib/almacen";
import { aBase64, claveDeDueno, claveDeRecuperacion, firmar, leerCodigo } from "@/lib/cripto";
import { useT, type T } from "@/lib/idioma";
import { espacio } from "@/lib/tema";

/* Recuperar la contraseña, como en la web: el chip y el código en papel, y
   después el código del correo o del SMS con la contraseña nueva. El papel no
   sale del móvil: con su clave se firma un reto del servidor, que solo guarda
   la pública con que comprobarlo. Al acabar, el servidor cierra todas las
   sesiones y se vuelve a entrar con la contraseña nueva. */

type Fase = { tipo: "papel" } | { tipo: "codigo"; recuperacionId: string; destino: string; canal: "correo" | "sms" };

/** El texto de cada error del servidor, para quien está recuperando la cuenta. */
function mensaje(e: unknown, t: T): string {
  if (!(e instanceof ErrorApi)) return t("entrada.recuperar.error");
  const d = e.datos;
  if (e.estado === 0) return t("entrada.entrar.errorRed");
  if (d.motivo === "papel") return t("entrada.recuperar.papelAjeno");
  if (e.estado === 410) return t("entrada.recuperar.caducada");
  if (d.motivo === "incorrecto") {
    const quedan = d.intentosRestantes;
    return typeof quedan !== "number"
      ? t("entrada.codigo.incorrecto")
      : quedan === 1
        ? t("entrada.codigo.incorrecto.uno")
        : t("entrada.codigo.incorrecto.varios", { n: quedan });
  }
  if (e.estado === 429) return t("entrada.entrar.error429");
  if (e.estado === 502) return t("entrada.entrar.errorEnvio");
  return t("entrada.recuperar.error");
}

export default function Recuperar() {
  const t = useT();
  const [chip, setChip] = useState("");
  const [papel, setPapel] = useState("");
  const [codigo, setCodigo] = useState("");
  const [password, setPassword] = useState("");
  const [repetida, setRepetida] = useState("");
  const [fase, setFase] = useState<Fase>({ tipo: "papel" });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function alProbar() {
    setError(null);
    const id = identificar(chip);
    if (!id) return setError(t("entrada.entrar.errorChip"));
    const semilla = leerCodigo(papel);
    if (!semilla) return setError(t("entrada.clave.invalido"));
    setEnviando(true);
    try {
      // Derivar y firmar cuesta unos milisegundos; se deja pintar el indicador antes.
      await new Promise((r) => setTimeout(r, 0));
      const clave = claveDeDueno(semilla);
      const rec = claveDeRecuperacion(clave.secreta);
      const { recuperacionId, reto } = await empezarRecuperacion(id);
      const firma = firmar(rec.semilla, new TextEncoder().encode(mensajeRecuperacion(recuperacionId, reto)));
      const r = await probarPapel(recuperacionId, aBase64(rec.publica), aBase64(firma));
      // El papel ya está leído y es de esta cuenta: la clave se queda en el llavero, como al abrir la bandeja.
      await guardarClave(clave.secreta).catch(() => {});
      setFase({ tipo: "codigo", recuperacionId, destino: r.destino, canal: r.canal });
    } catch (e) {
      setError(mensaje(e, t));
    } finally {
      setEnviando(false);
    }
  }

  async function alTerminar() {
    if (fase.tipo !== "codigo") return;
    setError(null);
    const limpio = codigo.toUpperCase().replace(/[\s-]/g, "");
    if (limpio.length !== 8) return setError(t("entrada.recuperar.ochoCaracteres"));
    if (password.length < 12) return setError(t("entrada.recuperar.minimo"));
    if (password !== repetida) return setError(t("entrada.alta.noCoinciden"));
    setEnviando(true);
    try {
      await terminarRecuperacion(fase.recuperacionId, limpio, password);
      router.replace({ pathname: "/entrar", params: { chip, aviso: "recuperada" } });
    } catch (e) {
      if (e instanceof ErrorApi && e.estado === 410) {
        setFase({ tipo: "papel" });
        setCodigo("");
      }
      setError(mensaje(e, t));
    } finally {
      setEnviando(false);
    }
  }

  function volver() {
    if (router.canGoBack()) router.back();
    else router.replace("/entrar");
  }

  const avisoError = error && (
    <Tarjeta tono="alerta">
      <Texto>{error}</Texto>
    </Tarjeta>
  );

  if (fase.tipo === "codigo")
    return (
      <Pantalla>
        <View style={{ gap: espacio.sm }}>
          <Titulo>
            {t(fase.canal === "sms" ? "entrada.recuperar.revisaMovil" : "entrada.recuperar.revisaCorreo")}
          </Titulo>
          <Texto tono="suave">
            {t(fase.canal === "sms" ? "entrada.codigo.porSms" : "entrada.codigo.porCorreo")}{" "}
            <Texto tono="fuerte">{fase.destino}</Texto>. {t("entrada.codigo.caduca")}
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
          />
          <Campo
            etiqueta={t("entrada.recuperar.nueva")}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            placeholder={t("entrada.alta.minimo")}
          />
          <Campo
            etiqueta={t("entrada.alta.repetida")}
            value={repetida}
            onChangeText={setRepetida}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            onSubmitEditing={() => void alTerminar()}
          />
          {avisoError}
          <Boton alPulsar={() => void alTerminar()} ocupado={enviando}>
            {t("entrada.recuperar.guardar")}
          </Boton>
          <Boton variante="secundario" alPulsar={volver} desactivado={enviando}>
            {t("entrada.codigo.volver")}
          </Boton>
        </View>
      </Pantalla>
    );

  return (
    <Pantalla>
      <View style={{ gap: espacio.sm }}>
        <Titulo>{t("entrada.recuperar.titulo")}</Titulo>
        <Texto tono="suave">{t("entrada.recuperar.intro")}</Texto>
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
          maxLength={32}
        />
        <Campo
          etiqueta={t("entrada.clave.campo")}
          datos
          multiline
          value={papel}
          onChangeText={setPapel}
          placeholder="XXXX XXXX XXXX XXXX XXXX XXXX XXXX XXXX"
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
        />
        <Texto tono="suave">{t("entrada.recuperar.papelAyuda")}</Texto>
        {avisoError}
        <Boton alPulsar={() => void alProbar()} ocupado={enviando} desactivado={!chip.trim() || !papel.trim()}>
          {t("entrada.entrar.continuar")}
        </Boton>
        <Boton variante="secundario" alPulsar={volver} desactivado={enviando}>
          {t("entrada.recuperar.volver")}
        </Boton>
      </View>
      <Texto tono="suave">{t("entrada.recuperar.sinPapel")}</Texto>
    </Pantalla>
  );
}
