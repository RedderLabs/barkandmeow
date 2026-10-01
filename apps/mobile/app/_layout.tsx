import { useEffect } from "react";
import { Fraunces_600SemiBold } from "@expo-google-fonts/fraunces/600SemiBold";
import { IBMPlexMono_400Regular } from "@expo-google-fonts/ibm-plex-mono/400Regular";
import { IBMPlexSans_400Regular } from "@expo-google-fonts/ibm-plex-sans/400Regular";
import { IBMPlexSans_600SemiBold } from "@expo-google-fonts/ibm-plex-sans/600SemiBold";
import { useFonts } from "expo-font";
import * as Notifications from "expo-notifications";
import { router, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ProveedorSesion, useSesion } from "@/lib/sesion";
import { fuente, useColores } from "@/lib/tema";
import type { DatosPush } from "@/lib/push";

void SplashScreen.preventAutoHideAsync();

/* Tocar un aviso push abre la bandeja (la lista de mascotas si es una
   reclamación, los permisos si una clínica pide el alta), también con la app
   cerrada. */
function useAbrirDesdeAviso() {
  const { estado } = useSesion();
  const ultima = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (estado !== "dentro" || !ultima) return;
    const datos = ultima.notification.request.content.data as DatosPush;
    router.navigate(datos?.tipo === "reclamacion" ? "/" : datos?.tipo === "permiso" ? "/permisos" : "/bandeja");
    void Notifications.clearLastNotificationResponseAsync();
  }, [estado, ultima]);
}

function Navegacion() {
  const c = useColores();
  const { estado } = useSesion();
  useAbrirDesdeAviso();
  useEffect(() => {
    if (estado !== "cargando") void SplashScreen.hideAsync();
  }, [estado]);
  if (estado === "cargando") return null;
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: c.ground },
      }}
    >
      <Stack.Protected guard={estado === "dentro"}>
        <Stack.Screen name="(dentro)" />
        <Stack.Screen name="clave" options={{ presentation: "modal" }} />
        {/* Lo de una mascota va encima de las pestañas, con su flecha de volver. */}
        {(
          [
            ["mascota/[id]/index", "Mi mascota"],
            ["mascota/[id]/salud", "Ficha de salud"],
            ["mascota/[id]/placa", "Placa del collar"],
            ["mascota/[id]/compartir", "Compartir"],
            ["mascota/[id]/perfil", "Perfil público"],
            ["mascota/[id]/pasaporte", "Pasaporte de viaje"],
          ] as const
        ).map(([name, title]) => (
          <Stack.Screen
            key={name}
            name={name}
            options={{
              headerShown: true,
              title,
              headerBackButtonDisplayMode: "minimal",
              headerStyle: { backgroundColor: c.surface },
              headerTintColor: c.accent,
              headerTitleStyle: { fontFamily: fuente.textoFuerte, fontSize: 17, color: c.ink },
              headerShadowVisible: false,
            }}
          />
        ))}
      </Stack.Protected>
      <Stack.Protected guard={estado !== "dentro"}>
        <Stack.Screen name="entrar" />
        <Stack.Screen name="codigo" />
      </Stack.Protected>
    </Stack>
  );
}

export default function Raiz() {
  const [fuentes] = useFonts({
    Fraunces_600SemiBold,
    IBMPlexSans_400Regular,
    IBMPlexSans_600SemiBold,
    IBMPlexMono_400Regular,
  });
  if (!fuentes) return null;
  return (
    <SafeAreaProvider>
      <ProveedorSesion>
        <StatusBar style="auto" />
        <Navegacion />
      </ProveedorSesion>
    </SafeAreaProvider>
  );
}
