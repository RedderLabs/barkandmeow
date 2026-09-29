import type { Metadata } from "next";
import Link from "next/link";
import styles from "./console.module.css";
import { AppHeader } from "@barkandmeow/ui-web/parts";
import { Button } from "@barkandmeow/ui-web/components/button";
import { CustodiaClave } from "@/components/Custodia";
import { apiServidor, exigirSesion, organizacion } from "@/lib/servidor";

export const metadata: Metadata = { title: "Consola · Bark & Meow" };

type Permiso = { id: string; petId: string; level: number; expiresAt: string | null };
type Borrador = { id: string; especie: string; caduca: string; reclamado: string | null };

/* Iconos dibujados, trazo 1.8, heredando currentColor. */

function IconUnlinked({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M9.5 14.5 7 17a4.2 4.2 0 0 1-6-6l2.5-2.5" />
      <path d="M14.5 9.5 17 7a4.2 4.2 0 0 1 6 6l-2.5 2.5" />
      <path d="m3 3 18 18" />
    </svg>
  );
}


const DIA = 864e5;

/** Permisos vigentes con sus días restantes y fichas preparadas sin reclamar. */
async function cargarConsola() {
  const [{ permisos }, { borradores }] = await Promise.all([
    apiServidor<{ permisos: Permiso[] }>("/grants/v1/mine"),
    apiServidor<{ borradores: Borrador[] }>("/clinics/v1/drafts"),
  ]);
  const ahora = Date.now();
  return {
    vigentes: permisos
      .filter((p) => !p.expiresAt || new Date(p.expiresAt).getTime() > ahora)
      .map((p) => ({
        ...p,
        dias: p.expiresAt ? Math.max(0, Math.ceil((new Date(p.expiresAt).getTime() - ahora) / DIA)) : null,
      })),
    preparadas: borradores.filter((b) => !b.reclamado && new Date(b.caduca).getTime() > ahora),
  };
}

export default async function Page() {
  const yo = await exigirSesion();
  const { vigentes, preparadas } = await cargarConsola();

  return (
    <div className={styles.shell}>
      <AppHeader active="consola" clinica={organizacion(yo)} />

      {/* El envío automático desde el software de gestión aún no existe:
          la tira lo dice en lugar de fingir una conexión. */}
      <div className={`${styles.link} ${styles.linkNone}`}>
        <span className={styles.linkDot}>
          <IconUnlinked />
        </span>
        <span className={styles.linkHead}>Sin software conectado</span>
        <span>Conectar el software de gestión por API todavía no está disponible.</span>
      </div>

      <div className={`${styles.counters} ${styles.counters2}`}>
        <div className={styles.counter}>
          <span className={styles.counterLabel}>Permisos vigentes</span>
          <span className={styles.counterValue}>{vigentes.length}</span>
        </div>
        <div className={styles.counter}>
          <span className={styles.counterLabel}>Fichas preparadas sin dueño</span>
          <span className={styles.counterValue}>{preparadas.length}</span>
        </div>
      </div>

      <main className={styles.grid}>
        <section className="flex flex-col gap-4">
          {!yo.clinicaActiva && (
            <div className={styles.pendingNote} role="status">
              La clínica aún no está activa: confirma el correo del administrador para
              activar mascotas e invitar al equipo. <Link href="/verificar">Confirmar el correo</Link>
            </div>
          )}

          {yo.role === "admin" && (
            <CustodiaClave
              clinicId={yo.clinicId}
              pubKeyClinica={yo.clinica.pubKey}
              claveEnvuelta={yo.claveEnvuelta}
            />
          )}

          <div className={styles.sectionHead}>
            <h1 className={styles.sectionTitle}>Registro de envíos</h1>
          </div>
          <div className={styles.empty}>
            <h2 className={styles.emptyTitle}>Todavía no has enviado nada</h2>
            <p className={styles.emptyBody}>
              El envío de informes cifrados a la ficha del dueño aún no está disponible en esta
              versión. Mientras tanto podéis activar las mascotas de vuestros pacientes: sin
              activación, un chip no responde en Bark & Meow.
            </p>
            <div className={styles.emptyActions}>
              <Button asChild>
                <Link href="/activar">Activar una mascota</Link>
              </Button>
            </div>
          </div>
        </section>

        <aside className={styles.aside}>
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>Permisos de nivel 3</h2>
            {vigentes.length === 0 ? (
              <p className={styles.panelNote}>
                Todavía ningún dueño os ha dado acceso permanente. Se concede desde su app,
                comparando con vosotros un número de seis dígitos.
              </p>
            ) : (
              <div className={styles.grantList}>
                {vigentes.map(({ dias, ...p }) => {
                  return (
                    <div key={p.id} className={styles.grant}>
                      <div>
                        {/* El servidor no sabe el nombre: está cifrado para el dueño. */}
                        <div className={styles.grantName}>Mascota</div>
                        <div className={styles.grantChip}>ID {p.petId.slice(0, 8)}</div>
                      </div>
                      {dias === null ? (
                        <span className={`${styles.tag} ${styles.tagPermanent}`}>PERMANENTE</span>
                      ) : dias <= 1 ? (
                        <span className={`${styles.tag} ${styles.tagSoon}`}>CADUCA EN {dias} DÍA</span>
                      ) : (
                        <span className={`${styles.tag} ${styles.tagOk}`}>{dias} DÍAS</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <p className={styles.panelNote}>
              El dueño puede retirar un permiso cuando quiera, y entonces dejáis de ver la
              ficha.
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}
