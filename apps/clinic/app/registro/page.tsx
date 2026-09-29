import type { Metadata } from "next";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { Logotipo } from "@barkandmeow/ui-web/marca";
import { FormularioRegistro } from "@/components/FormularioRegistro";

export const metadata: Metadata = {
  title: "Registrar la clínica · Bark & Meow",
  description:
    "Alta de una clínica veterinaria en Bark & Meow: datos, dominio verificado y clave de la clínica.",
};

export default function Registro() {
  return (
    <div className={ui.shell}>
      <header className={ui.header}>
        <div className={ui.brand}>
          <Logotipo alto={40} className={ui.wordmark} />
          <span className={ui.badge}>CLÍNICA</span>
        </div>
      </header>
      <FormularioRegistro />
    </div>
  );
}
