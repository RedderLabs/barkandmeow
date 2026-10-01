import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { Salud } from "@/components/Salud";
import { exigirSesion } from "@/lib/servidor";

export const metadata: Metadata = { title: "Ficha de salud · Mi mascota · Bark & Meow" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const yo = await exigirSesion();
  const m = yo.mascotas.find((x) => x.petId === id);
  if (!m) notFound();
  const nombre = m.perfil.nombre.trim();
  return (
    <main className={ui.reading}>
      <div className={ui.readingMain}>
        <div>
          <h1 className={ui.pageTitle}>Ficha de salud</h1>
          <p className={ui.lede}>
            Lo que un veterinario que no conoce a {nombre || "tu mascota"} necesita saber antes de
            darle nada: alergias, medicación y enfermedades.
          </p>
        </div>
        <Salud petId={m.petId} nombre={nombre} chipPista={m.chipPista} pubKey={yo.pubKey} tieneFicha={m.ficha} />
      </div>

      <aside className={`${ui.panel} ${ui.readingAside}`} aria-labelledby="quien">
        <h2 id="quien" className={ui.panelTitle}>
          Quién la ve
        </h2>
        <p className={ui.panelNote}>
          Nadie, hasta que tú la enseñes. Se guarda cifrada con tu clave: ni Bark &amp; Meow puede
          leerla.
        </p>
        <p className={ui.panelNote}>
          La enseñas de tres formas: con la placa del collar (solo el resumen de urgencia), con un
          enlace que caduca para una consulta, o dando acceso permanente a tu clínica.
        </p>
        <p className={ui.panelNote}>
          Lo que escribes aquí sale marcado como «declarado por el dueño». No pesa lo mismo que un
          informe firmado por una clínica, y el veterinario lo ve así.
        </p>
      </aside>
    </main>
  );
}
