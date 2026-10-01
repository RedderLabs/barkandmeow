import { IconAlert, IconCheck } from "@barkandmeow/ui-web/parts";
import { enReclamacion, faltanDe } from "@/lib/pasos";
import { urlFoto, type Mascota } from "@/lib/servidor";
import s from "./portal.module.css";

/* Quién es: la foto (o su inicial), el nombre, el final del chip y, de un
   vistazo, si le falta algo. Lo comparten la lista de mascotas y la cabecera
   de cada una. */

export function Foto({ m, grande = false }: { m: Mascota; grande?: boolean }) {
  const foto = urlFoto(m.perfil.foto);
  const nombre = m.perfil.nombre.trim();
  const lado = grande ? 72 : 52;
  const clase = `${s.foto} ${grande ? s.fotoGrande : s.fotoMedia}`;
  return foto ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={clase} src={foto} alt="" width={lado} height={lado} />
  ) : (
    <span className={`${clase} ${s.fotoVacia} ${s.fotoInicial}`} aria-hidden="true">
      {nombre ? nombre[0].toUpperCase() : "?"}
    </span>
  );
}

export function Chip({ m }: { m: Mascota }) {
  return (
    <span className={s.chip}>
      <span className="sr-only">Microchip terminado en </span>
      <span aria-hidden="true">CHIP ···· </span>
      {m.chipPista ?? "····"}
    </span>
  );
}

/** La Regla del Ámbar: lo contrario de «todo en orden» nunca es rojo. */
export function Insignia({ m }: { m: Mascota }) {
  const faltan = faltanDe(m);
  if (enReclamacion(m))
    return (
      <span className={`${s.estado} ${s.estadoAviso}`}>
        <IconAlert size={14} />
        En reclamación
      </span>
    );
  if (faltan === 0)
    return (
      <span className={`${s.estado} ${s.estadoListo}`}>
        <IconCheck size={14} />
        Todo en orden
      </span>
    );
  return (
    <span className={`${s.estado} ${s.estadoAviso}`}>
      <IconAlert size={14} />
      {faltan === 1 ? "Falta 1 paso" : `Faltan ${faltan} pasos`}
    </span>
  );
}
