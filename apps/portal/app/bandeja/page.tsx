import type { Metadata } from "next";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { Bandeja } from "@/components/Bandeja";
import { Cabecera } from "@/components/Cabecera";
import { RellenoRecuperacion } from "@/components/RellenoRecuperacion";
import { exigirSesion } from "@/lib/servidor";

export const metadata: Metadata = { title: "Bandeja · Mi mascota · Bark & Meow" };

export default async function Page() {
  const yo = await exigirSesion();
  const nombres = Object.fromEntries(yo.mascotas.map((m) => [m.petId, m.perfil.nombre]));
  return (
    <div className={ui.shell}>
      <Cabecera conSesion activo="bandeja" />
      <RellenoRecuperacion pubKey={yo.pubKey} pendiente={!yo.recuperacion} />
      <main className={ui.reading}>
        <div className={ui.readingMain}>
          <div>
            <h1 className={ui.pageTitle}>Bandeja</h1>
            <p className={ui.lede}>
              Notas de tus consultas y avisos de clínicas. Se abren en este navegador: Bark &amp;
              Meow no puede leerlos.
            </p>
          </div>
          <Bandeja pubKey={yo.pubKey} nombres={nombres} />
        </div>
      </main>
    </div>
  );
}
