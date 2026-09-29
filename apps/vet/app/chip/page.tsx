import type { Metadata } from "next";
import { ConsultaChip } from "@/components/ConsultaChip";

export const metadata: Metadata = {
  title: "Consulta por microchip · Bark & Meow",
  description:
    "Consulta veterinaria de nivel 0: comprueba si un microchip tiene ficha en Bark & Meow y avisa al dueño.",
  robots: { index: false, follow: false },
};

/* Nivel 0 del doc de arquitectura: con solo el número de chip, el veterinario
   ve «existe ficha» y puede avisar al dueño. Nunca abre la ficha. */
export default function Page() {
  return <ConsultaChip />;
}
