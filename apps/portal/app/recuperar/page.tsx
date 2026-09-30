import type { Metadata } from "next";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { Cabecera } from "@/components/Cabecera";
import { RecuperarCuenta } from "@/components/RecuperarCuenta";

export const metadata: Metadata = { title: "Recuperar la contraseña · Mi mascota · Bark & Meow" };

export default function Page() {
  return (
    <div className={ui.shell}>
      <Cabecera />
      <RecuperarCuenta />
    </div>
  );
}
