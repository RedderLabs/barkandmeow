import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@barkandmeow/ui-web/components/sonner";

export const metadata: Metadata = {
  title: "Mi mascota · Bark & Meow",
  description: "El portal del dueño: alta de la mascota, perfil público y reclamaciones sobre su chip.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#1D2522" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>
        {children}
        <Toaster position="bottom-center" />
      </body>
    </html>
  );
}
