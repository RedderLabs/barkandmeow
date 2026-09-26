import type { Metadata } from "next";
import ui from "../_ui/ui.module.css";
import { IconKey, IconAlert, IconCheck } from "../_ui/parts";
import { codigoRecuperacion, registroTxt } from "@/lib/demo";

export const metadata: Metadata = {
  title: "Registrar la clínica · Bark & Meow",
  description:
    "Alta de una clínica veterinaria en Bark & Meow: datos, dominio verificado y clave de la clínica.",
};

export default function Registro() {
  return (
    <div className={ui.shell}>
      <header className={ui.header}>
        <div className={ui.brand}>
          <span className={ui.wordmark}>Bark & Meow</span>
          <span className={ui.badge}>CLÍNICA</span>
        </div>
      </header>

      <main className={ui.reading}>
        <div>
          <h1 className={ui.pageTitle}>Registrar la clínica</h1>
          <p className={ui.lede}>
            Cuatro pasos. El último es el importante: la clave de la clínica es lo
            que los dueños autorizan, y sin ella no hay acceso a ninguna ficha.
          </p>
        </div>

        <section className={ui.panel}>
          <h2 className={ui.panelTitle}>La clínica</h2>
          <label className={ui.field}>
            Nombre
            <input className={ui.input} type="text" placeholder="Clínica Veterinaria…" />
          </label>
          <div className={ui.fieldRow}>
            <label className={ui.field}>
              País
              <select className={ui.select} defaultValue="PT">
                <option value="ES">España</option>
                <option value="PT">Portugal</option>
                <option value="FR">Francia</option>
              </select>
            </label>
            <label className={ui.field}>
              Número de registro sanitario
              <input className={`${ui.input} ${ui.mono}`} type="text" />
            </label>
          </div>
          <label className={ui.field}>
            Dirección
            <input className={ui.input} type="text" />
          </label>
        </section>

        <section className={ui.panel}>
          <h2 className={ui.panelTitle}>Dominio</h2>
          <p className={ui.panelNote}>
            Añade este registro TXT en el DNS de tu dominio. Es lo que convierte el
            aviso que recibe el dueño en «clínica verificada» en lugar de un nombre
            escrito a mano.
          </p>
          <label className={ui.field}>
            Dominio
            <input className={`${ui.input} ${ui.mono}`} type="text" placeholder="clinica.example" />
          </label>
          <div className={ui.copyBlock}>
            <span>{registroTxt}</span>
            <button type="button" className={ui.ghost}>
              Copiar
            </button>
          </div>
          <div className={ui.actions}>
            <button type="button" className={ui.secondary}>
              Comprobar el DNS
            </button>
            <span className={ui.hint}>Sin verificar todavía</span>
          </div>
        </section>

        <section className={ui.panel}>
          <h2 className={ui.panelTitle}>Tu cuenta de administrador</h2>
          <p className={ui.panelNote}>
            El administrador gestiona el equipo y custodia la clave de la clínica.
            Puede hacer todo lo que hace un veterinario.
          </p>
          <div className={ui.fieldRow}>
            <label className={ui.field}>
              Nombre y apellidos
              <input className={ui.input} type="text" />
            </label>
            <label className={ui.field}>
              Correo
              <input className={ui.input} type="email" />
            </label>
          </div>
        </section>

        <section className={ui.panel}>
          <h2 className={ui.panelTitle}>
            <IconKey size={20} /> La clave de la clínica
          </h2>
          <p className={ui.panelNote}>
            Se genera en este navegador y no sale de aquí. Cuando un dueño autoriza a
            tu clínica, envuelve la clave de su ficha contra esta. Ni Bark & Meow ni nadie
            más tiene una copia.
          </p>

          <p className={ui.bodyNote}>
            Por eso hace falta una copia de seguridad: si pierdes este navegador sin
            haberla guardado, <strong>se pierden todos los permisos concedidos</strong> y
            cada dueño tendría que autorizarte de nuevo, uno por uno.
          </p>

          <div className={ui.recovery}>
            {codigoRecuperacion.map((bloque, i) => (
              <span key={i} className={ui.recoveryCell}>
                {bloque}
              </span>
            ))}
          </div>

          <label className={ui.check}>
            <input type="checkbox" />
            He apuntado el código en papel y lo guardo fuera de la clínica.
          </label>

          <div className={ui.actions}>
            <button type="button" className={ui.secondary}>
              <IconCheck />
              Invitar a un segundo administrador
            </button>
            <span className={ui.hint}>Recomendado: dos personas, nunca una</span>
          </div>
        </section>

        <div className={`${ui.panel} ${ui.panelWarn}`}>
          <h2 className={ui.panelTitle}>
            <IconAlert size={20} /> Lo que esta cuenta no hace
          </h2>
          <p className={ui.panelNote}>
            Registrarte no te da acceso a ninguna ficha. La cuenta identifica a tu
            clínica; cada paciente sigue necesitando que su dueño te autorice, y puede
            retirarte cuando quiera. Es a propósito: es lo que hace que los dueños
            acepten que estés ahí.
          </p>
        </div>

        <div className={ui.actions}>
          <button type="button" className={ui.primary}>
            Crear la clínica
          </button>
          <span className={ui.hint}>
            Podrás empezar a preparar fichas antes de que el DNS verifique.
          </span>
        </div>
      </main>
    </div>
  );
}
