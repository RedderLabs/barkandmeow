import type { Metadata } from "next";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { NuevaMascota } from "@/components/Acciones";
import { Cabecera } from "@/components/Cabecera";
import { RellenoRecuperacion } from "@/components/RellenoRecuperacion";
import { FichaMascota } from "@/components/FichaMascota";
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
              Has entrado como <span className={s.correo}>{yo.correo}</span>.
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
            yo.mascotas.map((m) => <FichaMascota key={m.petId} m={m} />)
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
