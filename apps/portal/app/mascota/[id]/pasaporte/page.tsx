import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { Pasaporte } from "@/components/Pasaporte";
import { exigirSesion } from "@/lib/servidor";

export const metadata: Metadata = { title: "Pasaporte de viaje · Mi mascota · Bark & Meow" };

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
          <h1 className={ui.pageTitle}>Pasaporte de viaje</h1>
          <p className={ui.lede}>
            La copia digital de su pasaporte europeo: lo que firma tu clínica, lo que apuntas tú y lo
            que falta para cada viaje. En la frontera vale el pasaporte de papel; esto te ayuda a
            llegar con todo en regla.
          </p>
        </div>
        <Pasaporte petId={m.petId} nombre={nombre} chipPista={m.chipPista} pubKey={yo.pubKey} />
      </div>
    </main>
  );
}
