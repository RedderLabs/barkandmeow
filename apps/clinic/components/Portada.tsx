"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, type ReactNode } from "react";
import s from "@/app/console.module.css";
import { IconLinked, IconSealed, IconUnlinked } from "@/components/iconos";
import { Mostrador } from "@/components/Mostrador";
import { Pacientes } from "@/components/Pacientes";
import type { Envio, PacienteConsola } from "@/lib/api";
import { diaHora } from "@/lib/chip";
import { useEtiquetas } from "@/lib/etiquetas";

/* La portada de la consola: el mostrador arriba, los pacientes debajo y, a un
   lado, lo que el software de gestión ha ido enviando. Los nombres de los
   pacientes se abren aquí, en el navegador: el servidor no los conoce. */

/** Cuántos envíos enseña la columna: el registro entero está en Conexión. */
const ENVIOS_VISIBLES = 6;

export function Portada({
  clinicId,
  pubKeyClinica,
  esAdmin,
  activa,
  pacientes,
  envios,
  conexion,
  avisos,
}: {
  clinicId: string;
  pubKeyClinica: string;
  /** Un administrador con la clave reparte la de los nombres al resto del equipo, y es quien conecta el software. */
  esAdmin: boolean;
  activa: boolean;
  pacientes: PacienteConsola[];
  envios: Envio[];
  /** Las claves de API vivas: con alguna, el software está conectado. */
  conexion: { claves: number; nombre: string | null };
  /** Avisos que van antes que nada: correo sin confirmar, clave que falta. */
  avisos?: ReactNode;
}) {
  const router = useRouter();
  const etiquetas = useEtiquetas(clinicId, pubKeyClinica, esAdmin);
  /* Lo que se acaba de escribir se ve al momento, sin esperar a que el
     servidor devuelva la lista: null es «se ha quitado». */
  const [propias, setPropias] = useState<Record<string, string | null>>({});
  const [destacado, setDestacado] = useState<string | null>(null);

  const nombreDe = useCallback(
    (p: PacienteConsola) => (p.petId in propias ? propias[p.petId] : etiquetas.abrir(p.petId, p.etiqueta)),
    [propias, etiquetas],
  );
  const nombrePorId = useCallback(
    (petId: string) => {
      if (petId in propias) return propias[petId];
      const p = pacientes.find((x) => x.petId === petId);
      return p ? etiquetas.abrir(petId, p.etiqueta) : null;
    },
    [propias, pacientes, etiquetas],
  );
  const onNombre = useCallback(
    (petId: string, texto: string | null) => {
      setPropias((a) => ({ ...a, [petId]: texto }));
      router.refresh();
    },
    [router],
  );

  return (
    <main className={s.portada}>
      <div className={s.principal}>
        {avisos}
        <Mostrador
          pubKeyClinica={pubKeyClinica}
          activa={activa}
          etiquetas={etiquetas}
          nombreDe={nombrePorId}
          onPaciente={setDestacado}
          onNombre={onNombre}
        />
        <Pacientes
          esAdmin={esAdmin}
          pacientes={pacientes}
          etiquetas={etiquetas}
          nombreDe={nombreDe}
          onNombre={onNombre}
          destacado={destacado}
        />
      </div>

      <aside className={s.lateral} aria-label="Software de gestión">
        <div className={s.lateralCabecera}>
          <h2 className={s.titulo}>Software de gestión</h2>
          {/* Vincular el software es cosa del administrador: al resto no se le ofrece. */}
          {esAdmin && (
            <Link href="/conexion" className={s.enlace}>
              {conexion.claves > 0 ? "Gestionar" : "Conectar"}
            </Link>
          )}
        </div>

        {conexion.claves > 0 ? (
          <p className={`${s.estado} ${s.estadoConectado}`}>
            <IconLinked />
            <span>
              <strong>Conectado</strong>
              {conexion.claves === 1 && conexion.nombre ? ` · ${conexion.nombre}` : ` · ${conexion.claves} claves de API`}
            </span>
          </p>
        ) : (
          <p className={`${s.estado} ${s.estadoSinConectar}`}>
            <IconUnlinked />
            <span>
              <strong>Sin conectar</strong> · los informes de la consulta no salen solos
            </span>
          </p>
        )}

        {envios.length === 0 ? (
          <p className={s.lateralNota}>
            {conexion.claves > 0
              ? "Todavía no ha enviado nada. Los informes solo llegan a los dueños de vuestros pacientes."
              : esAdmin
                ? "Con una clave de API, vuestro software de gestión envía los informes de la consulta a la bandeja del dueño, cifrados para él."
                : "Cuando un administrador lo conecte, los informes de la consulta llegarán solos a la bandeja del dueño, cifrados para él."}
          </p>
        ) : (
          <>
            <ul className={s.envios}>
              {envios.slice(0, ENVIOS_VISIBLES).map((e) => {
                const p = pacientes.find((x) => x.petId === e.petId);
                const nombre = p ? nombreDe(p) : null;
                return (
                  <li key={e.id} className={s.envio}>
                    <time className={s.envioHora} dateTime={e.fecha}>
                      {diaHora(e.fecha)}
                    </time>
                    <span className={s.envioQuien}>
                      {nombre ?? "Informe"}
                      <span className={s.envioChip}>chip ···{e.chipPista ?? "····"}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
            {/* El momento de esta pantalla: lo enviado queda sellado y sin vista previa. */}
            <p className={s.sellado}>
              <span className={s.selladoIcono}>
                <IconSealed />
              </span>
              Lo enviado va sellado para el dueño: ni Bark & Meow ni esta consola pueden leerlo.
            </p>
            {envios.length > ENVIOS_VISIBLES && (
              <p className={s.lateralNota}>
                Son los {ENVIOS_VISIBLES} últimos. <Link href="/conexion#envios">Ver el registro de envíos</Link>
              </p>
            )}
          </>
        )}
      </aside>
    </main>
  );
}
