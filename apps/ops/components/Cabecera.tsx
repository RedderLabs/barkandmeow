import ui from "@barkandmeow/ui-web/ui.module.css";
import { Logotipo } from "@barkandmeow/ui-web/marca";

export function Cabecera({ conSesion = false }: { conSesion?: boolean }) {
  return (
    <header className={ui.header}>
      <div className={ui.brand}>
        <Logotipo alto={40} className={ui.wordmark} />
        <span className={ui.badge}>OPERADOR</span>
      </div>
      {conSesion && (
        <nav className={ui.nav}>
          <a href="/operador/salir" className={ui.navLink}>
            Salir
          </a>
        </nav>
      )}
    </header>
  );
}
