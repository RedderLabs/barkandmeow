import type { Metadata } from "next";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { Cabecera } from "@/components/Cabecera";
import { Entrar } from "@/components/Entrar";

export const metadata: Metadata = { title: "Entrar · Operador · Bark & Meow" };

export default function Page() {
  return (
    <div className={ui.shell}>
      <Cabecera />
      <main className={ui.reading}>
        <div className={ui.readingMain}>
          <div>
            <h1 className={ui.pageTitle}>Panel del operador</h1>
            <p className={ui.lede}>Reclamaciones de chip que esperan una decisión a mano.</p>
          </div>
          <Entrar />
        </div>
      </main>
    </div>
  );
}
