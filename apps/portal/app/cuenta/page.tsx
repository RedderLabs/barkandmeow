import type { Metadata } from "next";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { Cabecera } from "@/components/Cabecera";
import { SegundoFactor } from "@/components/Cuenta";
import s from "@/components/portal.module.css";
import { exigirSesion } from "@/lib/servidor";

export const metadata: Metadata = { title: "Cuenta · Mi mascota · Bark & Meow" };

export default async function Page() {
  const yo = await exigirSesion();
  return (
    <div className={ui.shell}>
      <Cabecera conSesion activo="cuenta" />
      <main className={ui.reading}>
        <div className={ui.readingMain}>
          <div>
            <h1 className={ui.pageTitle}>Cuenta</h1>
            <p className={ui.lede}>
              Has entrado como <span className={s.correo}>{yo.correo}</span>.
            </p>
          </div>
          <section className={ui.panel} aria-labelledby="codigo-entrada">
            <h2 id="codigo-entrada" className={ui.panelTitle}>
              Código de entrada
            </h2>
            <SegundoFactor canal={yo.segundoFactor} telefono={yo.telefono} />
          </section>
        </div>
      </main>
    </div>
  );
}
