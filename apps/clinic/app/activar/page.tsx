import type { Metadata } from "next";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { AppHeader } from "@barkandmeow/ui-web/parts";
import { ActivarMascota } from "@/components/ActivarMascota";
import { exigirSesion, organizacion } from "@/lib/servidor";

export const metadata: Metadata = {
  title: "Activar una mascota · Bark & Meow",
  description:
    "La clínica lee el chip con el animal delante y activa el registro del dueño con su código.",
};

export default async function Activar() {
  const yo = await exigirSesion();
  return (
    <div className={ui.shell}>
      <AppHeader active="activar" clinica={organizacion(yo)} />
      <ActivarMascota />
    </div>
  );
}
