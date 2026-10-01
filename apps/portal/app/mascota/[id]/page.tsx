import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { ResumenMascota } from "@/components/ResumenMascota";
import { exigirSesion } from "@/lib/servidor";

export const metadata: Metadata = { title: "Resumen · Mi mascota · Bark & Meow" };

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
          <h1 className={ui.pageTitle}>{nombre ? `${nombre}, de un vistazo` : "De un vistazo"}</h1>
          <p className={ui.lede}>
            Lo que ya está hecho y lo que falta, por si se pierde o le pasa algo lejos de casa.
          </p>
        </div>
        <ResumenMascota m={m} />
      </div>
    </main>
  );
}
