import { useState } from "react";
import { router } from "expo-router";
import { Alert, View } from "react-native";
import { Boton, Cargando, Opciones, Pantalla, Tarjeta, Texto, Titulo } from "@/components/ui";
import { IDIOMAS } from "@barkandmeow/i18n";
import { useAjustes, type Letra, type PreferenciaIdioma, type Tema } from "@/lib/ajustes";
import { yo } from "@/lib/api";
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

export default function Cuenta() {
  const t = useT();
  const { salir } = useSesion();
  const { carga, refrescar } = useCarga(cargar);
  const [activando, setActivando] = useState(false);
  const [saliendo, setSaliendo] = useState(false);

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
        </View>
      )}
      <Apariencia />
      <Boton variante="peligro" alPulsar={alSalir} ocupado={saliendo}>
        {t("cuenta.salir")}
      </Boton>
    </Pantalla>
  );
}
