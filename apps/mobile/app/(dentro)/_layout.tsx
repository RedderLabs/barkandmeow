import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import type { ComponentProps } from "react";
import type { ColorValue } from "react-native";
import { useEscala } from "@/lib/ajustes";
import { fuente, useColores } from "@/lib/tema";

type Icono = ComponentProps<typeof Ionicons>["name"];

/** El icono de una pestaña: relleno en la que está abierta, de línea en las demás. */
const icono =
  (abierta: Icono, cerrada: Icono) =>
  ({ focused, color, size }: { focused: boolean; color: ColorValue; size: number }) => (
    <Ionicons name={focused ? abierta : cerrada} color={color} size={size} />
  );

export default function Dentro() {
  const c = useColores();
  const k = useEscala();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.line, minHeight: 64 },
        tabBarLabelStyle: { fontFamily: fuente.textoFuerte, fontSize: 12 * k },
        sceneStyle: { backgroundColor: c.ground },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Mis mascotas", tabBarIcon: icono("paw", "paw-outline") }} />
      <Tabs.Screen name="bandeja" options={{ title: "Bandeja", tabBarIcon: icono("mail", "mail-outline") }} />
      <Tabs.Screen name="permisos" options={{ title: "Permisos", tabBarIcon: icono("key", "key-outline") }} />
      <Tabs.Screen name="cuenta" options={{ title: "Cuenta", tabBarIcon: icono("person-circle", "person-circle-outline") }} />
    </Tabs>
  );
}
