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
type Clave = { id: string; nombre: string; ultimoUso: string | null };
type Envio = { id: string; petId: string; chipPista: string | null; clave: string | null; bytes: number; fecha: string };

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

function IconLinked({ size = 18 }: { size?: number }) {
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
      <path d="M10 14a4.2 4.2 0 0 0 6 0l3.5-3.5a4.2 4.2 0 0 0-6-6L12 6" />
      <path d="M14 10a4.2 4.2 0 0 0-6 0l-3.5 3.5a4.2 4.2 0 0 0 6 6L12 18" />
    </svg>
  );
}

function IconSealed({ size = 16 }: { size?: number }) {
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
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </svg>
  );
}

const dd = (n: number) => String(n).padStart(2, "0");
const diaHora = (iso: string) => {
  const d = new Date(iso);
  return `${dd(d.getDate())}/${dd(d.getMonth() + 1)} ${dd(d.getHours())}:${dd(d.getMinutes())}`;
};
const kb = (bytes: number) => (bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`);


const DIA = 864e5;

/** Permisos vigentes con sus días restantes y fichas preparadas sin reclamar. */
async function cargarConsola() {
  const [{ permisos }, { borradores }, { claves }, { envios }] = await Promise.all([
    apiServidor<{ permisos: Permiso[] }>("/grants/v1/mine"),
    apiServidor<{ borradores: Borrador[] }>("/clinics/v1/drafts"),
    apiServidor<{ claves: Clave[] }>("/clinics/v1/api-keys"),
    apiServidor<{ envios: Envio[] }>("/clinics/v1/reports"),
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
    claves,
    envios,
  };
}

export default async function Page() {
  const yo = await exigirSesion();
  const { vigentes, preparadas, claves, envios } = await cargarConsola();
  const ultimoEnvio = envios[0]?.fecha ?? null;

  return (
    <div className={styles.shell}>
      <AppHeader active="consola" clinica={organizacion(yo)} />

      {/* Conectado quiere decir que hay alguna clave de API viva; la tira no
          promete más de lo que sabe: cuándo llegó el último envío. */}
      {claves.length > 0 ? (
        <div className={`${styles.link} ${styles.linkActive}`}>
          <span className={styles.linkDot}>
            <IconLinked />
          </span>
          <span className={styles.linkHead}>Software conectado</span>
          <span>
            {claves.length === 1 ? claves[0].nombre : `${claves.length} claves de API`}
            {ultimoEnvio ? ` · último envío ${diaHora(ultimoEnvio)}` : " · sin envíos todavía"}
          </span>
          <Link href="/conexion" className={styles.linkMeta}>
            Gestionar
          </Link>
        </div>
      ) : (
        <div className={`${styles.link} ${styles.linkNone}`}>
          <span className={styles.linkDot}>
            <IconUnlinked />
          </span>
          <span className={styles.linkHead}>Sin software conectado</span>
          <span>Conectad vuestro software de gestión para enviar los informes a los dueños.</span>
          <Link href="/conexion" className={styles.linkMeta}>
            Conectar
          </Link>
        </div>
      )}

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
            {envios.length > 0 && <span className={styles.sectionMeta}>Últimos {envios.length}</span>}
          </div>
          {envios.length === 0 ? (
            <div className={styles.empty}>
              <h2 className={styles.emptyTitle}>Todavía no habéis enviado nada</h2>
              <p className={styles.emptyBody}>
                {claves.length > 0
                  ? "Los informes que envíe vuestro software de gestión aparecerán aquí. Solo llegan a los dueños que os dieron acceso permanente."
                  : "Conectad vuestro software de gestión con una clave de API y los informes de la consulta llegarán cifrados a la bandeja del dueño. Solo a los que os dieron acceso permanente."}
              </p>
              <div className={styles.emptyActions}>
                {claves.length === 0 && (
                  <Button asChild>
                    <Link href="/conexion">Conectar el software</Link>
                  </Button>
                )}
                <Button asChild variant={claves.length === 0 ? "outline" : "default"}>
                  <Link href="/activar">Activar una mascota</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className={styles.log}>
              {envios.map((e) => (
                <div key={e.id} className={styles.row}>
                  <time className={styles.rowTime} dateTime={e.fecha}>
                    {diaHora(e.fecha)}
                  </time>
                  <div className={styles.rowBody}>
                    {/* El servidor no sabe el nombre ni lo que dice el informe. */}
                    <span className={styles.rowTitle}>
                      Informe · chip ···{e.chipPista ?? "····"}
                    </span>
                    <span className={styles.rowChip}>
                      {e.clave ?? "Clave retirada"} · {kb(e.bytes)}
                    </span>
                    <span className={styles.sealed}>
                      <span className={styles.sealedIcon}>
                        <IconSealed />
                      </span>
                      Sellado para el dueño: ni Bark & Meow ni esta consola pueden leerlo.
                    </span>
                  </div>
                  <span className={`${styles.state} ${styles.stateSealed}`}>En su bandeja</span>
                </div>
              ))}
            </div>
          )}
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
