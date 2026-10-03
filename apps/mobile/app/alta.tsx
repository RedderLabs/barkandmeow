import { useState } from "react";
import * as Crypto from "expo-crypto";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { Text } from "@/components/texto";
import { Boton, Campo, Pantalla, Tarjeta, Texto, Titulo } from "@/components/ui";
import { ErrorApi, identificar } from "@/lib/api";
import { claveDeDueno, nuevoCodigo } from "@/lib/cripto";
import { useT } from "@/lib/idioma";
import { useSesion } from "@/lib/sesion";
import { espacio, fuente, radio, toque, useColores } from "@/lib/tema";

/* Darse de alta, en tres pasos como en la web: la mascota, la cuenta y la
   clave. La clave sale de un código en papel que se genera aquí y no sale del
   móvil: al servidor solo van las públicas. La llamada es una sola, al final;
   después, el mismo paso del código que al entrar. */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lo que se teclea de un bloque, comparable con el impreso: O es 0, I y L son 1. */
const normalizarBloque = (x: string) => x.toUpperCase().replace(/\s/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");

/** Dos bloques distintos al azar, en orden, para comprobar que el papel está apuntado. */
function dosBloques(): [number, number] {
  const [x, y] = Crypto.getRandomBytes(2);
  const a = x % 8;
  const b = (a + 1 + (y % 7)) % 8;
  return a < b ? [a, b] : [b, a];
}

export default function Alta() {
  const t = useT();
  const c = useColores();
  const { darDeAlta } = useSesion();
  const [paso, setPaso] = useState(0);
  const [chip, setChip] = useState("");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repetida, setRepetida] = useState("");
  // El código se genera una vez: si se vuelve atrás, sigue siendo el mismo, por si ya está apuntado.
  const [codigo] = useState(() => nuevoCodigo(Crypto.getRandomBytes(19)));
  const [pedidos] = useState(dosBloques);
  const [apuntado, setApuntado] = useState(false);
  const [confirmacion, setConfirmacion] = useState(["", ""]);
  const [intentado, setIntentado] = useState(false);
  const [emailUsado, setEmailUsado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sinCodigo, setSinCodigo] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const id = identificar(chip);
  const correo = email.trim().toLowerCase();
  const confirmado = apuntado && pedidos.every((p, i) => normalizarBloque(confirmacion[i]) === codigo.bloques[p]);

  const errores: { chip?: string; email?: string; password?: string; repetida?: string; papel?: string } = {};
  if (intentado && paso === 0 && !id) errores.chip = t("entrada.entrar.errorChip");
  if (intentado && paso === 1) {
    if (!EMAIL.test(correo)) errores.email = t("entrada.alta.errorEmail");
    else if (emailUsado === correo) errores.email = t("entrada.alta.emailUsado");
    if (password.length < 12) errores.password = t("entrada.alta.minimo");
    else if (password !== repetida) errores.repetida = t("entrada.alta.noCoinciden");
  }
  if (intentado && paso === 2 && !confirmado)
    errores.papel = apuntado ? t("entrada.alta.bloquesMal") : t("entrada.alta.marcaApuntado");

  function pasoValido(p: number) {
    if (p === 0) return !!id;
    if (p === 1) return EMAIL.test(correo) && emailUsado !== correo && password.length >= 12 && password === repetida;
    return confirmado;
  }

  function ir(p: number) {
    setIntentado(false);
    setError(null);
    setPaso(p);
  }

  async function alContinuar() {
    setIntentado(true);
    if (!pasoValido(paso)) return;
    if (paso < 2) return ir(paso + 1);

    setEnviando(true);
    setError(null);
    try {
      // Derivar cuesta unos milisegundos; se deja pintar el indicador antes.
      await new Promise((r) => setTimeout(r, 0));
      const { secreta } = claveDeDueno(codigo.semilla);
      const datos = { email: correo, password, identificador: id!, nombre: nombre.trim() };
      const conCodigo = await darDeAlta(datos, secreta);
      if (conCodigo) router.replace("/codigo");
      else setSinCodigo(true);
    } catch (e) {
      if (e instanceof ErrorApi && e.estado === 409) {
        setEmailUsado(correo);
        setPaso(1);
        setIntentado(true);
        return;
      }
      setError(
        e instanceof ErrorApi && e.estado === 0
          ? t("entrada.alta.errorRed")
          : e instanceof ErrorApi && e.estado === 429
            ? t("entrada.entrar.error429")
            : t("entrada.alta.error"),
      );
    } finally {
      setEnviando(false);
    }
  }

  function volver() {
    if (router.canGoBack()) router.back();
    else router.replace("/entrar");
  }

  // La cuenta existe, pero el código del correo no salió: al entrar se pide otro.
  if (sinCodigo)
    return (
      <Pantalla>
        <View style={{ gap: espacio.sm }}>
          <Titulo>{t("entrada.alta.creada")}</Titulo>
          <Texto tono="suave">{t("entrada.alta.sinCodigo")}</Texto>
        </View>
        <Boton alPulsar={() => router.replace({ pathname: "/entrar", params: { chip } })}>
          {t("entrada.entrar.titulo")}
        </Boton>
      </Pantalla>
    );

  const titulos = [t("entrada.alta.paso.mascota"), t("entrada.alta.paso.cuenta"), t("entrada.alta.paso.clave")];

  return (
    <Pantalla>
      <View style={{ gap: espacio.sm }}>
        <Text style={{ fontFamily: fuente.textoFuerte, fontSize: 13, letterSpacing: 0.4, color: c.muted }}>
          {t("entrada.alta.progreso", { n: paso + 1, nombre: titulos[paso] })}
        </Text>
        <Titulo>
          {paso === 0
            ? t("entrada.alta.titulo.mascota")
            : paso === 1
              ? t("entrada.alta.titulo.cuenta")
              : t("entrada.alta.titulo.clave")}
        </Titulo>
      </View>

      {paso === 0 && (
        <View style={{ gap: espacio.xl }}>
          <Texto tono="suave">{t("entrada.alta.introMascota")}</Texto>
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
            error={errores.chip}
          />
          <Campo etiqueta={t("entrada.alta.nombre")} value={nombre} onChangeText={setNombre} maxLength={60} />
        </View>
      )}

      {paso === 1 && (
        <View style={{ gap: espacio.xl }}>
          <Texto tono="suave">{t("entrada.alta.introCuenta")}</Texto>
          <Campo
            etiqueta={t("entrada.alta.email")}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            maxLength={254}
            error={errores.email}
          />
          <Campo
            etiqueta={t("entrada.entrar.clave")}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            placeholder={t("entrada.alta.minimo")}
            error={errores.password}
          />
          <Campo
            etiqueta={t("entrada.alta.repetida")}
            value={repetida}
            onChangeText={setRepetida}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            error={errores.repetida}
          />
        </View>
      )}

      {paso === 2 && (
        <View style={{ gap: espacio.xl }}>
          <Texto tono="suave">{t("entrada.alta.introClave")}</Texto>
          <Tarjeta tono="aviso">
            <Texto tono="fuerte">{t("entrada.alta.aviso.titulo")}</Texto>
            <Texto>{t("entrada.alta.aviso.texto")}</Texto>
          </Tarjeta>
          {/* Los 8 bloques, grandes y numerados: así se pide luego el 3 o el 6. */}
          <View
            accessibilityLabel={t("entrada.alta.codigoLeido", { codigo: codigo.bloques.join(" ") })}
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              rowGap: espacio.md,
              backgroundColor: c.surface,
              borderColor: c.line,
              borderWidth: 1,
              borderRadius: radio.panel,
              paddingVertical: espacio.lg,
              paddingHorizontal: espacio.md,
            }}
          >
            {codigo.bloques.map((b, i) => (
              <View
                key={i}
                style={{ width: "50%", flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 8 }}
              >
                <Text style={{ fontFamily: fuente.datos, fontSize: 12, color: c.muted, minWidth: 14 }}>{i + 1}</Text>
                <Text style={{ fontFamily: fuente.datos, fontSize: 28, letterSpacing: 3, color: c.ink }}>{b}</Text>
              </View>
            ))}
          </View>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: apuntado }}
            onPress={() => setApuntado((x) => !x)}
            style={{ flexDirection: "row", alignItems: "center", gap: espacio.md, minHeight: toque }}
          >
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                borderWidth: 2,
                borderColor: apuntado ? c.accent : c.fieldLine,
                backgroundColor: apuntado ? c.accent : c.surface,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {apuntado && <Text style={{ color: c.accentOn, fontSize: 14, fontFamily: fuente.textoFuerte }}>✓</Text>}
            </View>
            <View style={{ flex: 1 }}>
              <Texto>{t("entrada.alta.apuntado")}</Texto>
            </View>
          </Pressable>
          <Texto tono="fuerte">{t("entrada.alta.comprobar")}</Texto>
          <View style={{ flexDirection: "row", gap: espacio.md }}>
            {pedidos.map((p, i) => (
              <View key={p} style={{ flex: 1 }}>
                <Campo
                  etiqueta={t("entrada.alta.bloque", { n: p + 1 })}
                  datos
                  value={confirmacion[i]}
                  onChangeText={(v) => setConfirmacion((x) => x.map((y, j) => (j === i ? v : y)))}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={4}
                />
              </View>
            ))}
          </View>
          {errores.papel && (
            <Text accessibilityRole="alert" style={{ fontFamily: fuente.texto, fontSize: 13, color: c.alertInk }}>
              {errores.papel}
            </Text>
          )}
        </View>
      )}

      {error && (
        <Tarjeta tono="alerta">
          <Texto>{error}</Texto>
        </Tarjeta>
      )}

      <View style={{ gap: espacio.md }}>
        <Boton alPulsar={() => void alContinuar()} ocupado={enviando}>
          {paso < 2 ? t("entrada.entrar.continuar") : t("entrada.alta.crear")}
        </Boton>
        {paso > 0 ? (
          <Boton variante="secundario" alPulsar={() => ir(paso - 1)} desactivado={enviando}>
            {t("entrada.alta.atras")}
          </Boton>
        ) : (
          <Boton variante="secundario" alPulsar={volver}>
            {t("entrada.alta.yaTengo")}
          </Boton>
        )}
      </View>
    </Pantalla>
  );
}
