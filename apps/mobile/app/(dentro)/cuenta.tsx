import { useState } from "react";
import { router } from "expo-router";
import { Alert, View } from "react-native";
import { Boton, Campo, Cargando, Opciones, Pantalla, Tarjeta, Texto, Titulo, Ventana } from "@/components/ui";
import { IDIOMAS } from "@barkandmeow/i18n";
import { useAjustes, type Letra, type PreferenciaIdioma, type Tema } from "@/lib/ajustes";
import {
  borrarCuenta,
  cambiarContrasena,
  confirmarTelefono,
  elegirSegundoFactor,
  ErrorApi,
  ponerTelefono,
  quitarTelefono,
  yo,
  type Canal,
} from "@/lib/api";
import { leerClave, leerPush } from "@/lib/almacen";
import { rellenarRecuperacion } from "@/lib/recuperacion";
import { deBase64, iguales, publica } from "@/lib/cripto";
import { useCarga } from "@/lib/datos";
import { useT, type Clave } from "@/lib/idioma";
import { activarPush } from "@/lib/push";
import { useSesion } from "@/lib/sesion";
import { espacio } from "@/lib/tema";

async function cargar() {
  const [y, clave, push] = await Promise.all([yo(), leerClave(), leerPush()]);
  rellenarRecuperacion(y, clave);
  return {
    correo: y.correo,
    segundoFactor: y.segundoFactor,
    telefono: y.telefono,
    clave: !!clave && iguales(publica(clave), deBase64(y.pubKey)),
    push: !!push,
  };
}

const motivos = {
  simulador: "cuenta.motivo.simulador",
  permiso: "cuenta.motivo.permiso",
  "sin-proyecto": "cuenta.motivo.sinProyecto",
  error: "cuenta.motivo.error",
} as const satisfies Record<string, Clave>;

const TEMAS = [
  ["sistema", "cuenta.tema.sistema"],
  ["claro", "cuenta.tema.claro"],
  ["oscuro", "cuenta.tema.oscuro"],
] as const satisfies readonly (readonly [Tema, Clave])[];

const LETRAS = [
  ["normal", "cuenta.letra.normal"],
  ["grande", "cuenta.letra.grande"],
  ["muy-grande", "cuenta.letra.muyGrande"],
] as const satisfies readonly (readonly [Letra, Clave])[];

/** Cada idioma se nombra en sí mismo: quien no entiende el actual reconoce el suyo. */
const NOMBRES = { es: "Español", pt: "Português", en: "English", fr: "Français" } as const;

/** Cómo se ve la app en este móvil. Se guarda aquí, no en la cuenta. */
function Apariencia() {
  const t = useT();
  const { tema, letra, idioma, elegirTema, elegirLetra, elegirIdioma } = useAjustes();
  const idiomas: (readonly [PreferenciaIdioma, string])[] = [
    ["sistema", t("cuenta.idioma.sistema")],
    ...IDIOMAS.map((i) => [i, NOMBRES[i]] as const),
  ];
  return (
    <Tarjeta>
      <Texto tono="fuerte">{t("cuenta.pantalla")}</Texto>
      <Opciones etiqueta={t("cuenta.idioma")} opciones={idiomas} valor={idioma} alElegir={elegirIdioma} />
      <Opciones
        etiqueta={t("cuenta.tema")}
        opciones={TEMAS.map(([v, k]) => [v, t(k)] as const)}
        valor={tema}
        alElegir={elegirTema}
      />
      <Opciones
        etiqueta={t("cuenta.letra")}
        opciones={LETRAS.map(([v, k]) => [v, t(k)] as const)}
        valor={letra}
        alElegir={elegirLetra}
      />
      <Texto tono="suave">{t("cuenta.pantallaNota")}</Texto>
    </Tarjeta>
  );
}

/** Lo que dice la API cuando algo del SMS sale mal, en el idioma de la app. */
function errorDeSms(e: unknown, t: ReturnType<typeof useT>) {
  const d = e instanceof ErrorApi ? e.datos : {};
  if (d.motivo === "telefono") return t("cuenta.factor.error.telefono");
  if (d.motivo === "espera") return t("cuenta.factor.error.espera", { n: String(d.segundos) });
  if (d.motivo === "sin-cupo-sms") return t("cuenta.factor.error.sinCupo");
  if (d.motivo === "incorrecto") return t("cuenta.factor.error.incorrecto", { n: String(d.intentosRestantes) });
  if (d.motivo === "caducado") return t("cuenta.factor.error.caducado");
  if (d.motivo === "demasiados-intentos") return t("cuenta.factor.error.demasiados");
  if (d.motivo === "envio") return t("cuenta.factor.error.envio");
  return t("comun.errorReintentar");
}

/* El código de entrada: por correo o por SMS, como en la web. El teléfono solo
   sirve para eso y no cuenta hasta confirmarlo con el código que llega. */
function CodigoDeEntrada({
  canal,
  telefono,
  alCambiar,
}: {
  canal: Canal;
  telefono: { numero: string; verificado: boolean } | null;
  alCambiar: () => Promise<void>;
}) {
  const t = useT();
  const [numero, setNumero] = useState("");
  const [codigo, setCodigo] = useState("");
  // El SMS enviado y sin confirmar: el paso del código.
  const [esperando, setEsperando] = useState<string | null>(telefono && !telefono.verificado ? telefono.numero : null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const confirmado = telefono?.verificado ? telefono.numero : null;

  async function hacer(accion: () => Promise<unknown>, despues?: () => void) {
    setOcupado(true);
    setError(null);
    try {
      await accion();
      despues?.();
      await alCambiar();
    } catch (e) {
      setError(errorDeSms(e, t));
    } finally {
      setOcupado(false);
    }
  }

  function enviar() {
    void hacer(
      async () => setEsperando((await ponerTelefono(numero)).telefono),
      () => setCodigo(""),
    );
  }

  function confirmar() {
    const limpio = codigo.toUpperCase().replace(/[\s-]/g, "");
    if (limpio.length !== 8) return setError(t("cuenta.factor.ochoCaracteres"));
    void hacer(
      () => confirmarTelefono(limpio),
      () => {
        setEsperando(null);
        Alert.alert(t("cuenta.factor"), t("cuenta.factor.confirmado"));
      },
    );
  }

  return (
    <Tarjeta>
      <Texto tono="fuerte">{t("cuenta.factor")}</Texto>
      <Texto>
        {canal === "sms" && confirmado ? t("cuenta.factor.sms", { numero: confirmado }) : t("cuenta.factor.correo")}
      </Texto>
      {confirmado && !esperando && (
        <>
          <Boton
            variante="secundario"
            ocupado={ocupado}
            alPulsar={() => void hacer(() => elegirSegundoFactor(canal === "sms" ? "correo" : "sms"))}
          >
            {canal === "sms" ? t("cuenta.factor.porCorreo") : t("cuenta.factor.porSms")}
          </Boton>
          <Boton variante="secundario" desactivado={ocupado} alPulsar={() => void hacer(quitarTelefono)}>
            {t("cuenta.factor.quitar")}
          </Boton>
        </>
      )}
      {esperando ? (
        <>
          <Campo
            etiqueta={t("cuenta.factor.codigo", { numero: esperando })}
            datos
            autoCapitalize="characters"
            autoComplete="one-time-code"
            maxLength={9}
            placeholder="XXXX-XXXX"
            value={codigo}
            onChangeText={setCodigo}
            error={error}
          />
          <Boton alPulsar={confirmar} ocupado={ocupado} desactivado={!codigo.trim()}>
            {t("cuenta.factor.confirmar")}
          </Boton>
          <Boton variante="secundario" desactivado={ocupado} alPulsar={() => setEsperando(null)}>
            {t("cuenta.factor.otroNumero")}
          </Boton>
        </>
      ) : (
        <>
          {!confirmado && <Texto tono="suave">{t("cuenta.factor.intro")}</Texto>}
          <Campo
            etiqueta={confirmado ? t("cuenta.factor.cambiarTelefono") : t("cuenta.factor.telefono")}
            keyboardType="phone-pad"
            autoComplete="tel"
            placeholder="+34 612 345 678"
            value={numero}
            onChangeText={setNumero}
            error={error}
          />
          <Boton variante="secundario" alPulsar={enviar} ocupado={ocupado} desactivado={!numero.trim()}>
            {t("cuenta.factor.enviar")}
          </Boton>
        </>
      )}
    </Tarjeta>
  );
}

/** El error de las dos ventanas: contraseña mal, demasiados intentos o fallo de red. */
function errorDeContrasena(e: unknown, t: ReturnType<typeof useT>) {
  if (e instanceof ErrorApi && e.estado === 403) return t("cuenta.contrasena.incorrecta");
  if (e instanceof ErrorApi && e.estado === 429) return t("cuenta.contrasena.demasiados");
  return t("comun.errorReintentar");
}

/** Cambiar la contraseña: la actual y dos veces la nueva. Las demás sesiones se cierran. */
function CambiarContrasena({ abierta, alCerrar }: { abierta: boolean; alCerrar: () => void }) {
  const t = useT();
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetida, setRepetida] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  function cerrar() {
    if (ocupado) return;
    setActual("");
    setNueva("");
    setRepetida("");
    setError(null);
    alCerrar();
  }

  async function guardar() {
    if (nueva.length < 12) return setError(t("cuenta.contrasena.corta"));
    if (nueva !== repetida) return setError(t("cuenta.contrasena.distintas"));
    setError(null);
    setOcupado(true);
    try {
      await cambiarContrasena(actual, nueva);
      setOcupado(false);
      Alert.alert(t("cuenta.contrasena.hecho"), t("cuenta.contrasena.hechoTexto"));
      setActual("");
      setNueva("");
      setRepetida("");
      alCerrar();
    } catch (e) {
      setOcupado(false);
      setError(errorDeContrasena(e, t));
    }
  }

  return (
    <Ventana abierta={abierta} titulo={t("cuenta.contrasena.cambiar")} alCerrar={cerrar}>
      <Texto tono="suave">{t("cuenta.contrasena.intro")}</Texto>
      <Campo
        etiqueta={t("cuenta.contrasena.actual")}
        secureTextEntry
        autoComplete="current-password"
        value={actual}
        onChangeText={setActual}
      />
      <Campo
        etiqueta={t("cuenta.contrasena.nueva")}
        secureTextEntry
        autoComplete="new-password"
        value={nueva}
        onChangeText={setNueva}
      />
      <Campo
        etiqueta={t("cuenta.contrasena.repetir")}
        secureTextEntry
        autoComplete="new-password"
        value={repetida}
        onChangeText={setRepetida}
        error={error}
      />
      <Boton alPulsar={() => void guardar()} ocupado={ocupado} desactivado={!actual || !nueva || !repetida}>
        {t("cuenta.contrasena.cambiar")}
      </Boton>
    </Ventana>
  );
}

/** Borrar la cuenta: se explica qué se pierde, se pide la contraseña y se confirma otra vez. */
function BorrarCuenta({ abierta, alCerrar }: { abierta: boolean; alCerrar: () => void }) {
  const t = useT();
  const { olvidar } = useSesion();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  function cerrar() {
    if (ocupado) return;
    setPassword("");
    setError(null);
    alCerrar();
  }

  async function borrar() {
    setError(null);
    setOcupado(true);
    try {
      await borrarCuenta(password);
      // La cuenta ya no existe: sin cerrar la ventana a mano, la sesión pasa a «fuera» y la app vuelve a la entrada.
      await olvidar();
    } catch (e) {
      setOcupado(false);
      setError(errorDeContrasena(e, t));
    }
  }

  function confirmar() {
    Alert.alert(t("cuenta.borrar.pregunta"), t("cuenta.borrar.preguntaTexto"), [
      { text: t("comun.volver"), style: "cancel" },
      { text: t("cuenta.borrar.si"), style: "destructive", onPress: () => void borrar() },
    ]);
  }

  return (
    <Ventana abierta={abierta} titulo={t("cuenta.borrar")} alCerrar={cerrar}>
      <Tarjeta tono="alerta">
        <Texto>{t("cuenta.borrar.intro")}</Texto>
      </Tarjeta>
      <Campo
        etiqueta={t("cuenta.borrar.campo")}
        secureTextEntry
        autoComplete="current-password"
        value={password}
        onChangeText={setPassword}
        error={error}
      />
      <Boton variante="peligro" alPulsar={confirmar} ocupado={ocupado} desactivado={!password}>
        {t("cuenta.borrar.boton")}
      </Boton>
    </Ventana>
  );
}

export default function Cuenta() {
  const t = useT();
  const { salir } = useSesion();
  const { carga, refrescar } = useCarga(cargar);
  const [activando, setActivando] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const [ventana, setVentana] = useState<"contrasena" | "borrar" | null>(null);

  async function alActivar() {
    setActivando(true);
    const fallo = await activarPush();
    setActivando(false);
    if (fallo) Alert.alert(t("cuenta.avisosNo"), t(motivos[fallo]));
    await refrescar();
  }

  function alSalir() {
    Alert.alert(t("cuenta.salirPregunta"), t("cuenta.salirTexto"), [
      { text: t("comun.volver"), style: "cancel" },
      {
        text: t("cuenta.salirSi"),
        style: "destructive",
        onPress: async () => {
          setSaliendo(true);
          await salir();
        },
      },
    ]);
  }

  return (
    <Pantalla>
      <Titulo>{t("cuenta.titulo")}</Titulo>
      {carga.estado === "cargando" && <Cargando texto={t("comun.cargando")} />}
      {carga.estado === "listo" && (
        <View style={{ gap: espacio.lg }}>
          <Tarjeta>
            <Texto tono="suave">{t("cuenta.correo")}</Texto>
            <Texto tono="fuerte">{carga.datos.correo}</Texto>
          </Tarjeta>
          <Tarjeta tono={carga.datos.clave ? "normal" : "aviso"}>
            <Texto tono="fuerte">{t(carga.datos.clave ? "cuenta.claveSi" : "cuenta.claveNo")}</Texto>
            <Texto tono="suave">{t(carga.datos.clave ? "cuenta.claveSiTexto" : "cuenta.claveNoTexto")}</Texto>
            {!carga.datos.clave && <Boton alPulsar={() => router.push("/clave")}>{t("cuenta.escribirCodigo")}</Boton>}
          </Tarjeta>
          <Tarjeta tono={carga.datos.push ? "normal" : "aviso"}>
            <Texto tono="fuerte">{t(carga.datos.push ? "cuenta.avisosSi" : "cuenta.avisosNo")}</Texto>
            <Texto tono="suave">{t("cuenta.avisosTexto")}</Texto>
            {!carga.datos.push && (
              <Boton variante="secundario" alPulsar={() => void alActivar()} ocupado={activando}>
                {t("cuenta.activarAvisos")}
              </Boton>
            )}
          </Tarjeta>
          <CodigoDeEntrada canal={carga.datos.segundoFactor} telefono={carga.datos.telefono} alCambiar={refrescar} />
        </View>
      )}
      <Apariencia />
      <Tarjeta>
        <Texto tono="fuerte">{t("cuenta.seguridad")}</Texto>
        <Boton variante="secundario" alPulsar={() => setVentana("contrasena")}>
          {t("cuenta.contrasena.cambiar")}
        </Boton>
        <Boton variante="peligro" alPulsar={() => setVentana("borrar")}>
          {t("cuenta.borrar")}
        </Boton>
      </Tarjeta>
      <CambiarContrasena abierta={ventana === "contrasena"} alCerrar={() => setVentana(null)} />
      <BorrarCuenta abierta={ventana === "borrar"} alCerrar={() => setVentana(null)} />
      <Boton variante="peligro" alPulsar={alSalir} ocupado={saliendo}>
        {t("cuenta.salir")}
      </Boton>
    </Pantalla>
  );
}
