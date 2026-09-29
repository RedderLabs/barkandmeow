import type { Metadata } from "next";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { Alta } from "@/components/Alta";
import { Cabecera } from "@/components/Cabecera";

export const metadata: Metadata = { title: "Dar de alta a tu mascota · Bark & Meow" };

export default function Page() {
  return (
    <div className={ui.shell}>
      <Cabecera />
      <Alta />
    </div>
  );
}
