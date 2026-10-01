"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import s from "./portal.module.css";

/* Las secciones de una mascota. En el teléfono es una fila que se desplaza:
   la sección abierta se lleva a la vista para que no quede escondida. */

const SECCIONES = [
  ["", "Resumen"],
  ["/salud", "Salud"],
  ["/placa", "Placa"],
  ["/perfil", "Perfil público"],
  ["/pasaporte", "Pasaporte"],
  ["/compartir", "Compartir"],
] as const;

export function PestanasMascota({ petId, nombre }: { petId: string; nombre: string }) {
  const ruta = usePathname();
  const base = `/mascota/${petId}`;
  const activa = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    activa.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [ruta]);

  return (
    <nav className={s.pestanas} aria-label={`Secciones de ${nombre || "tu mascota"}`}>
      {SECCIONES.map(([sufijo, texto]) => {
        const destino = base + sufijo;
        const aqui = ruta === destino;
        return (
          <Link
            key={sufijo}
            href={destino}
            ref={aqui ? activa : undefined}
            className={`${s.pestana} ${aqui ? s.pestanaActiva : ""}`}
            aria-current={aqui ? "page" : undefined}
          >
            {texto}
          </Link>
        );
      })}
    </nav>
  );
}
