import type { Metadata } from "next";
import { Emergencia } from "@/components/ficha/Emergencia";

export const metadata: Metadata = {
  title: "Resumen de emergencia · Bark & Meow",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/* Nivel 1: la placa del collar abre /e/<id>#<clave>. La exportación es
   estática, así que hay una sola página para todos los id: en desarrollo la
   sirve el rewrite de next.config y en producción la regla del proxy. */
export default function Page() {
  return <Emergencia />;
}
