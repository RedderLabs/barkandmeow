import Link from "next/link";
import type { ReactNode } from "react";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { IconAlert, IconCheck } from "@barkandmeow/ui-web/parts";
import { Button } from "@barkandmeow/ui-web/components/button";
import { GenerarCodigo, Impugnar } from "@/components/Acciones";
import { fecha } from "@/lib/fecha";
import type { Mascota } from "@/lib/servidor";
import s from "./portal.module.css";

/* El resumen de una mascota: qué está hecho y qué falta, en dos preguntas.

   «Si se pierde»: ¿van a poder llamarte? «Si le pasa algo»: ¿va a saber un
   veterinario que no la conoce lo que no puede darle? Cada paso pendiente
   lleva su acción al lado. Lo hecho se queda a la vista, en verde; lo que
   falta, en ámbar y con texto (La Regla del Ámbar: nunca rojo). */

type Estado = "hecho" | "falta" | "aviso";

const leido: Record<Estado, string> = { hecho: "Hecho: ", falta: "Falta: ", aviso: "Atención: " };

function Fila({
  estado,
  titulo,
  children,
  accion,
  accionDebajo = false,
}: {
  estado: Estado;
  titulo: string;
  children?: ReactNode;
  accion?: ReactNode;
  /** Una acción que crece (el código de activación) va bajo el texto, a todo el ancho. */
  accionDebajo?: boolean;
}) {
  return (
    <li className={`${s.paso} ${accionDebajo ? s.pasoAmplio : ""}`}>
      <span className={`${s.pasoIcono} ${s[`paso_${estado}`]}`} aria-hidden="true">
        {estado === "hecho" ? <IconCheck size={16} /> : estado === "aviso" ? <IconAlert size={15} /> : null}
      </span>
      <div className={s.pasoTexto}>
        <span className={s.pasoTitulo}>
          <span className="sr-only">{leido[estado]}</span>
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
      <h2 className={ui.panelTitle}>Alguien ha reclamado este chip</h2>
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

export function ResumenMascota({ m }: { m: Mascota }) {
  const nombre = m.perfil.nombre.trim();
  const llamar = nombre || "tu mascota";
  const base = `/mascota/${m.petId}`;
  const tels = m.perfil.telefonos;

  const irA = (seccion: string, texto: string) => (
    <Button asChild variant="outline" size="sm">
      <Link href={`${base}/${seccion}`}>{texto}</Link>
    </Button>
  );

  return (
    <>
      <Reclamacion m={m} />

      {m.mensajes > 0 && (
        <Link href="/bandeja" className={s.aviso}>
          <span>
            <strong>
              <span className={s.dato}>{m.mensajes}</span> {m.mensajes === 1 ? "mensaje" : "mensajes"} en la bandeja
            </strong>
            <br />
            Notas de veterinarios, informes de tu clínica y avisos.
          </span>
          <span className={s.avisoIr}>Abrir</span>
        </Link>
      )}

      <section className={s.ficha} aria-labelledby="pierde">
        <h2 id="pierde" className={s.grupoTitulo}>
          Si se pierde
        </h2>
        <ul className={s.pasosLista}>
          {m.estado === "activa" ? (
            <Fila estado="hecho" titulo="Chip activado">
              {m.activada ? (
                <>
                  Una clínica lo comprobó el <span className={s.dato}>{fecha(m.activada)}</span>. Ya responde
                  al consultarlo.
                </>
              ) : (
                "Ya responde al consultarlo."
              )}
            </Fila>
          ) : m.estado === "congelada" ? (
            <Fila estado="aviso" titulo="Chip congelado">
              No responde mientras dure la reclamación.
            </Fila>
          ) : m.reclamacion?.rol === "reclamante" ? (
            <Fila estado="aviso" titulo="Chip en reclamación">
              Estaba activo a nombre de otra persona.
            </Fila>
          ) : (
            <Fila
              estado="falta"
              titulo="Chip sin activar"
              accionDebajo
              accion={<GenerarCodigo petId={m.petId} nombre={nombre} />}
            >
              Una clínica tiene que leerlo con {llamar} delante; hasta entonces no responde en Bark &amp;
              Meow. Genera el código cuando vayas a ir: el anterior, si lo había, deja de valer.
            </Fila>
          )}

          {m.perfil.publicado ? (
            <Fila estado="hecho" titulo="Perfil público publicado">
              {m.estado === "activa"
                ? "Lo ve quien escanee su placa o consulte su chip."
                : m.estado === "congelada"
                  ? "Oculto mientras dure la reclamación."
                  : "Se verá en cuanto el chip esté activo."}
            </Fila>
          ) : (
            <Fila estado="falta" titulo="Perfil sin publicar" accion={irA("perfil", "Publicar")}>
              Quien encuentre a {llamar} no verá su nombre ni tus teléfonos.
            </Fila>
          )}

          {tels.length > 0 ? (
            <Fila
              estado="hecho"
              titulo={tels.length === 1 ? "Un teléfono de contacto" : `${tels.length} teléfonos de contacto`}
            >
              <span className={s.dato}>{tels[0].numero}</span>
              {tels[0].etiqueta && ` · ${tels[0].etiqueta}`}
              {tels.length > 1 && ` y ${tels.length - 1} más`}
            </Fila>
          ) : (
            <Fila estado="falta" titulo="Sin teléfono de contacto" accion={irA("perfil", "Añadir")}>
              Es lo que permite que te llamen.
            </Fila>
          )}

          {m.perfil.foto ? (
            <Fila estado="hecho" titulo="Con foto">
              Ayuda a confirmar que es {llamar}.
            </Fila>
          ) : (
            <Fila estado="falta" titulo="Sin foto" accion={irA("perfil", "Subir")}>
              Opcional, pero una foto reciente ayuda a reconocer a {llamar}.
            </Fila>
          )}
        </ul>
      </section>

      <section className={s.ficha} aria-labelledby="urgencia">
        <h2 id="urgencia" className={s.grupoTitulo}>
          Si le pasa algo
        </h2>
        <ul className={s.pasosLista}>
          {m.ficha ? (
            <Fila estado="hecho" titulo="Ficha de salud escrita" accion={irA("salud", "Ver")}>
              Alergias, medicación y enfermedades. Tenla al día: es lo que leerá un veterinario que no
              conoce a {llamar}.
            </Fila>
          ) : (
            <Fila estado="falta" titulo="Sin ficha de salud" accion={irA("salud", "Escribirla")}>
              Si tiene alguna alergia o toma medicación, un veterinario de urgencias no lo sabrá. Son
              cinco minutos.
            </Fila>
          )}

          {m.placa ? (
            <Fila estado="hecho" titulo="Placa del collar activa" accion={irA("placa", "Ver")}>
              Quien la escanee ve el resumen de urgencia, en su idioma.
            </Fila>
          ) : (
            <Fila
              estado="falta"
              titulo="Sin placa en el collar"
              accion={irA(m.ficha ? "placa" : "salud", m.ficha ? "Prepararla" : "Primero, la ficha")}
            >
              Opcional. Un QR en el collar que abre el resumen de urgencia en cualquier móvil, sin
              aplicación y sin cuenta.
            </Fila>
          )}
        </ul>
      </section>

      <nav className={s.ficha} aria-labelledby="mas">
        <h2 id="mas" className={s.grupoTitulo}>
          Cuando lo necesites
        </h2>
        <ul className={s.enlaces}>
          <li>
            <Link href={`${base}/compartir`} className={s.enlace}>
              <span className={s.pasoTitulo}>Enseñar el historial a un veterinario</span>
              <span className={s.pasoDetalle}>Un enlace que caduca solo, para una consulta fuera de casa.</span>
            </Link>
          </li>
          <li>
            <Link href={`${base}/pasaporte`} className={s.enlace}>
              <span className={s.pasoTitulo}>Preparar un viaje</span>
              <span className={s.pasoDetalle}>Qué pide cada país y qué te falta.</span>
            </Link>
          </li>
          <li>
            <Link href="/permisos" className={s.enlace}>
              <span className={s.pasoTitulo}>Tu clínica de siempre</span>
              <span className={s.pasoDetalle}>Quién tiene acceso permanente a la ficha, y cómo retirarlo.</span>
            </Link>
          </li>
        </ul>
      </nav>
    </>
  );
}
