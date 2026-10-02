import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { AppHeader } from "@barkandmeow/ui-web/parts";
import { FichaPaciente } from "@/components/FichaPaciente";
import { apiServidor, exigirSesion } from "@/lib/servidor";
import { api } from "@barkandmeow/schema/api";

export const metadata: Metadata = { title: "Ficha del paciente · Bark & Meow" };

/* La ficha de salud de un paciente. Solo existe para quien tiene su nivel 3:
   si no está entre los pacientes de la clínica, la página no existe. */
export default async function Page({ params }: { params: Promise<{ petId: string }> }) {
  const { petId } = await params;
  const yo = await exigirSesion();
  const { pacientes } = await apiServidor(api.clinicas.listarPacientesConsola);
  const paciente = pacientes.find((p) => p.petId === petId);
  if (!paciente) notFound();

  return (
    <div className={ui.shell}>
      <AppHeader active="consola" admin={yo.role === "admin"} />
      <FichaPaciente
        // Otro paciente es otra ficha: nada de la anterior se queda en pantalla.
        key={petId}
        clinicId={yo.clinicId}
        pubKeyClinica={yo.clinica.pubKey}
        esAdmin={yo.role === "admin"}
        paciente={paciente}
      />
    </div>
  );
}
