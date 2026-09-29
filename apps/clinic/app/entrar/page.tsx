import type { Metadata } from "next";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { CabeceraSimple } from "@/components/CabeceraSimple";
import { Entrar } from "@/components/Entrar";

export const metadata: Metadata = { title: "Entrar · Bark & Meow" };

export default function Page() {
  return (
    <div className={ui.shell}>
      <CabeceraSimple />
      <Entrar />
    </div>
  );
}
