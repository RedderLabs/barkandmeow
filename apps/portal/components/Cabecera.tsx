import Link from "next/link";
import type { ReactNode } from "react";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { Logotipo } from "@barkandmeow/ui-web/marca";
import s from "./portal.module.css";

type Destino = "mascotas" | "bandeja" | "permisos" | "cuenta";

/* Iconos de la navegación: trazo 1.8, extremos redondos, heredan currentColor. */
const trazo = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const ICONOS: Record<Destino, ReactNode> = {
  // La placa del collar: es el objeto de todo el portal.
  mascotas: (
    <svg {...trazo}>
      <circle cx="12" cy="14" r="7" />
      <circle cx="12" cy="4.5" r="1.8" />
      <path d="M12 6.3V7M12 11.5v5M9.5 14h5" />
    </svg>
  ),
  bandeja: (
    <svg {...trazo}>
      <path d="M3.5 13.5 6 5.5h12l2.5 8v5h-17z" />
      <path d="M3.5 13.5h5l1 2.5h5l1-2.5h5" />
    </svg>
  ),
  permisos: (
    <svg {...trazo}>
      <circle cx="8" cy="12" r="4" />
      <path d="M12 12h9M18 12v3.5M15.5 12v2.5" />
    </svg>
  ),
  cuenta: (
    <svg {...trazo}>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.5 20c0-3.9 3.3-6 7.5-6s7.5 2.1 7.5 6" />
    </svg>
  ),
};

const DESTINOS: { clave: Destino; href: string; texto: string; corto: string }[] = [
  { clave: "mascotas", href: "/", texto: "Mis mascotas", corto: "Mascotas" },
  { clave: "bandeja", href: "/bandeja", texto: "Bandeja", corto: "Bandeja" },
  { clave: "permisos", href: "/permisos", texto: "Permisos", corto: "Permisos" },
  { clave: "cuenta", href: "/cuenta", texto: "Cuenta", corto: "Cuenta" },
];

/* Cabecera del portal del dueño. En un monitor, los destinos van arriba; en el
   teléfono, que es donde se usa, van en una barra inferior de cuatro pestañas,
   como en la app: al alcance del pulgar. */
export function Cabecera({ conSesion = false, activo }: { conSesion?: boolean; activo?: Destino }) {
  const enlace = (d: Destino) => (d === activo ? `${ui.navLink} ${ui.navLinkActive}` : ui.navLink);
  return (
    <>
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
          <nav className={`${ui.nav} ${s.navArriba}`} aria-label="Principal">
            {DESTINOS.map((d) => (
              <Link key={d.clave} href={d.href} className={enlace(d.clave)} aria-current={activo === d.clave ? "page" : undefined}>
                {d.texto}
              </Link>
            ))}
            {/* Un enlace normal: la salida la resuelve el servidor. */}
            <a href="/mi-mascota/salir" className={ui.navLink}>
              Salir
            </a>
          </nav>
        )}
      </header>

      {conSesion && (
        <nav className={s.navAbajo} aria-label="Principal" data-nav-movil>
          {DESTINOS.map((d) => (
            <Link
              key={d.clave}
              href={d.href}
              className={`${s.navAbajoEnlace} ${activo === d.clave ? s.navAbajoActivo : ""}`}
              aria-current={activo === d.clave ? "page" : undefined}
            >
              {ICONOS[d.clave]}
              {d.corto}
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}
