import type { ExpoConfig } from "expo/config";

/* App del dueño (decidido 2026-09-30): Expo con development build, no React
   Native bare a pelo. `expo prebuild` genera ios/ y android/ cuando hacen
   falta, y EAS compila las dos en la nube, así que se puede sacar la versión
   de iOS sin un Mac. Las carpetas nativas no se versionan: salen de aquí.

   EXPO_PUBLIC_API_URL apunta al API (en desarrollo, la IP del PC en la red
   local, p. ej. http://192.168.1.20:4601). EAS_PROJECT_ID es necesario para
   los push de Expo; sin él la app funciona, pero no pide token de push. */

const config: ExpoConfig = {
  name: "Bark & Meow",
  slug: "barkandmeow",
  scheme: "barkandmeow",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  backgroundColor: "#F4F1EA",
  ios: {
    bundleIdentifier: "app.barkandmeow",
    supportsTablet: false,
    config: { usesNonExemptEncryption: false },
  },
  android: {
    package: "app.barkandmeow",
    adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#F4F1EA" },
    // Sin copia de seguridad en la nube: la clave del dueño no sale del móvil.
    allowBackup: false,
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-font",
    ["expo-notifications", { color: "#1D6B57", icon: "./assets/notification-icon.png" }],
    [
      "expo-splash-screen",
      { image: "./assets/splash-icon.png", imageWidth: 160, backgroundColor: "#F4F1EA", dark: { backgroundColor: "#141A18" } },
    ],
  ],
  experiments: { typedRoutes: true },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "https://barkandmeow.app/api",
    ...(process.env.EAS_PROJECT_ID ? { eas: { projectId: process.env.EAS_PROJECT_ID } } : {}),
  },
};

export default config;
