/* Avisos push.

   El servidor manda por Expo un push sin contenido («Tienes un mensaje nuevo
   en Bark & Meow») cuando llega algo a la bandeja, abren una reclamación
   sobre el chip o una clínica pide el alta de nivel 3. Lo que dice el mensaje va sellado y solo se lee al abrir la
   app: ni Expo, ni Apple, ni Google ven nada de la ficha. */

import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { IDIOMAS } from "@barkandmeow/i18n";
import { registrarDispositivo, retirarDispositivo } from "./api";
import { IDIOMA, idiomaDelSistema } from "./ajustes";
import { borrarPush, guardarPush, leerPush } from "./almacen";
import { TEXTOS } from "./textos";

export type DatosPush = { tipo?: "bandeja" | "reclamacion" | "permiso"; petId?: string };

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

/** El nombre del canal de Android en el idioma de la app. Se lee del almacén porque esto no es un componente. */
async function nombreCanal() {
  const elegido = await SecureStore.getItemAsync(IDIOMA).catch(() => null);
  const idioma = IDIOMAS.find((i) => i === elegido) ?? idiomaDelSistema();
  return TEXTOS[idioma]["entrada.canalAvisos"];
}

const idProyecto = () =>
  (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
  Constants.easConfig?.projectId;

/**
 * Pide permiso, saca el token de Expo y lo registra en el API. Devuelve por
 * qué no se pudo, o null si quedó registrado. No lanza: sin push la app
 * funciona igual, solo que hay que abrirla para ver lo nuevo.
 */
export async function activarPush(): Promise<null | "simulador" | "permiso" | "sin-proyecto" | "error"> {
  if (!Device.isDevice) return "simulador";
  const proyecto = idProyecto();
  if (!proyecto) return "sin-proyecto";
  try {
    if (Platform.OS === "android")
      await Notifications.setNotificationChannelAsync("avisos", {
        name: await nombreCanal(),
        importance: Notifications.AndroidImportance.HIGH,
      });
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== "granted") return "permiso";
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: proyecto });
    await registrarDispositivo(token);
    await guardarPush(token);
    return null;
  } catch {
    return "error";
  }
}

/** Al salir: que este móvil deje de recibir avisos de esta cuenta. */
export async function desactivarPush() {
  const token = await leerPush();
  if (!token) return;
  await retirarDispositivo(token).catch(() => {});
  await borrarPush();
}
