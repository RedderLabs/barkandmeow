import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { Cabecera } from "@/components/Cabecera";
import { Chip, Foto, Insignia } from "@/components/Identidad";
import { PestanasMascota } from "@/components/PestanasMascota";
import s from "@/components/portal.module.css";
import { exigirSesion } from "@/lib/servidor";

/* Todo lo de una mascota vive bajo su cabecera: quién es, si le falta algo y
   sus secciones. Antes cada cosa era una página suelta sin camino de vuelta. */
export default async function Layout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const yo = await exigirSesion();
  const m = yo.mascotas.find((x) => x.petId === id);
  if (!m) notFound();
  const nombre = m.perfil.nombre.trim();

  return (
    <div className={ui.shell}>
      <Cabecera conSesion activo="mascotas" />
      <div className={s.mascotaCabecera}>
        <div className={s.mascotaIdentidad}>
          <Foto m={m} />
          <div className={s.mascotaNombre}>
            {yo.mascotas.length > 1 && (
              <Link href="/" className={s.volver}>
                Mis mascotas
              </Link>
            )}
            <p className={s.nombre}>{nombre || "Sin nombre"}</p>
            <Chip m={m} />
          </div>
          <div className={s.mascotaInsignia}>
            <Insignia m={m} />
          </div>
        </div>
        <PestanasMascota petId={m.petId} nombre={nombre} />
      </div>
      {children}
    </div>
  );
}
