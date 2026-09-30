import type { Metadata } from "next";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { CabeceraSimple } from "@/components/CabeceraSimple";
import { Recuperar } from "@/components/Recuperar";

export const metadata: Metadata = {
  title: "Recuperar la contraseña · Bark & Meow",
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <div className={ui.shell}>
      <CabeceraSimple />
      <Recuperar />
    </div>
  );
}
