"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { NIVELES } from "@barkandmeow/i18n";
import { Button, buttonVariants } from "@barkandmeow/ui-web/components/button";
import { useIdioma } from "@/lib/idioma";
import { abrirResumen, ErrorFicha, leerEnlace, type FalloFicha, type Resumen } from "@/lib/ficha";
import { CabeceraVet, Insignia } from "../CabeceraVet";
import {
  Abriendo,
  AvisoEjemplo,
  BloqueAlergias,
  Constantes,
  Fallo,
  IconTelefono,
  Identidad,
  PerfilPublico,
  Procedencia,
} from "./Piezas";
import s from "./ficha.module.css";

type Estado =
  | { tipo: "abriendo" }
  | { tipo: "abierta"; resumen: Resumen; ejemplo: boolean }
  | { tipo: "fallo"; fallo: FalloFicha };

/* Nivel 1 — la placa del collar. Pantalla terminal sobre blanco a sangre:
   alergia, medicación, antirrábica y cómo llegar al dueño, sin scroll en un
   teléfono. No hay navegación: el veterinario llegó por un QR y no tiene
   dónde perderse. */
export function Emergencia() {
  const { idioma, cambiar, t } = useIdioma();
  const [estado, setEstado] = useState<Estado>({ tipo: "abriendo" });
  const [comoHistorial, setComoHistorial] = useState(false);
  const ids = useId();

  const abrir = useCallback(async () => {
    setEstado({ tipo: "abriendo" });
    const enlace = leerEnlace("e");
    if (!enlace) return setEstado({ tipo: "fallo", fallo: "enlace" });
    try {
      const resumen = await abrirResumen(enlace);
      setEstado({ tipo: "abierta", resumen, ejemplo: enlace.ejemplo });
    } catch (e) {
      setEstado({ tipo: "fallo", fallo: e instanceof ErrorFicha ? e.fallo : "red" });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la carga empieza al montar
    void abrir();
    // Si el QR se vuelve a escanear con la pestaña abierta, solo cambia el #.
    window.addEventListener("hashchange", abrir);
    return () => window.removeEventListener("hashchange", abrir);
  }, [abrir]);

  return (
    <div className={s.urgencia}>
      <CabeceraVet
        insignia={
          <Insignia tono={1} detalle={t("viaPlaca")}>
            {NIVELES[idioma]["1"]}
          </Insignia>
        }
        idioma={idioma}
        onIdioma={cambiar}
        etiquetaIdioma={t("idioma")}
      />
      <main className={s.urgenciaCuerpo}>

      {estado.tipo === "abriendo" && <Abriendo t={t} />}

      {estado.tipo === "fallo" && (
        <Fallo fallo={estado.fallo} nivel={1} t={t} onReintentar={() => void abrir()} />
      )}

      {estado.tipo === "abierta" && (
        <div className={s.ficha}>
          <div className={s.fichaPrincipal}>
            {estado.ejemplo && <AvisoEjemplo t={t} />}
            <Identidad resumen={estado.resumen} idioma={idioma} t={t} />
            <BloqueAlergias resumen={estado.resumen} idioma={idioma} t={t} />
            <Constantes resumen={estado.resumen} idioma={idioma} t={t} className={s.filasEnFila} />
          </div>

          <div className={s.fichaLateral}>
          <Procedencia resumen={estado.resumen} t={t} />
          <div className={s.acciones}>
            {estado.resumen.telefono ? (
              <a href={`tel:${estado.resumen.telefono}`} className={buttonVariants()}>
                <IconTelefono />
                {t("llamarTutor")}
              </a>
            ) : estado.resumen.perfil?.telefonos.length ? null : (
              // Sin teléfono en la placa ni en el perfil público.
              <p className={s.sinTelefono}>{t("sinTelefono")}</p>
            )}
            <Button
              type="button"
              variant="outline"
              size="md"
              aria-expanded={comoHistorial}
              aria-controls={`${ids}-como`}
              onClick={() => setComoHistorial((v) => !v)}
            >
              {t("pedirHistorial")}
            </Button>
            {/* El historial no se pide a un servidor: lo abre el dueño con su
                QR temporal. Aquí solo se explica cómo, sin salir de la ficha. */}
            <p id={`${ids}-como`} className={s.como} hidden={!comoHistorial}>
              {t("historialComo")}
            </p>
          </div>
          {estado.resumen.perfil && <PerfilPublico perfil={estado.resumen.perfil} t={t} />}
          </div>
        </div>
      )}
      </main>

      <footer className={`${s.pie} ${s.urgenciaPie}`}>{t("descargo")}</footer>
    </div>
  );
}
