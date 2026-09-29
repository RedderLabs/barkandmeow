import type { Metadata } from "next";
import { PasaporteViaje } from "@/components/ficha/PasaporteViaje";

export const metadata: Metadata = {
  title: "Pasaporte de viaje · Bark & Meow",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/* El QR de viaje del dueño abre /p/<id>#<clave>. Una página estática para
   todos los id, como /e y /s. */
export default function Page() {
  return <PasaporteViaje />;
}
