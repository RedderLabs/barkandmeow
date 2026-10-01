import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ui from "@barkandmeow/ui-web/ui.module.css";
import Link from "next/link";
import { CompartirHistorial } from "@/components/CompartirHistorial";
import { exigirSesion } from "@/lib/servidor";

export const metadata: Metadata = { title: "Compartir · Mi mascota · Bark & Meow" };

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
          <h1 className={ui.pageTitle}>Compartir con un veterinario</h1>
          <p className={ui.lede}>
            Para una consulta fuera de casa: un enlace que enseña el historial de{" "}
            {nombre || "tu mascota"} y caduca solo.
          </p>
        </div>
        <CompartirHistorial petId={m.petId} nombre={nombre} pubKey={yo.pubKey} telefonos={m.perfil.telefonos} />
      </div>

      <aside className={`${ui.panel} ${ui.readingAside}`} aria-labelledby="que-ve">
        <h2 id="que-ve" className={ui.panelTitle}>
          Qué ve y qué puede hacer
        </h2>
        <p className={ui.panelNote}>
          Ve la ficha de salud, las vacunas y tratamientos que constan, y las notas de consultas
          anteriores. En su idioma, sin instalar nada y sin crear una cuenta.
        </p>
        <p className={ui.panelNote}>
          Puede dejarte la nota de la visita. Te llega cifrada a la bandeja: él la escribe, pero no
          puede volver a leerla.
        </p>
        <p className={ui.panelNote}>
          Para tu clínica de siempre no hace falta esto cada vez: dale acceso permanente desde{" "}
          <Link href="/permisos">Permisos</Link>.
        </p>
      </aside>
    </main>
  );
}
