import styles from "./console.module.css";
import { AppHeader } from "@barkandmeow/ui-web/parts";
import {
  clinica,
  conexionActiva,
  conexionNinguna,
  contadores,
  envios,
  permisos,
  type Envio,
} from "@/lib/demo";

/* Iconos dibujados, trazo 1.8, heredando currentColor. */

function IconLink({ size = 18 }: { size?: number }) {
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
      <path d="M10 13a5 5 0 0 0 7.5.5l2-2A5 5 0 0 0 12.5 4.5l-1 1" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-2 2A5 5 0 0 0 11.5 19.5l1-1" />
    </svg>
  );
}

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

function IconSeal({ size = 16 }: { size?: number }) {
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
      <circle cx="12" cy="9.5" r="5.5" />
      <path d="M12 7.5v4M10.5 9.5h3" />
      <path d="M8.5 14.5 7 21l5-2 5 2-1.5-6.5" />
    </svg>
  );
}

function IconAlert({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 3 21.5 20h-19z" />
      <path d="M12 10v4M12 17.5v.5" />
    </svg>
  );
}

function IconSend({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 3 10.5 13.5" />
      <path d="M21 3l-6.5 18-4-8-8-4z" />
    </svg>
  );
}

function FilaEnvio({ envio }: { envio: Envio }) {
  const fallido = envio.estado === "fallido";

  return (
    <li className={`${styles.row} ${fallido ? styles.rowFailed : ""}`}>
      <span className={styles.rowTime}>{envio.hora}</span>

      <div className={styles.rowBody}>
        <span className={styles.rowTitle}>
          {envio.tipo} · {envio.paciente}
        </span>
        <span className={styles.rowChip}>CHIP {envio.chip}</span>

        {envio.estado === "sellado" && (
          <p className={styles.sealed}>
            <span className={styles.sealedIcon}>
              <IconSeal />
            </span>
            Sellado para el dueño · sin vista previa
          </p>
        )}

        {fallido && (
          <>
            <p className={styles.reason}>{envio.motivo}</p>
            <p className={styles.recovery}>{envio.recuperacion}</p>
            <button type="button" className={styles.retry}>
              Pedir permiso al dueño
            </button>
          </>
        )}
      </div>

      {envio.estado === "sellado" && (
        <span className={`${styles.state} ${styles.stateSealed}`}>Entregado</span>
      )}
      {envio.estado === "en-cola" && (
        <span className={`${styles.state} ${styles.stateQueued}`}>
          Cifrando
          <span className={styles.pending} aria-hidden="true" />
        </span>
      )}
      {fallido && (
        <span className={`${styles.state} ${styles.stateFailed}`}>
          <IconAlert />
          No entregado
        </span>
      )}
    </li>
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ conexion?: string }>;
}) {
  const { conexion: param } = await searchParams;
  const sinConexion = param === "ninguna";
  const conexion = sinConexion ? conexionNinguna : conexionActiva;

  return (
    <div className={styles.shell}>
      <AppHeader active="consola" clinica={clinica} />

      <div
        className={`${styles.link} ${
          sinConexion ? styles.linkNone : styles.linkActive
        }`}
      >
        <span className={styles.linkDot}>
          {sinConexion ? <IconUnlinked /> : <IconLink />}
        </span>
        <span className={styles.linkHead}>
          {sinConexion
            ? "Sin software conectado"
            : `${conexion.software} ${conexion.version} conectado`}
        </span>
        <span>{conexion.detalle}</span>
        {!sinConexion && (
          <span className={styles.linkMeta}>
            Última sincronización {conexion.ultimaSync}
          </span>
        )}
      </div>

      {!sinConexion && (
        <div className={styles.counters}>
          {contadores.map((c) => (
            <div key={c.etiqueta} className={styles.counter}>
              <span className={styles.counterLabel}>{c.etiqueta}</span>
              <span className={styles.counterValue}>{c.valor}</span>
            </div>
          ))}
        </div>
      )}

      <main className={styles.grid}>
        <section>
          <div className={styles.sectionHead}>
            <h1 className={styles.sectionTitle}>Registro de envíos</h1>
            {!sinConexion && (
              <span className={styles.sectionMeta}>Hoy · {envios.length} envíos</span>
            )}
          </div>

          {sinConexion ? (
            <div className={styles.empty}>
              <h2 className={styles.emptyTitle}>Todavía no has enviado nada</h2>
              <p className={styles.emptyBody}>
                Puedes trabajar sin conectar tu software: escribe el informe aquí y
                sale cifrado a la ficha del dueño, igual que si viniera del programa
                de gestión. Conectarlo solo evita el paso de escribirlo dos veces.
              </p>
              <div className={styles.emptyActions}>
                <button type="button" className={styles.primary}>
                  <IconSend />
                  Escribir un informe
                </button>
                <button type="button" className={styles.secondary}>
                  Conectar mi software
                </button>
              </div>
            </div>
          ) : (
            <ul className={styles.log}>
              {envios.map((e) => (
                <FilaEnvio key={e.id} envio={e} />
              ))}
            </ul>
          )}
        </section>

        <aside className={styles.aside}>
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>Permisos de nivel 3</h2>
            <div className={styles.grantList}>
              {permisos.map((p) => (
                <div key={p.id} className={styles.grant}>
                  <div>
                    <div className={styles.grantName}>{p.paciente}</div>
                    <div className={styles.grantChip}>CHIP {p.chip}</div>
                  </div>
                  {p.diasRestantes === null ? (
                    <span className={`${styles.tag} ${styles.tagPermanent}`}>
                      PERMANENTE
                    </span>
                  ) : p.diasRestantes <= 1 ? (
                    <span className={`${styles.tag} ${styles.tagSoon}`}>
                      CADUCA EN {p.diasRestantes} DÍA
                    </span>
                  ) : (
                    <span className={`${styles.tag} ${styles.tagOk}`}>
                      {p.diasRestantes} DÍAS
                    </span>
                  )}
                </div>
              ))}
            </div>
            <p className={styles.panelNote}>
              Un permiso caducado convierte cualquier envío en un error. El dueño
              puede retirarlo cuando quiera, y entonces dejas de ver la ficha.
            </p>
          </div>

          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>Enviar informe</h2>
            <p className={styles.panelNote}>
              Se cifra en este navegador contra la clave del dueño. Ni Bark & Meow ni la
              clínica pueden volver a abrirlo: el dueño decide si lo añade a la
              ficha.
            </p>
            <button type="button" className={styles.primary}>
              <IconSend />
              Escribir un informe
            </button>
          </div>
        </aside>
      </main>
    </div>
  );
}
