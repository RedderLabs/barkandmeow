import type { Metadata } from "next";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { Button } from "@barkandmeow/ui-web/components/button";
import { Cabecera } from "@/components/Cabecera";
import { SegundoFactor } from "@/components/Cuenta";
import { BorrarCuenta, CambiarContrasena } from "@/components/Seguridad";
import s from "@/components/portal.module.css";
import { exigirSesion } from "@/lib/servidor";

export const metadata: Metadata = { title: "Cuenta · Mi mascota · Bark & Meow" };

export default async function Page() {
  const yo = await exigirSesion();
  return (
    <div className={ui.shell}>
      <Cabecera conSesion activo="cuenta" />
      <main className={ui.reading}>
        <div className={ui.readingMain}>
          <div>
            <h1 className={ui.pageTitle}>Cuenta</h1>
            <p className={ui.lede}>
              Has entrado como <span className={s.correo}>{yo.correo}</span>.
            </p>
          </div>
          <section className={ui.panel} aria-labelledby="codigo-entrada">
            <h2 id="codigo-entrada" className={ui.panelTitle}>
              Código de entrada
            </h2>
            <SegundoFactor canal={yo.segundoFactor} telefono={yo.telefono} />
          </section>
          <section className={ui.panel} aria-labelledby="contrasena">
            <h2 id="contrasena" className={ui.panelTitle}>
              Cambiar la contraseña
            </h2>
            <CambiarContrasena />
          </section>
          <section className={ui.panel} aria-labelledby="salir">
            <h2 id="salir" className={ui.panelTitle}>
              Cerrar la sesión
            </h2>
            <p className={ui.panelNote}>
              En un ordenador que no es tuyo, sal al terminar. Tu clave se queda guardada en este
              navegador; para quitarla también, borra los datos del sitio.
            </p>
            <Button asChild variant="outline" size="md" className="self-start">
              {/* Un enlace normal: la salida la resuelve el servidor. */}
              <a href="/mi-mascota/salir">Salir</a>
            </Button>
          </section>
          <section className={ui.panel} id="borrar-cuenta" aria-labelledby="borrar">
            <h2 id="borrar" className={ui.panelTitle}>
              Borrar la cuenta
            </h2>
            <BorrarCuenta />
          </section>
        </div>
      </main>
    </div>
  );
}
