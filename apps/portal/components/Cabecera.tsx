import Link from "next/link";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { Logotipo } from "@barkandmeow/ui-web/marca";

type Destino = "mascotas" | "bandeja" | "permisos" | "cuenta";

/* Cabecera del portal del dueño: logotipo, insignia y, con sesión, sus
   destinos. Nada más: el dueño viene a hacer una cosa y se va. */
export function Cabecera({ conSesion = false, activo }: { conSesion?: boolean; activo?: Destino }) {
  const enlace = (d: Destino) => (d === activo ? `${ui.navLink} ${ui.navLinkActive}` : ui.navLink);
  return (
    <header className={ui.header}>
      <div className={ui.brand}>
        {conSesion ? (
          <Link href="/" className={ui.wordmark} aria-label="Bark & Meow · Mis mascotas">
            <Logotipo alto={40} titulo="" />
          </Link>
        ) : (
          <Logotipo alto={40} className={ui.wordmark} />
        )}
        <span className={ui.badge}>MI MASCOTA</span>
      </div>
      {conSesion && (
        <nav className={ui.nav}>
          <Link href="/" className={enlace("mascotas")} aria-current={activo === "mascotas" ? "page" : undefined}>
            Mis mascotas
          </Link>
          <Link href="/bandeja" className={enlace("bandeja")} aria-current={activo === "bandeja" ? "page" : undefined}>
            Bandeja
          </Link>
          <Link href="/permisos" className={enlace("permisos")} aria-current={activo === "permisos" ? "page" : undefined}>
            Permisos
          </Link>
          <Link href="/cuenta"className={enlace("cuenta")} aria-current={activo === "cuenta" ? "page" : undefined}>
            Cuenta
          </Link>
          {/* Un enlace normal: la salida la resuelve el servidor. */}
          <a href="/mi-mascota/salir" className={ui.navLink}>
            Salir
          </a>
        </nav>
      )}
    </header>
  );
}
