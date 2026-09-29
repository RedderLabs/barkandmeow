import type { Metadata } from "next";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { Aceptar } from "@/components/Aceptar";
import { CabeceraSimple } from "@/components/CabeceraSimple";

export const metadata: Metadata = {
  title: "Unirte a la clínica · Bark & Meow",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/* El token de la invitación llega en ?t= desde el enlace del correo. */
export default async function Page({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  return (
    <div className={ui.shell}>
      <CabeceraSimple />
      <Aceptar token={t ?? ""} />
    </div>
  );
}
