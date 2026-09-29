import type { Metadata } from "next";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { Cabecera } from "@/components/Cabecera";
import { Entrar } from "@/components/Entrar";

export const metadata: Metadata = { title: "Entrar · Mi mascota · Bark & Meow" };

export default function Page() {
  return (
    <div className={ui.shell}>
      <Cabecera />
      <Entrar />
    </div>
  );
}
