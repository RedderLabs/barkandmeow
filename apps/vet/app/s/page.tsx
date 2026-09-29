import type { Metadata } from "next";
import { Historial } from "@/components/ficha/Historial";

export const metadata: Metadata = {
  title: "Historial temporal · Bark & Meow",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/* Nivel 2: el QR temporal del dueño abre /s/<id>#<clave>. Misma solución que
   /e: una página estática para todos los id. */
export default function Page() {
  return <Historial />;
}
