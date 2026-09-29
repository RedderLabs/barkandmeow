import Link from "next/link";
import type { ReactNode } from "react";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { IconAlert, IconCheck } from "@barkandmeow/ui-web/parts";
import { Button } from "@barkandmeow/ui-web/components/button";
import { GenerarCodigo, Impugnar } from "@/components/Acciones";
import { fecha } from "@/lib/fecha";
import { urlFoto, type Mascota } from "@/lib/servidor";
import s from "./portal.module.css";

/* La ficha de una mascota en el panel del dueño.

   El dueño entra a comprobar una cosa: si alguien encuentra a su animal, ¿le
   van a poder llamar? La ficha contesta eso arriba, en una insignia, y debajo
   enseña los pasos que lo hacen posible, cada uno con su acción al lado. Lo
   que ya está hecho se queda a la vista, en verde; lo que falta, en ámbar y
   con texto (La Regla del Ámbar: lo contrario de «listo» nunca es rojo). */

type Paso = "hecho" | "falta" | "aviso";

function Icono({ paso }: { paso: Paso }) {
  return (
    <span className={`${s.pasoIcono} ${s[`paso_${paso}`]}`} aria-hidden="true">
      {paso === "hecho" ? <IconCheck size={16} /> : paso === "aviso" ? <IconAlert size={15} /> : null}
    </span>
  );
}

const leido: Record<Paso, string> = { hecho: "Hecho: ", falta: "Falta: ", aviso: "Atención: " };

function Fila({
  paso,
  titulo,
  children,
  accion,
  accionDebajo = false,
}: {
  paso: Paso;
  titulo: string;
  children?: ReactNode;
  accion?: ReactNode;
  /** Una acción que crece (el código de activación) va bajo el texto, a todo el ancho. */
  accionDebajo?: boolean;
}) {
  return (
    <li className={`${s.paso} ${accionDebajo ? s.pasoAmplio : ""}`}>
      <Icono paso={paso} />
      <div className={s.pasoTexto}>
        <span className={s.pasoTitulo}>
          <span className="sr-only">{leido[paso]}</span>
          {titulo}
        </span>
        {children && <span className={s.pasoDetalle}>{children}</span>}
      </div>
      {accion && <div className={s.pasoAccion}>{accion}</div>}
    </li>
  );
}

/** Lo que pasa con una reclamación, dicho desde el lado de quien lo lee. */
function Reclamacion({ m }: { m: Mascota }) {
  const r = m.reclamacion;
  if (!r) return null;
  const nombre = m.perfil.nombre;
  if (r.rol === "reclamante")
    return (
      <div className={ui.pendingBlock} role="status">
        Has reclamado este chip, que estaba activo a nombre de otra persona.
        {r.estado === "abierta"
          ? ` Si no lo impugna, pasará a ti el ${fecha(r.plazo)}.`
          : " La otra persona la ha impugnado: revisaremos el caso con la documentación de las dos partes."}
      </div>
    );
  if (r.estado === "impugnada")
    return (
      <div className={ui.pendingBlock} role="status">
        Has impugnado la reclamación sobre este chip. El chip no cambiará de dueño mientras
        revisamos el caso; te escribiremos para pedirte la documentación.
      </div>
    );
  return (
    <section className={`${ui.panel} ${ui.panelWarn}`}>
      <h3 className={ui.panelTitle}>Alguien ha reclamado este chip</h3>
      <p className={ui.panelNote}>
        Una clínica ha registrado que otra persona dice ser la dueña de {nombre || "tu mascota"}{" "}
        y ha llevado un animal con este chip. Si no haces nada, el chip pasará a esa persona el{" "}
        <strong className="font-mono font-medium">{fecha(r.plazo)}</strong>. Mientras tanto, tu
        perfil público no se muestra.
      </p>
      <Impugnar reclamacionId={r.id} nombre={nombre} />
    </section>
  );
}

export function FichaMascota({ m }: { m: Mascota }) {
  const nombre = m.perfil.nombre.trim();
  const llamar = nombre || "tu mascota";
  const foto = urlFoto(m.perfil.foto);
  const editar = `/mascota/${m.petId}`;
  const tels = m.perfil.telefonos;
  const reclamada = m.estado === "congelada" || m.reclamacion?.rol === "reclamante";

  // Lo imprescindible para que quien la encuentre pueda llamar. La foto ayuda,
  // pero sin ella también te localizan: no cuenta como paso pendiente.
  const faltan = [m.estado === "activa", m.perfil.publicado, tels.length > 0].filter((x) => !x).length;

  const insignia = reclamada ? (
    <span className={`${s.estado} ${s.estadoAviso}`}>
      <IconAlert size={14} />
      En reclamación
    </span>
  ) : faltan === 0 ? (
    <span className={`${s.estado} ${s.estadoListo}`}>
      <IconCheck size={14} />
      Todo en orden
    </span>
  ) : (
    <span className={`${s.estado} ${s.estadoAviso}`}>
      <IconAlert size={14} />
      {faltan === 1 ? "Falta 1 paso" : `Faltan ${faltan} pasos`}
    </span>
  );

  // Solo lo pendiente lleva acción en su fila; cambiar lo hecho es «Editar el
  // perfil público», al pie.
  const irA = (texto: string) => (
    <Button asChild variant="outline" size="sm">
      <Link href={editar}>{texto}</Link>
    </Button>
  );

  return (
    <article className={s.ficha} aria-labelledby={`m-${m.petId}`}>
      <header className={s.fichaCabecera}>
        {foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={`${s.foto} ${s.fotoGrande}`} src={foto} alt="" width={72} height={72} />
        ) : (
          <span className={`${s.foto} ${s.fotoGrande} ${s.fotoVacia} ${s.fotoInicial}`} aria-hidden="true">
            {nombre ? nombre[0].toUpperCase() : "?"}
          </span>
        )}
        <div className={s.fichaIdentidad}>
          <h2 id={`m-${m.petId}`} className={s.nombre}>
            {nombre || "Sin nombre"}
          </h2>
          <span className={s.chip}>
            <span className="sr-only">Microchip terminado en </span>
            <span aria-hidden="true">CHIP ···· </span>
            {m.chipPista ?? "····"}
          </span>
        </div>
        <div className={s.fichaInsignia}>{insignia}</div>
      </header>

      <Reclamacion m={m} />

      <section className={s.pasos} aria-labelledby={`p-${m.petId}`}>
        <h3 id={`p-${m.petId}`} className={s.pasosEtiqueta}>
          Si se pierde
        </h3>
        <ul className={s.pasosLista}>
          {m.estado === "activa" ? (
            <Fila paso="hecho" titulo="Chip activado">
              {m.activada ? (
                <>
                  Una clínica lo comprobó el <span className={s.dato}>{fecha(m.activada)}</span>. Ya
                  responde al consultarlo.
                </>
              ) : (
                "Ya responde al consultarlo."
              )}
            </Fila>
          ) : m.estado === "congelada" ? (
            <Fila paso="aviso" titulo="Chip congelado">
              No responde mientras dure la reclamación.
            </Fila>
          ) : m.reclamacion?.rol === "reclamante" ? (
            <Fila paso="aviso" titulo="Chip en reclamación">
              Estaba activo a nombre de otra persona.
            </Fila>
          ) : (
            <Fila
              paso="falta"
              titulo="Chip sin activar"
              accionDebajo
              accion={<GenerarCodigo petId={m.petId} nombre={nombre} />}
            >
              Una clínica tiene que leerlo con {llamar} delante; hasta entonces no responde en Bark
              &amp; Meow. Genera el código cuando vayas a ir: el anterior, si lo había, deja de valer.
            </Fila>
          )}

          {m.perfil.publicado ? (
            <Fila paso="hecho" titulo="Perfil público publicado">
              {m.estado === "activa"
                ? "Lo ve quien escanee su placa o consulte su chip."
                : m.estado === "congelada"
                  ? "Oculto mientras dure la reclamación."
                  : "Se verá en cuanto el chip esté activo."}
            </Fila>
          ) : (
            <Fila paso="falta" titulo="Perfil sin publicar" accion={irA("Publicar")}>
              Quien encuentre a {llamar} no verá su nombre ni tus teléfonos.
            </Fila>
          )}

          {tels.length > 0 ? (
            <Fila
              paso="hecho"
              titulo={tels.length === 1 ? "Un teléfono de contacto" : `${tels.length} teléfonos de contacto`}
            >
              <span className={s.dato}>{tels[0].numero}</span>
              {tels[0].etiqueta && ` · ${tels[0].etiqueta}`}
              {tels.length > 1 && ` y ${tels.length - 1} más`}
            </Fila>
          ) : (
            <Fila paso="falta" titulo="Sin teléfono de contacto" accion={irA("Añadir")}>
              Es lo que permite que te llamen.
            </Fila>
          )}

          {foto ? (
            <Fila paso="hecho" titulo="Con foto">
              Ayuda a confirmar que es {llamar}.
            </Fila>
          ) : (
            <Fila paso="falta" titulo="Sin foto" accion={irA("Subir")}>
              Opcional, pero una foto reciente ayuda a reconocer a {llamar}.
            </Fila>
          )}
        </ul>
      </section>

      <footer className={s.fichaPie}>
        {m.mensajes > 0 && (
          <Button asChild variant="soft" size="md">
            <Link href="/bandeja">
              <span>
                <span className={s.dato}>{m.mensajes}</span>{" "}
                {m.mensajes === 1 ? "mensaje en la bandeja" : "mensajes en la bandeja"}
              </span>
            </Link>
          </Button>
        )}
        <Button asChild variant="outline" size="md">
          <Link href={`${editar}/pasaporte`}>Pasaporte de viaje</Link>
        </Button>
        <Button asChild variant="outline" size="md">
          <Link href={editar}>Editar el perfil público</Link>
        </Button>
      </footer>
    </article>
  );
}
