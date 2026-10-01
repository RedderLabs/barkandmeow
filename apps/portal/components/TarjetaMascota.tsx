import Link from "next/link";
import { Chip, Foto, Insignia } from "@/components/Identidad";
import { siguienteDe } from "@/lib/pasos";
import type { Mascota } from "@/lib/servidor";
import s from "./portal.module.css";

/* Una mascota en la lista: quién es, si le falta algo y qué toca ahora.
   Toda la tarjeta lleva a su página. */
export function TarjetaMascota({ m }: { m: Mascota }) {
  const nombre = m.perfil.nombre.trim();
  const siguiente = siguienteDe(m);
  return (
    <Link href={`/mascota/${m.petId}`} className={s.tarjeta}>
      <Foto m={m} grande />
      <span className={s.tarjetaTexto}>
        <span className={s.nombre}>{nombre || "Sin nombre"}</span>
        <Chip m={m} />
        {siguiente && <span className={s.tarjetaSiguiente}>{siguiente}</span>}
        {m.mensajes > 0 && (
          <span className={s.tarjetaSiguiente}>
            <span className={s.dato}>{m.mensajes}</span> {m.mensajes === 1 ? "mensaje" : "mensajes"} en la bandeja.
          </span>
        )}
      </span>
      <span className={s.tarjetaInsignia}>
        <Insignia m={m} />
      </span>
    </Link>
  );
}
