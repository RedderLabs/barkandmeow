"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ad, deBase64 } from "@barkandmeow/crypto";
import {
  buscarEspecie,
  edadTexto,
  fichaDueno,
  terminoCronica,
  terminoReaccion,
  type FichaDueno,
  type Gravedad,
} from "@barkandmeow/schema";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { IconAlert, IconKey } from "@barkandmeow/ui-web/parts";
import s from "@/app/console.module.css";
import { IconSealed } from "@/components/iconos";
import { ErrorApi, leerFichaPaciente, type PacienteConsola } from "@/lib/api";
import { dia } from "@/lib/chip";
import { leerClaves } from "@/lib/claves";
import { CLAVE_LISTA, cripto, igual } from "@/lib/cripto";
import { useEtiquetas } from "@/lib/etiquetas";

/* La ficha de salud de un paciente, para la clínica que tiene su nivel 3.

   Llega cifrada con la clave de la mascota, y esa clave llega sellada por el
   dueño para la clave pública de la clínica. Las dos se abren aquí, en el
   navegador: hace falta la clave de la clínica, que custodian sus
   administradores. La escribe el dueño, así que todo va marcado como
   declarado por él: no es un informe firmado. */

type Estado =
  | { tipo: "mirando" }
  | { tipo: "sin-clave" }
  | { tipo: "retirado" }
  | { tipo: "red" }
  /** El dueño aún no la ha escrito. */
  | { tipo: "vacia" }
  /** El permiso es de antes de las claves por mascota, o la clave no es de esta ficha. */
  | { tipo: "no-abre" }
  | { tipo: "lista"; ficha: FichaDueno };

const GRAVEDAD: Record<Gravedad, string> = { alta: "gravedad alta", media: "gravedad media", baja: "gravedad baja" };

const cada = (h: number) =>
  h === 24 ? "una vez al día" : h === 168 ? "una vez a la semana" : h === 720 ? "una vez al mes" : h === 48 ? "cada 2 días" : `cada ${h} h`;

export function FichaPaciente({
  clinicId,
  pubKeyClinica,
  esAdmin,
  paciente,
}: {
  clinicId: string;
  pubKeyClinica: string;
  esAdmin: boolean;
  paciente: PacienteConsola;
}) {
  const [estado, setEstado] = useState<Estado>({ tipo: "mirando" });
  const etiquetas = useEtiquetas(clinicId, pubKeyClinica, esAdmin);
  const nombre = etiquetas.abrir(paciente.petId, paciente.etiqueta);

  useEffect(() => {
    let vivo = true;
    const abrir = async () => {
      try {
        const c = await cripto();
        const local = await leerClaves(clinicId).catch(() => null);
        const secreta = local?.clinica && igual(c.publica(local.clinica), deBase64(pubKeyClinica)) ? local.clinica : null;
        if (!secreta) return vivo && setEstado({ tipo: "sin-clave" });

        const r = await leerFichaPaciente(paciente.petId);
        if (!vivo) return;
        if (!r.sobre) return setEstado({ tipo: "vacia" });
        const envuelta = r.claveEnvuelta ? deBase64(r.claveEnvuelta) : null;
        const sobre = deBase64(r.sobre);
        if (!envuelta || !sobre) return setEstado({ tipo: "no-abre" });
        try {
          const k = c.abrirSellado(secreta, envuelta);
          const claro = c.abrir(k, ad.ficha(paciente.petId), sobre);
          setEstado({ tipo: "lista", ficha: fichaDueno.parse(JSON.parse(new TextDecoder().decode(claro))) });
        } catch {
          setEstado({ tipo: "no-abre" });
        }
      } catch (e) {
        if (!vivo) return;
        setEstado({ tipo: e instanceof ErrorApi && e.estado === 404 ? "retirado" : "red" });
      }
    };
    void abrir();
    // Si la clave llega mientras la página está abierta (código en papel), se vuelve a intentar.
    window.addEventListener(CLAVE_LISTA, abrir);
    return () => {
      vivo = false;
      window.removeEventListener(CLAVE_LISTA, abrir);
    };
  }, [clinicId, pubKeyClinica, paciente.petId]);

  const f = estado.tipo === "lista" ? estado.ficha : null;
  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <main className={ui.reading}>
      <div className={ui.readingMain}>
        <div className={s.pacienteCabecera}>
          <Link href="/" className={s.enlace}>
            ‹ Pacientes
          </Link>
          <h1 className={ui.pageTitle}>{nombre ?? "Paciente sin nombre"}</h1>
          <p className={s.pacienteMeta}>
            <span>chip ···{paciente.chipPista ?? "····"}</span>
            <span>alta {dia(paciente.desde)}</span>
            {f?.chip && <span>chip completo {f.chip}</span>}
          </p>
        </div>

        {estado.tipo === "mirando" && (
          <p className={ui.panelNote} role="status">
            Abriendo la ficha…
          </p>
        )}

        {estado.tipo === "sin-clave" && (
          <section className={`${ui.panel} ${ui.panelWarn}`}>
            <h2 className={ui.panelTitle}>
              <IconKey size={20} /> Este navegador no puede abrir la ficha
            </h2>
            <p className={ui.panelNote}>
              La ficha llega cerrada para la clave de la clínica, que custodian sus administradores.{" "}
              {esAdmin ? (
                <>
                  Recupérala en la <Link href="/">portada</Link> con el código en papel y vuelve aquí.
                </>
              ) : (
                "Pide a un administrador que la abra desde su ordenador."
              )}
            </p>
          </section>
        )}

        {estado.tipo === "retirado" && (
          <div className={ui.pendingBlock} role="status">
            Ya no es paciente de la clínica: su dueño ha retirado el acceso. <Link href="/">Volver a los pacientes</Link>
          </div>
        )}

        {estado.tipo === "red" && (
          <div className={ui.alertBlock} role="alert">
            <strong>No se ha podido cargar la ficha.</strong>
            Comprueba la conexión y vuelve a cargar la página.
          </div>
        )}

        {estado.tipo === "vacia" && (
          <section className={ui.panel}>
            <h2 className={ui.panelTitle}>Su dueño aún no ha escrito la ficha</h2>
            <p className={ui.bodyNote}>
              Tenéis el acceso, pero todavía no hay nada que leer. La ficha la escribe el dueño en su app o en
              barkandmeow.app/mi-mascota: alergias, medicación y enfermedades. En cuanto la guarde, aparece aquí.
            </p>
          </section>
        )}

        {estado.tipo === "no-abre" && (
          <section className={`${ui.panel} ${ui.panelWarn}`}>
            <h2 className={ui.panelTitle}>
              <IconAlert size={20} /> La ficha no se abre con vuestro permiso
            </h2>
            <p className={ui.panelNote}>
              El permiso de este paciente es anterior a las fichas de salud y no lleva su clave. Que el dueño os lo
              retire y os lo vuelva a dar: leéis su chip en la portada, pedís el alta y él la aprueba.
            </p>
          </section>
        )}

        {f && (
          <>
            {f.alergias.length > 0 && (
              <section className={s.alergiasAlto} aria-labelledby="alergias">
                <h2 id="alergias" className={s.alergiasAltoTitulo}>
                  <IconAlert size={18} /> Alergias
                </h2>
                <ul className={s.alergiasAltoLista}>
                  {[...f.alergias]
                    .sort((a, b) => "alta media baja".indexOf(a.gravedad) - "alta media baja".indexOf(b.gravedad))
                    .map((a) => (
                      <li key={a.id}>
                        <span className={s.alergiasAltoSustancia}>{a.sustancia}</span>
                        <span>
                          {terminoReaccion(a).es} · {GRAVEDAD[a.gravedad]}
                        </span>
                      </li>
                    ))}
                </ul>
              </section>
            )}

            <section className={ui.panel} aria-labelledby="salud">
              <h2 id="salud" className={ui.panelTitle}>
                Salud
              </h2>
              <dl className={s.fichaDatos}>
                {f.alergias.length === 0 && (
                  <div>
                    <dt>Alergias</dt>
                    <dd>Ninguna registrada</dd>
                  </div>
                )}
                <div>
                  <dt>Medicación actual</dt>
                  <dd>
                    {f.medicacion.length === 0
                      ? "Ninguna"
                      : f.medicacion.map((m) => (
                          <span key={m.id} className={s.fichaLinea}>
                            {m.principio}
                            <span className={s.fichaMono}>
                              {" "}
                              {[m.dosis, cada(m.cadaHoras)].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                        ))}
                  </dd>
                </div>
                <div>
                  <dt>Enfermedades crónicas</dt>
                  <dd>
                    {f.cronicas.length === 0
                      ? "Ninguna registrada"
                      : f.cronicas.map((x) => (
                          <span key={x.id} className={s.fichaLinea}>
                            {terminoCronica(x).es}
                          </span>
                        ))}
                  </dd>
                </div>
                <div>
                  <dt>Vacuna antirrábica</dt>
                  <dd>
                    {f.rabiaHasta ? (
                      <>
                        {f.rabiaHasta < hoy ? "Caducó el " : "Válida hasta el "}
                        <span className={s.fichaMono}>{dia(f.rabiaHasta)}</span>
                      </>
                    ) : (
                      "No consta"
                    )}
                  </dd>
                </div>
              </dl>
            </section>

            <section className={ui.panel} aria-labelledby="animal">
              <h2 id="animal" className={ui.panelTitle}>
                El animal
              </h2>
              <dl className={`${s.fichaDatos} ${s.fichaDatosRejilla}`}>
                <div>
                  <dt>Especie</dt>
                  <dd>{buscarEspecie(f.especie)?.nombre ?? f.especie}</dd>
                </div>
                <div>
                  <dt>Sexo</dt>
                  <dd>
                    {f.sexo === "hembra" ? "Hembra" : f.sexo === "macho" ? "Macho" : "No consta"}
                    {f.sexo && (f.esterilizado ? (f.sexo === "hembra" ? ", esterilizada" : ", esterilizado") : ", sin esterilizar")}
                  </dd>
                </div>
                <div>
                  <dt>Raza</dt>
                  <dd>{f.raza || "No consta"}</dd>
                </div>
                <div>
                  <dt>Edad</dt>
                  <dd>
                    {f.nacimiento ? (
                      <>
                        {edadTexto(f.nacimiento, new Date())} <span className={s.fichaMono}>· {dia(f.nacimiento)}</span>
                      </>
                    ) : (
                      "No consta"
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Peso</dt>
                  <dd>
                    {f.pesoKg ? (
                      <span className={s.fichaMono}>
                        {f.pesoKg.replace(".", ",")} kg{f.pesoFecha ? ` · ${dia(f.pesoFecha)}` : ""}
                      </span>
                    ) : (
                      "No consta"
                    )}
                  </dd>
                </div>
              </dl>
            </section>

            <p className={s.procedencia}>
              <span className={s.procedenciaInsignia}>Declarado por el dueño</span>
              {f.actualizado ? `Actualizada el ${dia(f.actualizado)}.` : ""}
            </p>
          </>
        )}
      </div>

      <aside className={`${ui.panel} ${ui.readingAside}`} aria-labelledby="origen">
        <h2 id="origen" className={ui.panelTitle}>
          De dónde sale esto
        </h2>
        <p className={ui.panelNote}>
          La ficha la escribe el dueño. No es un informe ni un registro oficial: contrastadla con la exploración y con
          vuestros propios datos.
        </p>
        <p className={`${s.sellado}`}>
          <span className={s.selladoIcono}>
            <IconSealed />
          </span>
          Se abre en este navegador con la clave de la clínica. Bark &amp; Meow guarda la ficha cerrada y no puede leerla.
        </p>
        <p className={ui.panelNote}>
          El dueño puede retirar el acceso cuando quiera, y entonces dejáis de verla. Queda apuntado cada vez que la
          abrís.
        </p>
      </aside>
    </main>
  );
}
