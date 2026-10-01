import type { Metadata } from "next";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { Cabecera } from "@/components/Cabecera";
import { Permisos } from "@/components/Permisos";
import { exigirSesion } from "@/lib/servidor";

export const metadata: Metadata = { title: "Permisos · Mi mascota · Bark & Meow" };

export default async function Page() {
  const yo = await exigirSesion();
  return (
    <div className={ui.shell}>
      <Cabecera conSesion activo="permisos" />
      <main className={ui.reading}>
        <div className={ui.readingMain}>
          <div>
            <h1 className={ui.pageTitle}>Permisos</h1>
            <p className={ui.lede}>
              Las clínicas que te han pedido acceso permanente a la ficha de tu mascota y las
              que ya lo tienen. Tú lo das y tú lo retiras.
            </p>
          </div>
          <Permisos
            pubKey={yo.pubKey}
            mascotas={yo.mascotas.map((m) => ({ petId: m.petId, nombre: m.perfil.nombre, chipPista: m.chipPista }))}
          />
        </div>

        <aside className={`${ui.panel} ${ui.readingAside}`} aria-labelledby="numero">
          <h2 id="numero" className={ui.panelTitle}>
            Compara el número antes de aprobar
          </h2>
          <p className={ui.panelNote}>
            La clínica tiene en su pantalla un número de seis cifras. Pídeles que te lo digan:
            si es el mismo que ves aquí, la petición es suya. Si no coincide, recházala.
          </p>
          <p className={ui.panelNote}>
            Retirar un permiso corta el acceso desde ese momento. Lo que la clínica ya
            descargó no vuelve.
          </p>
        </aside>
      </main>
    </div>
  );
}
