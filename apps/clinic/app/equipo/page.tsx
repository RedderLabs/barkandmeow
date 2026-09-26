import type { Metadata } from "next";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { AppHeader, IconInvite, IconKey, IconAlert } from "@barkandmeow/ui-web/parts";
import { clinica, equipo, rolNombre, type Rol } from "@/lib/demo";
import { BajaMiembro } from "@/components/BajaMiembro";
import { InvitarForm } from "@/components/InvitarForm";

export const metadata: Metadata = {
  title: "Equipo · Bark & Meow",
  description:
    "Altas y bajas del equipo de la clínica, y custodia de la clave de la clínica.",
};

const tagPorRol: Record<Rol, string> = {
  admin: ui.tagAdmin,
  vet: ui.tagVet,
  assistant: ui.tagAssistant,
};

const loQueHace: Record<Rol, string> = {
  admin: "Gestiona el equipo y la conexión · custodia la clave",
  vet: "Busca, carga datos y firma informes",
  assistant: "Busca y carga datos · no firma",
};

export default function Equipo() {
  const administradores = equipo.filter(
    (m) => m.rol === "admin" && m.estado === "activo",
  ).length;
  const activos = equipo.filter((m) => m.estado === "activo").length;

  return (
    <div className={ui.shell}>
      <AppHeader active="equipo" clinica={clinica} />

      <main className={ui.grid}>
        <section>
          <div className={ui.sectionHead}>
            <h1 className={ui.sectionTitle}>Equipo</h1>
            <span className={ui.sectionMeta}>
              {activos} activos · {equipo.length - activos} pendiente
            </span>
          </div>

          {administradores < 2 && (
            <div className={`${ui.panel} ${ui.panelWarn} ${ui.stacked}`}>
              <h2 className={ui.panelTitle}>
                <IconAlert size={20} /> Un solo administrador
              </h2>
              <p className={ui.panelNote}>
                La clave de la clínica vive solo en un navegador. Si se pierde ese
                equipo, se pierden los 38 permisos concedidos y cada dueño tendría
                que autorizaros otra vez, uno por uno.
              </p>
              <div className={ui.actions}>
                <button type="button" className={ui.secondary}>
                  <IconKey />
                  Generar código de recuperación
                </button>
                <button type="button" className={ui.secondary}>
                  Nombrar un segundo administrador
                </button>
              </div>
            </div>
          )}

          <div className={ui.panel}>
            <div className={ui.rowList}>
              {equipo.map((m) => (
                <div key={m.id} className={ui.row}>
                  <div>
                    <div className={ui.rowName}>{m.nombre}</div>
                    <div className={ui.rowMeta}>
                      {loQueHace[m.rol]} · desde {m.alta}
                    </div>
                  </div>
                  <div className={ui.actions}>
                    {m.estado === "pendiente" && (
                      <span className={`${ui.tag} ${ui.tagPending}`}>
                        SIN ACEPTAR
                      </span>
                    )}
                    <span className={`${ui.tag} ${tagPorRol[m.rol]}`}>
                      {rolNombre[m.rol]}
                    </span>
                    <BajaMiembro
                      nombre={m.nombre}
                      esAdministrador={m.rol === "admin"}
                    />
                  </div>
                </div>
              ))}
            </div>

            <p className={ui.panelNote}>
              Dar de baja borra la envoltura de esa persona: deja de poder pedir
              fichas nuevas al momento. Lo que ya se descargó en su navegador no
              vuelve, igual que ocurre con un acceso temporal revocado.
            </p>
          </div>
        </section>

        <aside className={ui.panel}>
          <h2 className={ui.panelTitle}>
            <IconInvite /> Invitar
          </h2>
          <InvitarForm />
        </aside>
      </main>
    </div>
  );
}
