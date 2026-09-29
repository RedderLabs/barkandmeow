"use client";

/* Piezas comunes a los niveles 1 y 2: identidad, bloque de alergias, lista de
   constantes, procedencia y los estados de carga y fallo. */

import Link from "next/link";
import type { ReactNode } from "react";
import { especie, fecha, fmt, type Idioma } from "@barkandmeow/i18n";
import { Button, buttonVariants } from "@barkandmeow/ui-web/components/button";
import type { FalloFicha, Resumen } from "@/lib/ficha";
import s from "./ficha.module.css";

type T = (clave: string) => string;

/* ── Iconos: trazo redondo, heredan currentColor ───────────── */

export function IconAlerta({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3.5 21.5 20h-19z" />
      <path d="M12 10v4M12 17.25v.25" />
    </svg>
  );
}

export function IconInfo({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16v.5" />
    </svg>
  );
}

export function IconTelefono() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
    </svg>
  );
}

export function IconReloj({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function IconCandado({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </svg>
  );
}

export function IconCheck({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5 9.5 17 19 7.5" />
    </svg>
  );
}

export function IconDocumento({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-10z" />
      <path d="M14 3.5v5h5M9 13h6M9 16.5h4" />
    </svg>
  );
}

/* ── Utilidades de formato ──────────────────────────────────── */

/** 724098100001234 → 724 098 100 001 234: se dicta por teléfono sin perder el sitio. */
export function chipLegible(chip: string): string {
  return /^\d{15}$/.test(chip) ? chip.replace(/(\d{3})(?=\d)/g, "$1 ") : chip;
}

const hoyISO = () => new Date().toISOString().slice(0, 10);

/* ── Identidad ──────────────────────────────────────────────── */

export function Identidad({ resumen, idioma, t }: { resumen: Resumen; idioma: Idioma; t: T }) {
  const a = resumen.animal;
  const sexo =
    a.sexo === "hembra"
      ? t(a.esterilizado ? "hembraEsterilizada" : "hembra")
      : t(a.esterilizado ? "machoCastrado" : "macho");
  return (
    <div className={s.identidadFila}>
    <FotoMascota perfil={resumen.perfil} nombre={a.nombre} t={t} />
    <div className={s.identidad}>
      <h1 className={s.nombre}>{a.nombre}</h1>
      <p className={s.rasgos}>
        {[especie(idioma, a.especie), sexo, a.raza, a.edad, `${a.pesoKg} kg`].join(" · ")}
      </p>
      {a.chip && (
        <p className={s.chip}>
          <span className={s.chipEtiqueta}>{t("chip")}</span> {chipLegible(a.chip)}
        </p>
      )}
    </div>
    </div>
  );
}

/* ── Bloque de alergias: el único grito del sistema ────────── */

export function BloqueAlergias({ resumen, idioma, t }: { resumen: Resumen; idioma: Idioma; t: T }) {
  // Sin alergias no hay bloque rojo: va como una fila más de las constantes.
  if (resumen.alergias.length === 0) return null;
  return (
    <section className={s.alergias} aria-labelledby="alergias-titulo">
      <h2 id="alergias-titulo" className={s.alergiasTitulo}>
        <IconAlerta />
        {t("alergias")}
      </h2>
      <ul className={s.alergiasLista}>
        {resumen.alergias.map((al) => (
          <li key={al.sustancia} className={s.alergia}>
            <p className={s.sustancia}>{al.sustancia}</p>
            <p className={s.reaccion}>
              {al.reaccion[idioma]} · {t(`gravedad${al.gravedad[0].toUpperCase()}${al.gravedad.slice(1)}`)}
            </p>
            {al.atcvet && <p className={s.atc}>ATCvet {al.atcvet}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── Constantes: medicación, crónicas, antirrábica ─────────── */

export function Constantes({
  resumen,
  idioma,
  t,
  extra,
  className,
}: {
  resumen: Resumen;
  idioma: Idioma;
  t: T;
  extra?: ReactNode;
  className?: string;
}) {
  const rabiaCaducada = resumen.rabiaHasta !== null && resumen.rabiaHasta < hoyISO();
  return (
    <dl className={className ? `${s.filas} ${className}` : s.filas}>
      {resumen.alergias.length === 0 && (
        <div className={s.fila}>
          <dt>{t("alergias")}</dt>
          <dd>{t("ningunaRegistrada")}</dd>
        </div>
      )}
      <div className={s.fila}>
        <dt>{t("medicacionActual")}</dt>
        {resumen.medicacion.length === 0 ? (
          <dd>{t("ningunaRegistrada")}</dd>
        ) : (
          resumen.medicacion.map((m) => (
            <dd key={m.principio}>
              {m.principio} · <span className={s.dato}>{fmt(t("pauta"), { dosis: m.dosis, h: m.cadaHoras })}</span>
            </dd>
          ))
        )}
      </div>
      <div className={s.fila}>
        <dt>{t("cronicas")}</dt>
        {resumen.cronicas.length === 0 ? (
          <dd>{t("ningunaRegistrada")}</dd>
        ) : (
          resumen.cronicas.map((c) => <dd key={c.es}>{c[idioma]}</dd>)
        )}
      </div>
      {extra}
      <div className={s.fila}>
        <dt>{t("vacunaRabia")}</dt>
        {resumen.rabiaHasta === null ? (
          <dd>{t("ningunaRegistrada")}</dd>
        ) : rabiaCaducada ? (
          // Caducada es ámbar con icono, nunca rojo: el rojo es de las alergias.
          <dd className={s.caducada}>
            <IconReloj />
            {t("caducoEl")} <span className={s.dato}>{fecha(resumen.rabiaHasta)}</span>
          </dd>
        ) : (
          <dd>
            {t("validaHasta")} <span className={s.dato}>{fecha(resumen.rabiaHasta)}</span>
          </dd>
        )}
      </div>
    </dl>
  );
}

export function Procedencia({ resumen, t }: { resumen: Resumen; t: T }) {
  return (
    <p className={s.procedencia}>
      <IconInfo />
      <span>
        {t("declaradoPorTutor")} · {fmt(t("actualizado"), { fecha: "" }).trim()}{" "}
        <span className={s.dato}>{fecha(resumen.actualizado)}</span>
      </span>
    </p>
  );
}

/* ── Perfil público: lo que el dueño publica por si se pierde ─ */

type PerfilVisible = {
  nombre?: string;
  bio: string;
  telefonos: { etiqueta: string; numero: string }[];
  foto: string | null;
};

/** Avatar de 64px: la foto del perfil público, si el dueño la publicó. */
export function FotoMascota({ perfil, nombre, t }: { perfil?: PerfilVisible | null; nombre: string; t: T }) {
  if (!perfil?.foto) return null;
  return (
    // La foto viene de la API con su propio origen; next/image no aporta nada
    // en una exportación estática y sumaría peso.
    // eslint-disable-next-line @next/next/no-img-element
    <img className={s.foto} src={perfil.foto} alt={fmt(t("fotoDe"), { nombre })} width={64} height={64} />
  );
}

/** Bio y teléfonos. Los números van en mono: se dictan y se marcan. */
export function PerfilPublico({ perfil, t, conFoto = false }: { perfil: PerfilVisible; t: T; conFoto?: boolean }) {
  return (
    <section className={s.perfil} aria-labelledby="perfil-titulo">
      <div className={s.perfilCabecera}>
        {conFoto && perfil.foto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={s.foto} src={perfil.foto} alt={t("fotoMascota")} width={64} height={64} />
        )}
        <div>
          <h2 id="perfil-titulo" className={s.perfilTitulo}>
            {t("perfilPublico")}
          </h2>
          <p className={s.perfilNota}>{t("perfilPublicoNota")}</p>
        </div>
      </div>
      {/* Llamarlo por su nombre ayuda a acercarse a un animal asustado. */}
      {perfil.nombre && <p className={s.perfilNombre}>{perfil.nombre}</p>}
      {perfil.bio && <p className={s.perfilBio}>{perfil.bio}</p>}
      {perfil.telefonos.length > 0 && (
        <ul className={s.telefonos}>
          {perfil.telefonos.map((tel) => (
            <li key={tel.numero}>
              <a className={s.telefono} href={`tel:${tel.numero.replace(/[^\d+]/g, "")}`}>
                <span className={s.telefonoEtiqueta}>{tel.etiqueta}</span>
                <span className={s.dato}>{tel.numero}</span>
                <IconTelefono />
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ── Aviso de ficha de ejemplo ─────────────────────────────── */

export function AvisoEjemplo({ t }: { t: T }) {
  return (
    <p className={s.ejemplo} role="note">
      <span className={s.ejemploEtiqueta}>{t("fichaEjemplo")}</span>
      <span>{t("fichaEjemploTexto")}</span>
    </p>
  );
}

/* ── Carga y fallo ──────────────────────────────────────────── */

export function Abriendo({ t }: { t: T }) {
  return (
    <p className={s.abriendo} role="status">
      <span className={s.abriendoIcono}>
        <IconCandado />
      </span>
      {t("abriendo")}
    </p>
  );
}

const TEXTOS_FALLO: Record<FalloFicha, [string, string]> = {
  huella: ["errHuella", "errHuellaAyuda"],
  enlace: ["errEnlace", "errEnlaceAyuda"],
  ausente: ["errPlaca", "errPlacaAyuda"],
  clave: ["errClave", "errClaveAyuda"],
  red: ["errRed", "errRedAyuda"],
  noDisponible: ["errNoDisponible", "errNoDisponibleAyuda"],
};

export function Fallo({
  fallo,
  t,
  nivel,
  onReintentar,
}: {
  fallo: FalloFicha;
  t: T;
  nivel: 1 | 2;
  onReintentar: () => void;
}) {
  const [motivo, salida] =
    nivel === 2 && fallo === "ausente" ? ["errAcceso", "errAccesoAyuda"] : TEXTOS_FALLO[fallo];
  return (
    <div className={s.fallo}>
      <div className={s.falloBloque} role="alert">
        <p className={s.falloMotivo}>{t(motivo)}</p>
        <p className={s.falloSalida}>{t(salida)}</p>
      </div>
      <div className={s.acciones}>
        {fallo === "red" && (
          <Button type="button" onClick={onReintentar}>
            {t("reintentar")}
          </Button>
        )}
        <Link
          href="/chip"
          className={buttonVariants({ variant: fallo === "red" ? "outline" : "default", size: fallo === "red" ? "md" : "default" })}
        >
          {t("consultarPorChip")}
        </Link>
      </div>
    </div>
  );
}
