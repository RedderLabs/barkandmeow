import Link from "next/link";
import ui from "./ui.module.css";

export function IconKey({ size = 18 }: { size?: number }) {
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
      <circle cx="8" cy="12" r="4" />
      <path d="M12 12h9M18 12v3.5M15.5 12v2.5" />
    </svg>
  );
}

export function IconAlert({ size = 18 }: { size?: number }) {
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

export function IconCheck({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M5 12.5 9.5 17 19 7.5" />
    </svg>
  );
}

export function IconInvite({ size = 20 }: { size?: number }) {
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
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-5.5 6.5-5.5 1.3 0 2.5.25 3.5.7" />
      <path d="M18 14v6M15 17h6" />
    </svg>
  );
}

type Surface = "consola" | "equipo";

/* Un paquete compartido no puede saber de qué clínica se trata: la recibe.
   Antes importaba los datos de demostración de apps/clinic, que era una
   dependencia al revés. */
export type Organizacion = { nombre: string; ciudad: string; pais: string };

export function AppHeader({
  active,
  clinica,
}: {
  active?: Surface;
  clinica: Organizacion;
}) {
  return (
    <header className={ui.header}>
      <div className={ui.brand}>
        <Link href="/" className={ui.wordmark}>
          Bark & Meow
        </Link>
        <span className={ui.badge}>CLÍNICA</span>
        <span className={ui.clinicName}>
          {clinica.nombre} · {clinica.ciudad}, {clinica.pais}
        </span>
      </div>
      <nav className={ui.nav}>
        <Link
          href="/"
          className={`${ui.navLink} ${active === "consola" ? ui.navLinkActive : ""}`}
        >
          Consola
        </Link>
        <Link
          href="/equipo"
          className={`${ui.navLink} ${active === "equipo" ? ui.navLinkActive : ""}`}
        >
          Equipo
        </Link>
      </nav>
    </header>
  );
}
