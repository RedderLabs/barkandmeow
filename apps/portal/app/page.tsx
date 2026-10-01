import type { Metadata } from "next";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { NuevaMascota } from "@/components/Acciones";
import { Cabecera } from "@/components/Cabecera";
import { RellenoRecuperacion } from "@/components/RellenoRecuperacion";
import { TarjetaMascota } from "@/components/TarjetaMascota";
import { Placa } from "@/components/Placa";
import s from "@/components/portal.module.css";
import { exigirSesion } from "@/lib/servidor";

export const metadata: Metadata = { title: "Mis mascotas · Bark & Meow" };

export default async function Page() {
  const yo = await exigirSesion();
  const vacia = yo.mascotas.length === 0;

  return (
    <div className={ui.shell}>
      <Cabecera conSesion activo="mascotas" />
      <RellenoRecuperacion pubKey={yo.pubKey} pendiente={!yo.recuperacion} />
      <main className={ui.reading}>
        <div className={ui.readingMain}>
          <div>
            <h1 className={ui.pageTitle}>Mis mascotas</h1>
            <p className={ui.lede}>
              {vacia
                ? "Añade a tu mascota para empezar."
                : "Entra en cada una para ver su ficha de salud, su placa y lo que le falta."}
            </p>
          </div>

          {vacia ? (
            <section className={s.vacio} aria-labelledby="vacio">
              <Placa chip="" tamano={132} />
              <div className="flex flex-col gap-2">
                <h2 id="vacio" className={ui.panelTitle}>
                  Tu cuenta aún no tiene ninguna mascota
                </h2>
                <p className={s.vacioTexto}>
                  Añádela con el número de su microchip: son 15 cifras y vienen en su pasaporte. Si
                  no lo tienes a mano, tu clínica te lo lee en un momento.
                </p>
              </div>
            </section>
          ) : (
            <ul className={s.tarjetas}>
              {yo.mascotas.map((m) => (
                <li key={m.petId}>
                  <TarjetaMascota m={m} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className={`${ui.panel} ${ui.readingAside}`} aria-labelledby="nueva">
          <h2 id="nueva" className={ui.panelTitle}>
            {vacia ? "Añadir tu mascota" : "Añadir otra mascota"}
          </h2>
          <NuevaMascota />
        </aside>
      </main>
    </div>
  );
}
