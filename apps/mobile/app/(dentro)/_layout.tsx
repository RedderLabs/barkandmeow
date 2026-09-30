import { Tabs } from "expo-router";
import { fuente, useColores } from "@/lib/tema";

export default function Dentro() {
  const c = useColores();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.line, minHeight: 56 },
        tabBarLabelStyle: { fontFamily: fuente.textoFuerte, fontSize: 13 },
        tabBarIconStyle: { display: "none" },
        sceneStyle: { backgroundColor: c.ground },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Mis mascotas" }} />
      <Tabs.Screen name="bandeja" options={{ title: "Bandeja" }} />
      <Tabs.Screen name="cuenta" options={{ title: "Cuenta" }} />
    </Tabs>
  );
}
