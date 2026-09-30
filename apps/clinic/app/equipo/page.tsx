import type { Metadata } from "next";
import Link from "next/link";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { AppHeader, IconAlert, IconInvite } from "@barkandmeow/ui-web/parts";
import { BajaMiembro } from "@/components/BajaMiembro";
import { EntregarClave } from "@/components/Custodia";
import { InvitarForm } from "@/components/InvitarForm";
import { apiServidor, exigirSesion, organizacion } from "@/lib/servidor";
import { api } from "@barkandmeow/schema/api";
import type { Rol } from "@barkandmeow/schema";

export const metadata: Metadata = {
  title: "Equipo · Bark & Meow",
  description: "Altas y bajas del equipo de la clínica, y custodia de la clave de la clínica.",
};

const rolNombre: Record<Rol, string> = { admin: "ADMINISTRADOR", vet: "VETERINARIO", assistant: "AUXILIAR" };
const tagPorRol: Record<Rol, string> = { admin: ui.tagAdmin, vet: ui.tagVet, assistant: ui.tagAssistant };
const loQueHace: Record<Rol, string> = {
  admin: "Gestiona el equipo y custodia la clave",
  vet: "Busca, carga datos y firma informes",
  assistant: "Busca y carga datos · no firma",
};

const fecha = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

export default async function Equipo() {
  const yo = await exigirSesion();
  const { miembros } = await apiServidor(api.clinicas.listarMiembros);
  const esAdmin = yo.role === "admin";
  const activos = miembros.filter((m) => m.aceptado).length;
  const custodios = miembros.filter(
    (m) => m.rol === "admin" && (m.custodia === "codigo" || m.custodia === "entregada"),
  ).length;

  return (
    <div className={ui.shell}>
      <AppHeader active="equipo" clinica={organizacion(yo)} />

      <main className={ui.grid}>
        <section>
          <div className={ui.sectionHead}>
            <h1 className={ui.sectionTitle}>Equipo</h1>
            <span className={ui.sectionMeta}>
              {activos} {activos === 1 ? "activo" : "activos"}
              {miembros.length > activos && ` · ${miembros.length - activos} sin aceptar`}
            </span>
          </div>

          {!yo.clinicaActiva && (
            <div className={`${ui.pendingBlock} ${ui.stacked}`} role="status">
              La clínica aún no está activa: confirma el correo del administrador para poder
              invitar al equipo. <Link href="/verificar">Confirmar el correo</Link>
            </div>
          )}

          {custodios < 2 && (
            <div className={`${ui.panel} ${ui.panelWarn} ${ui.stacked}`}>
              <h2 className={ui.panelTitle}>
                <IconAlert size={20} /> Un solo custodio de la clave
              </h2>
              <p className={ui.panelNote}>
                La clave de la clínica solo está en el navegador de un administrador y en su
                código en papel. Si se pierden los dos, se pierden todos los permisos
                concedidos y cada dueño tendría que autorizaros otra vez, uno por uno. Invita a
                un segundo administrador y entrégale la clave.
              </p>
            </div>
          )}

          <div className={ui.panel}>
            <div className={ui.rowList}>
              {miembros.map((m) => (
                <div key={m.id} className={ui.row}>
                  <div>
                    <div className={ui.rowName}>
                      {m.nombre}
                      {m.yo && " (tú)"}
                    </div>
                    <div className={ui.rowMeta}>
                      {loQueHace[m.rol]} · {m.email} · desde {fecha(m.alta)}
                    </div>
                  </div>
                  <div className={ui.actions}>
                    {!m.aceptado && <span className={`${ui.tag} ${ui.tagPending}`}>SIN ACEPTAR</span>}
                    {m.custodia === "pendiente" && (
                      <span className={`${ui.tag} ${ui.tagPending}`}>SIN CLAVE</span>
                    )}
                    <span className={`${ui.tag} ${tagPorRol[m.rol]}`}>{rolNombre[m.rol]}</span>
                    {esAdmin && m.custodia === "pendiente" && m.devicePubKey && (
                      <EntregarClave
                        clinicId={yo.clinicId}
                        memberId={m.id}
                        nombre={m.nombre}
                        devicePubKey={m.devicePubKey}
                      />
                    )}
                    {esAdmin && !m.yo && (
                      <BajaMiembro id={m.id} nombre={m.nombre} esAdministrador={m.rol === "admin"} />
                    )}
                  </div>
                </div>
              ))}
            </div>

            <p className={ui.panelNote}>
              Dar de baja borra la envoltura de esa persona: deja de poder pedir fichas nuevas
              al momento. Lo que ya se descargó en su navegador no vuelve, igual que ocurre con
              un acceso temporal revocado.
            </p>
          </div>
        </section>

        <aside className={ui.panel} id="invitar">
          <h2 className={ui.panelTitle}>
            <IconInvite /> Invitar
          </h2>
          {esAdmin ? (
            <InvitarForm rolInicial={custodios < 2 ? "admin" : "vet"} activa={yo.clinicaActiva} />
          ) : (
            <p className={ui.panelNote}>Solo un administrador puede invitar al equipo.</p>
          )}
        </aside>
      </main>
    </div>
  );
}
