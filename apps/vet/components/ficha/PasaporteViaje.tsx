"use client";

import { useCallback, useEffect, useState } from "react";
import { PASAPORTE, especie, fecha, fmt, type Idioma } from "@barkandmeow/i18n";
import { useIdioma } from "@/lib/idioma";
import { ErrorFicha, leerEnlace, type FalloFicha } from "@/lib/ficha";
import { abrirPasaporte, type Certificado, type PasaporteAbierto, type RegistroViaje } from "@/lib/pasaporte";
import { CabeceraVet, Insignia } from "../CabeceraVet";
import { Abriendo, chipLegible, Fallo, IconAlerta, IconCheck } from "./Piezas";
import s from "./ficha.module.css";

type Estado =
  | { tipo: "abriendo" }
  | { tipo: "abierto"; p: PasaporteAbierto }
  | { tipo: "fallo"; fallo: FalloFicha };

/* Pasaporte de viaje: lo abre un veterinario de frontera o una compañía con
   el QR del dueño. Lo primero, que es una copia y que manda el papel; luego el
   chip para compararlo con el lector, y cada registro con su firma comprobada
   aquí mismo. Lo que declaró el dueño va aparte y dicho como tal. */
export function PasaporteViaje() {
  const { idioma, cambiar, t } = useIdioma();
  const tp = (k: string) => PASAPORTE[idioma][k] ?? PASAPORTE.es[k] ?? k;
  const [estado, setEstado] = useState<Estado>({ tipo: "abriendo" });

  const abrir = useCallback(async () => {
    setEstado({ tipo: "abriendo" });
    const enlace = leerEnlace("p");
    if (!enlace) return setEstado({ tipo: "fallo", fallo: "enlace" });
    try {
      setEstado({ tipo: "abierto", p: await abrirPasaporte(enlace) });
    } catch (e) {
      setEstado({ tipo: "fallo", fallo: e instanceof ErrorFicha ? e.fallo : "red" });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la carga empieza al montar
    void abrir();
    window.addEventListener("hashchange", abrir);
    return () => window.removeEventListener("hashchange", abrir);
  }, [abrir]);

  return (
    <div className={s.urgencia}>
      <CabeceraVet
        insignia={
          <Insignia tono={2} detalle={tp("detalleInsignia")}>
            {tp("insignia")}
          </Insignia>
        }
        idioma={idioma}
        onIdioma={cambiar}
        etiquetaIdioma={t("idioma")}
      />
      <main className={s.urgenciaCuerpo}>
        {estado.tipo === "abriendo" && <Abriendo t={t} />}
        {estado.tipo === "fallo" && <Fallo fallo={estado.fallo} nivel={2} t={t} onReintentar={() => void abrir()} />}
        {estado.tipo === "abierto" && <Contenido p={estado.p} idioma={idioma} tp={tp} />}
      </main>
      <footer className={`${s.pie} ${s.urgenciaPie}`}>{tp("aviso")}</footer>
    </div>
  );
}

function Contenido({ p, idioma, tp }: { p: PasaporteAbierto; idioma: Idioma; tp: (k: string) => string }) {
  return (
    <div className={s.pasaporte}>
      <div className={s.identidad}>
        <h1 className={s.nombre}>{p.nombre || tp("titulo")}</h1>
        <p className={s.rasgos}>
          {[p.especie && especie(idioma, p.especie), p.numeroPasaporte ? fmt(tp("numero"), { numero: p.numeroPasaporte }) : tp("sinNumero")]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      <section className={s.pasaporteChip} aria-label={tp("chip")}>
        <span className={s.chipEtiqueta}>{tp("chip")}</span>
        {p.chip ? (
          <>
            <span className={`${s.dato} ${s.pasaporteChipNumero}`}>{chipLegible(p.chip)}</span>
            <span className={s.registroDato}>{tp("chipComparar")}</span>
          </>
        ) : (
          <span className={s.registroDato}>{tp("sinChip")}</span>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className={s.tituloPanel}>{tp("certificados")}</h2>
        <p className={s.registroDato}>{tp("explicaFirma")}</p>
        {p.certificados.length === 0 ? (
          <p className={s.vacio}>{tp("nadaCertificado")}</p>
        ) : (
          <ul className={s.registros}>
            {p.certificados.map((c, i) => (
              <li key={i}>
                <Registro r={c.registro} comprobacion={c.comprobacion} idioma={idioma} tp={tp} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {p.declarados.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className={s.tituloPanel}>{tp("declarados")}</h2>
          <p className={s.registroDato}>{tp("explicaDeclarados")}</p>
          <ul className={s.registros}>
            {p.declarados.map((r, i) => (
              <li key={i}>
                <Registro r={r} idioma={idioma} tp={tp} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className={s.huella}>
        {fmt(tp("generado"), { fecha: fecha(p.generado) })} {fmt(tp("caduca"), { fecha: fecha(p.caduca) })}
      </p>
    </div>
  );
}

const hoy = () => new Date().toISOString().slice(0, 10);

function Registro({
  r,
  comprobacion,
  tp,
}: {
  r: RegistroViaje;
  comprobacion?: Certificado["comprobacion"];
  idioma: Idioma;
  tp: (k: string) => string;
}) {
  const titulo =
    r.tipo === "vacuna"
      ? r.enfermedad === "rabia"
        ? tp("vacunaRabia")
        : `${tp("vacuna")}${r.nombre ? `: ${r.nombre}` : ""}`
      : r.tipo === "desparasitacion"
        ? r.contra === "equinococo"
          ? tp("tenia")
          : tp("desparasitacion")
        : tp("titulacion");

  const filas: [string, string][] = [];
  if (r.tipo === "vacuna") {
    if (r.producto) filas.push([tp("producto"), r.producto]);
    if (r.lote) filas.push([tp("lote"), r.lote]);
    if (r.validaHasta) filas.push([tp("validaHasta"), fecha(r.validaHasta)]);
  } else if (r.tipo === "desparasitacion") {
    filas.push([tp("administrado"), `${fecha(r.fecha)}${r.hora ? ` ${r.hora}` : ""}`]);
    if (r.producto) filas.push([tp("producto"), r.producto]);
  } else {
    if (r.resultado !== undefined) filas.push([tp("resultado"), `${r.resultado} UI/ml`]);
    if (r.fechaMuestra) filas.push([tp("muestra"), fecha(r.fechaMuestra)]);
    if (r.laboratorio) filas.push([tp("laboratorio"), r.laboratorio]);
  }
  if (r.veterinario) filas.push([tp("veterinario"), r.veterinario]);
  const caducada = r.tipo === "vacuna" && r.validaHasta && r.validaHasta < hoy();

  return (
    <article className={s.registro}>
      <div className={s.registroMeta}>
        <span className={s.dato}>{fecha(r.fecha)}</span>
        {comprobacion ? (
          <Sello c={comprobacion} r={r} tp={tp} />
        ) : (
          <span className={`${s.origen} ${s.origenDueno}`}>{tp("declarados")}</span>
        )}
      </div>
      <h3 className={s.registroTitulo}>{titulo}</h3>
      <dl className={s.filas}>
        {filas.map(([k, v]) => (
          <div key={k} className={s.fila}>
            <dt>{k}</dt>
            <dd className={k === tp("lote") || k === tp("validaHasta") ? s.dato : undefined}>{v}</dd>
          </div>
        ))}
      </dl>
      {caducada && (
        <p className={s.caducada}>
          <IconAlerta size={14} /> {tp("caducada")}
        </p>
      )}
    </article>
  );
}

/** El resultado de comprobar la firma, dicho sin rodeos. Solo «ok» lleva el azul de clínica. */
function Sello({ c, r, tp }: { c: Certificado["comprobacion"]; r: RegistroViaje; tp: (k: string) => string }) {
  if (c.estado === "ok")
    return (
      <span className="flex flex-col items-end gap-1">
        <span className={`${s.origen} ${s.origenClinica}`}>
          <IconCheck size={14} /> {fmt(tp("firmaOk"), { clinica: c.firmante.clinica })}
        </span>
        {c.firmante.dominio && (
          <span className={s.huella}>{fmt(tp("dominioVerificado"), { dominio: c.firmante.dominio })}</span>
        )}
        {c.firmante.retirada && <span className={s.huella}>{fmt(tp("claveRetirada"), { fecha: fecha(c.firmante.retirada) })}</span>}
      </span>
    );
  const texto =
    c.estado === "mala"
      ? tp("firmaMal")
      : c.estado === "otro-chip"
        ? fmt(tp("chipDistinto"), { chip: chipLegible(r.chip) })
        : tp("firmaDesconocida");
  return (
    <span className={`${s.origen} ${s.firmaMala}`}>
      <IconAlerta size={14} /> {texto}
    </span>
  );
}
