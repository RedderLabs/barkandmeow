import ui from "@barkandmeow/ui-web/ui.module.css";
import { Logotipo } from "@barkandmeow/ui-web/marca";

/** Cabecera de las pantallas sin sesión: logotipo e insignia, nada más. */
export function CabeceraSimple() {
  return (
    <header className={ui.header}>
      <div className={ui.brand}>
        <Logotipo alto={40} className={ui.wordmark} />
        <span className={ui.badge}>CLÍNICA</span>
      </div>
    </header>
  );
}
