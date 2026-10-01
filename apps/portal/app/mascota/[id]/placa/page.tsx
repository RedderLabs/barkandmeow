import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { PlacaCollar } from "@/components/PlacaCollar";
import { exigirSesion } from "@/lib/servidor";

export const metadata: Metadata = { title: "Placa del collar · Mi mascota · Bark & Meow" };

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
          <h1 className={ui.pageTitle}>Placa del collar</h1>
          <p className={ui.lede}>
            Un QR que abre el resumen de urgencia de {nombre || "tu mascota"} en cualquier móvil, en
            el idioma de quien lo lee.
          </p>
        </div>
        <PlacaCollar
          petId={m.petId}
          nombre={nombre}
          pubKey={yo.pubKey}
          telefonos={m.perfil.telefonos}
          hayPlaca={m.placa}
        />
      </div>

      <aside className={`${ui.panel} ${ui.readingAside}`} aria-labelledby="como">
        <h2 id="como" className={ui.panelTitle}>
          Cómo funciona
        </h2>
        <p className={ui.panelNote}>
          La clave para leer el resumen va dentro del propio QR. Bark &amp; Meow guarda el resumen
          cerrado y no puede abrirlo: solo lo abre quien tiene la placa delante.
        </p>
        <p className={ui.panelNote}>
          Por eso la placa enseña solo lo que hace falta en una urgencia, y no el historial entero.
          Para una consulta, usa «Compartir».
        </p>
      </aside>
    </main>
  );
}
