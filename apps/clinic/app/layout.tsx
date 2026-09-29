import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@barkandmeow/ui-web/components/sonner";

export const metadata: Metadata = {
  title: "Consola de conexión · Bark & Meow",
  description:
    "Estado del enlace entre el software de la clínica y las fichas de salud de Bark & Meow.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>
        {children}
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
