import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EditorPerfil } from "@/components/EditorPerfil";
import { exigirSesion, urlFoto } from "@/lib/servidor";

export const metadata: Metadata = { title: "Perfil público · Mi mascota · Bark & Meow" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const yo = await exigirSesion();
  const m = yo.mascotas.find((x) => x.petId === id);
  if (!m) notFound();
  const nombre = m.perfil.nombre.trim();
  return <EditorPerfil petId={m.petId} inicial={{ ...m.perfil, nombre, foto: urlFoto(m.perfil.foto) }} />;
}
