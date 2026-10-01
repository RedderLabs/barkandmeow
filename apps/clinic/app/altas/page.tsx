import type { Metadata } from "next";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { AppHeader } from "@barkandmeow/ui-web/parts";
import { AltaNivel3 } from "@/components/AltaNivel3";
import { exigirSesion, organizacion } from "@/lib/servidor";

export const metadata: Metadata = {
  title: "Alta de un paciente · Bark & Meow",
  description:
    "La clínica pide acceso permanente a la ficha y el dueño lo aprueba comparando un número de seis dígitos.",
};

export default async function Altas() {
  const yo = await exigirSesion();
  return (
    <div className={ui.shell}>
      <AppHeader active="altas" clinica={organizacion(yo)} />
      <AltaNivel3 pubKeyClinica={yo.clinica.pubKey} />
    </div>
  );
}
