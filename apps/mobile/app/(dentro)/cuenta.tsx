import { useState } from "react";
import { router } from "expo-router";
import { Alert, View } from "react-native";
import { Boton, Cargando, Pantalla, Tarjeta, Texto, Titulo } from "@/components/ui";
import { yo } from "@/lib/api";
import { leerClave, leerPush } from "@/lib/almacen";
import { rellenarRecuperacion } from "@/lib/recuperacion";
import { deBase64, iguales, publica } from "@/lib/cripto";
import { useCarga } from "@/lib/datos";
import { activarPush } from "@/lib/push";
import { useSesion } from "@/lib/sesion";
import { espacio } from "@/lib/tema";

async function cargar() {
  const [y, clave, push] = await Promise.all([yo(), leerClave(), leerPush()]);
  rellenarRecuperacion(y, clave);
  return { correo: y.correo, clave: !!clave && iguales(publica(clave), deBase64(y.pubKey)), push: !!push };
}

const motivos = {
  simulador: "Los avisos solo funcionan en un móvil de verdad, no en el simulador.",
  permiso: "Sin permiso para notificaciones. Actívalo en los ajustes del sistema.",
  "sin-proyecto": "Esta compilación no tiene configurados los avisos (falta EAS_PROJECT_ID).",
  error: "No se ha podido registrar este móvil. Vuelve a intentarlo.",
} as const;

export default function Cuenta() {
  const { salir } = useSesion();
  const { carga, refrescar } = useCarga(cargar);
  const [activando, setActivando] = useState(false);
  const [saliendo, setSaliendo] = useState(false);

  async function alActivar() {
    setActivando(true);
    const fallo = await activarPush();
    setActivando(false);
    if (fallo) Alert.alert("Avisos sin activar", motivos[fallo]);
    await refrescar();
  }

  function alSalir() {
    Alert.alert("¿Salir de la cuenta?", "Este móvil dejará de recibir avisos y olvidará tu clave. El papel la rehace.", [
      { text: "No, volver", style: "cancel" },
      {
        text: "Sí, salir",
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
      <Titulo>Cuenta</Titulo>
      {carga.estado === "cargando" && <Cargando texto="Cargando…" />}
      {carga.estado === "listo" && (
        <View style={{ gap: espacio.lg }}>
          <Tarjeta>
            <Texto tono="suave">Correo</Texto>
            <Texto tono="fuerte">{carga.datos.correo}</Texto>
          </Tarjeta>
          <Tarjeta tono={carga.datos.clave ? "normal" : "aviso"}>
            <Texto tono="fuerte">{carga.datos.clave ? "Clave guardada en este móvil" : "Este móvil no tiene tu clave"}</Texto>
            <Texto tono="suave">
              {carga.datos.clave
                ? "Tu bandeja se abre aquí. La clave vive en el llavero del sistema y no sale del móvil."
                : "Sin ella no se pueden abrir los mensajes de la bandeja."}
            </Texto>
            {!carga.datos.clave && <Boton alPulsar={() => router.push("/clave")}>Escribir el código</Boton>}
          </Tarjeta>
          <Tarjeta tono={carga.datos.push ? "normal" : "aviso"}>
            <Texto tono="fuerte">{carga.datos.push ? "Avisos activados" : "Avisos sin activar"}</Texto>
            <Texto tono="suave">
              Te avisamos cuando llega un mensaje o reclaman el chip. El aviso no dice nada del contenido: lo lees al
              abrir la app.
            </Texto>
            {!carga.datos.push && (
              <Boton variante="secundario" alPulsar={() => void alActivar()} ocupado={activando}>
                Activar avisos
              </Boton>
            )}
          </Tarjeta>
        </View>
      )}
      <Boton variante="peligro" alPulsar={alSalir} ocupado={saliendo}>
        Salir
      </Boton>
    </Pantalla>
  );
}
