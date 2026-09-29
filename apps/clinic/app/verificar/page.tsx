import type { Metadata } from "next";
import { redirect } from "next/navigation";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { AppHeader } from "@barkandmeow/ui-web/parts";
import { dominioDeCorreo } from "@barkandmeow/schema/correo";
import { VerificarPendiente } from "@/components/FormularioRegistro";
import { exigirSesion, organizacion } from "@/lib/servidor";

export const metadata: Metadata = { title: "Confirmar el correo · Bark & Meow" };

/* Para quien registró la clínica y cerró la pestaña sin meter el código. */
export default async function Page() {
  const yo = await exigirSesion();
  if (yo.correoVerificado) redirect("/");
  return (
    <div className={ui.shell}>
      <AppHeader clinica={organizacion(yo)} />
      <VerificarPendiente correo={yo.correo} dominio={dominioDeCorreo(yo.correo)} />
    </div>
  );
}
