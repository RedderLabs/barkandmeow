"use client";

import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { fecha, fmt, NIVELES, type Idioma } from "@barkandmeow/i18n";
import { Button } from "@barkandmeow/ui-web/components/button";
import { Input } from "@barkandmeow/ui-web/components/input";
import { Label } from "@barkandmeow/ui-web/components/label";
import { Textarea } from "@barkandmeow/ui-web/components/textarea";
import { useIdioma } from "@/lib/idioma";
import {
  abrirDocumento,
  abrirHistorial,
  enviarNota,
  ErrorFicha,
  leerEnlace,
  type Enlace,
  type FalloFicha,
  type Historial as DatosHistorial,
  type Nota,
  type Registro,
} from "@/lib/ficha";
import { CabeceraVet, Insignia } from "../CabeceraVet";
import {
  Abriendo,
  AvisoEjemplo,
  BloqueAlergias,
  Constantes,
  Fallo,
  IconCandado,
  IconCheck,
  IconDocumento,
  IconReloj,
  Identidad,
  PerfilPublico,
} from "./Piezas";
import s from "./ficha.module.css";

type T = (clave: string) => string;

type Estado =
  | { tipo: "abriendo" }
  | { tipo: "abierta"; datos: DatosHistorial; enlace: Enlace }
  | { tipo: "fallo"; fallo: FalloFicha };

/* Nivel 2 — acceso temporal desde el QR del dueño. La única pantalla del
   sistema compuesta para el ordenador del mostrador: identidad y constantes a
   la izquierda, historial en el centro, nota de la visita a la derecha. En un
   teléfono se apila en ese mismo orden. */
export function Historial() {
  const { idioma, cambiar, t } = useIdioma();
  const [estado, setEstado] = useState<Estado>({ tipo: "abriendo" });

  const abrir = useCallback(async () => {
    setEstado({ tipo: "abriendo" });
    const enlace = leerEnlace("s");
    if (!enlace) return setEstado({ tipo: "fallo", fallo: "enlace" });
    try {
      const datos = await abrirHistorial(enlace);
      setEstado({ tipo: "abierta", datos, enlace });
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

  const restante = useRestante(estado.tipo === "abierta" ? estado.datos.caduca : null);
  const caducado = restante !== null && restante <= 0;

  return (
    <div className={s.mostrador}>
      <CabeceraVet
        insignia={
          caducado ? (
            <Insignia tono="caducado">
              <IconReloj size={14} />
              {t("accesoCaducado")}
            </Insignia>
          ) : (
            <Insignia tono={2} detalle={t("accesoTemporal")}>
              {NIVELES[idioma]["2"]}
            </Insignia>
          )
        }
        herramientas={
          restante !== null &&
          !caducado && (
            <p className={`${s.cuenta} ${restante < 3_600_000 ? s.cuentaPoco : ""}`}>
              {restante < 3_600_000 && <IconReloj size={14} />}
              {t("expiraEn")} <span className={s.dato}>{duracion(restante)}</span>
            </p>
          )
        }
        idioma={idioma}
        onIdioma={cambiar}
        etiquetaIdioma={t("idioma")}
      />

      {estado.tipo === "abriendo" && (
        <main className={s.mostradorAviso}>
          <Abriendo t={t} />
        </main>
      )}

      {estado.tipo === "fallo" && (
        <main className={s.mostradorAviso}>
          <Fallo fallo={estado.fallo} nivel={2} t={t} onReintentar={() => void abrir()} />
          <p className={s.pie}>{t("descargo")}</p>
        </main>
      )}

      {estado.tipo === "abierta" && (
        <main className={s.mostradorRejilla}>
          <aside className={s.colIdentidad}>
            {estado.enlace.ejemplo && <AvisoEjemplo t={t} />}
            <Identidad resumen={estado.datos.resumen} idioma={idioma} t={t} />
            <BloqueAlergias resumen={estado.datos.resumen} idioma={idioma} t={t} />
            <Constantes
              resumen={estado.datos.resumen}
              idioma={idioma}
              t={t}
              extra={
                estado.datos.peso && (
                  <div className={s.fila}>
                    <dt>{t("peso")}</dt>
                    <dd>
                      <span className={s.dato}>
                        {estado.datos.peso.kg} kg · {fecha(estado.datos.peso.fecha)}
                      </span>
                    </dd>
                  </div>
                )
              }
            />
            {estado.datos.resumen.perfil && <PerfilPublico perfil={estado.datos.resumen.perfil} t={t} />}
            <p className={s.notaLateral}>{t("pieProcedencia")}</p>
          </aside>

          <section className={s.colHistorial} aria-labelledby="historial-titulo">
            <div className={s.historialCabecera}>
              <h2 id="historial-titulo" className={s.tituloPanel}>
                {t("historialClinico")}
              </h2>
              <p className={s.recuento}>
                {estado.datos.registros.length === 1
                  ? t("registro1")
                  : fmt(t("registros"), { n: estado.datos.registros.length })}
              </p>
            </div>
            {estado.datos.registros.length === 0 ? (
              <p className={s.vacio}>{t("sinRegistros")}</p>
            ) : (
              <ol className={s.registros}>
                {estado.datos.registros.map((r) => (
                  <RegistroClinico key={r.id} registro={r} enlace={estado.enlace} idioma={idioma} t={t} />
                ))}
              </ol>
            )}
          </section>

          <NotaConsulta
            enlace={estado.enlace}
            historial={estado.datos}
            caducado={caducado}
            idioma={idioma}
            t={t}
          />

          <p className={`${s.pie} ${s.pieMostrador}`}>{t("descargo")}</p>
        </main>
      )}
    </div>
  );
}

/* ── Cuenta atrás ─────────────────────────────────────────────
   Se refresca cada 15 s: los minutos son la unidad que se lee. */

function useRestante(caduca: string | null): number | null {
  const [ahora, setAhora] = useState<number | null>(null);
  useEffect(() => {
    if (!caduca) return;
    const tic = () => setAhora(Date.now());
    tic();
    const i = setInterval(tic, 15_000);
    return () => clearInterval(i);
  }, [caduca]);
  if (!caduca || ahora === null) return null;
  return new Date(caduca).getTime() - ahora;
}

function duracion(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(min / 60);
  return h > 0 ? `${h} h ${min % 60} min` : `${min} min`;
}

/* ── Registro del historial ─────────────────────────────────── */

const PROCEDENCIA: Record<Registro["procedencia"], { clave: string; cls: string }> = {
  clinica: { clave: "documentoClinica", cls: s.origenClinica },
  veterinario: { clave: "notaVeterinario", cls: s.origenVeterinario },
  dueno: { clave: "declaradoPorTutor", cls: s.origenDueno },
};

function RegistroClinico({
  registro: r,
  enlace,
  idioma,
  t,
}: {
  registro: Registro;
  enlace: Enlace;
  idioma: Idioma;
  t: T;
}) {
  const origen = PROCEDENCIA[r.procedencia];
  const [doc, setDoc] = useState<"libre" | "abriendo" | "verificado" | FalloFicha>("libre");

  async function verDocumento() {
    setDoc("abriendo");
    try {
      const pdf = await abrirDocumento(enlace, r);
      // Solo llega aquí si la huella coincide con la que firmó la clínica.
      const url = URL.createObjectURL(pdf);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.documento?.nombre ?? "documento.pdf";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setDoc("verificado");
    } catch (e) {
      setDoc(e instanceof ErrorFicha ? e.fallo : "red");
    }
  }

  const avisoDoc =
    doc === "libre" || doc === "abriendo" || doc === "verificado"
      ? null
      : enlace.ejemplo
        ? "docEjemplo"
        : doc === "huella"
          ? "errHuella"
          : doc === "ausente"
            ? "errAcceso"
            : "docNoDisponible";

  return (
    <li className={s.registro}>
      <div className={s.registroMeta}>
        <p className={s.dato}>
          <time dateTime={r.fecha}>{fecha(r.fecha)}</time> · {r.lugar}
        </p>
        <span className={`${s.origen} ${origen.cls}`}>
          {r.procedencia === "clinica" && <IconDocumento size={14} />}
          {t(origen.clave)}
        </span>
      </div>
      <h3 className={s.registroTitulo}>{r.titulo[idioma]}</h3>

      {r.vacuna && (
        <p className={`${s.dato} ${s.registroDato}`}>
          {t("lote")} {r.vacuna.lote} · {fmt(t("validezMeses"), { n: r.vacuna.validezMeses })}
        </p>
      )}

      {r.texto && <TextoLibre texto={r.texto} origen={r.idiomaTexto} idioma={idioma} t={t} />}

      {r.documento && (
        <div className={s.documento}>
          <button type="button" className={s.enlaceDoc} onClick={verDocumento} disabled={doc === "abriendo"}>
            <IconDocumento />
            {doc === "abriendo" ? t("docDescifrando") : t("verDocumento")}
          </button>
          {/* La huella permite cotejar el PDF con el que firmó la clínica. Se
              dice «verificado» solo después de comprobarla, nunca antes. */}
          <p className={`${s.huella} ${doc === "verificado" ? s.huellaOk : ""}`}>
            {doc === "verificado" && <IconCheck size={14} />}
            SHA-256 {r.documento.sha256.slice(0, 8)}…{r.documento.sha256.slice(-6)}
            {doc === "verificado" && ` · ${t("docVerificado")}`}
          </p>
          {avisoDoc && (
            <p className={s.docAviso} role="status">
              {t(avisoDoc)}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

/* ── Texto libre: en su idioma, con aviso ───────────────────
   La traducción automática es opcional, está marcada y ocurre en este
   navegador (Translator API). Si el navegador no la tiene, no se manda el
   texto a ningún servicio: se queda el original. */

type Traduccion =
  | { tipo: "nada" }
  | { tipo: "traduciendo" }
  | { tipo: "hecha"; texto: string }
  | { tipo: "sinTraductor" }
  | { tipo: "error" };

type TraductorGlobal = {
  availability(o: { sourceLanguage: string; targetLanguage: string }): Promise<string>;
  create(o: { sourceLanguage: string; targetLanguage: string }): Promise<{ translate(texto: string): Promise<string> }>;
};

function TextoLibre({ texto, origen, idioma, t }: { texto: string; origen: Idioma; idioma: Idioma; t: T }) {
  const [tr, setTr] = useState<Traduccion>({ tipo: "nada" });

  // Si el lector cambia de idioma, la traducción anterior deja de valer.
  const [paraIdioma, setParaIdioma] = useState(idioma);
  if (paraIdioma !== idioma) {
    setParaIdioma(idioma);
    setTr({ tipo: "nada" });
  }

  if (origen === idioma) return <p className={s.registroTexto}>{texto}</p>;

  async function traducir() {
    const T = (globalThis as { Translator?: TraductorGlobal }).Translator;
    if (!T) return setTr({ tipo: "sinTraductor" });
    setTr({ tipo: "traduciendo" });
    try {
      const par = { sourceLanguage: origen, targetLanguage: idioma };
      if ((await T.availability(par)) === "unavailable") return setTr({ tipo: "sinTraductor" });
      // Si el navegador tiene que bajarse el modelo, no se espera indefinidamente:
      // el veterinario tiene el original delante.
      const plazo = new Promise<never>((_, no) => setTimeout(() => no(new Error("plazo")), 10_000));
      const traductor = await Promise.race([T.create(par), plazo]);
      setTr({ tipo: "hecha", texto: await Promise.race([traductor.translate(texto), plazo]) });
    } catch {
      setTr({ tipo: "error" });
    }
  }

  return (
    <div className={s.original}>
      <p className={s.originalAviso}>{fmt(t("notaOriginalEn"), { idioma: t(`idioma.${origen}`) })}</p>
      <blockquote className={s.cita} lang={origen}>
        «{texto}»
      </blockquote>
      {tr.tipo === "hecha" ? (
        <div className={s.traduccion}>
          <p className={s.traduccionAviso}>{t("traduccionAuto")}</p>
          <p lang={idioma}>{tr.texto}</p>
        </div>
      ) : tr.tipo === "sinTraductor" || tr.tipo === "error" ? (
        <p className={s.traduccionAviso} role="status">
          {t(tr.tipo === "error" ? "errTraduccion" : "sinTraductor")}
        </p>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          disabled={tr.tipo === "traduciendo"}
          onClick={() => void traducir()}
        >
          {tr.tipo === "traduciendo" ? t("traduciendo") : t("traducirAuto")}
        </Button>
      )}
    </div>
  );
}

/* ── Nota de la consulta ─────────────────────────────────────
   Se sella a la clave pública del dueño: el veterinario escribe pero no
   puede volver a leerla, así que tras enviarla no hay vista previa. */

type EstadoNota = "editando" | "enviando" | "enviada" | "ejemplo" | "error";

const NOTA_VACIA: Nota = { motivo: "", diagnostico: "", tratamiento: "", observaciones: "", clinica: "" };

function NotaConsulta({
  enlace,
  historial,
  caducado,
  idioma,
  t,
}: {
  enlace: Enlace;
  historial: DatosHistorial;
  caducado: boolean;
  idioma: Idioma;
  t: T;
}) {
  const [nota, setNota] = useState<Nota>(NOTA_VACIA);
  const [estado, setEstado] = useState<EstadoNota>("editando");
  const [intentado, setIntentado] = useState(false);
  const ids = useId();

  const falta = (k: "motivo" | "clinica") => intentado && !nota[k].trim();
  const campo = (k: keyof Nota) => ({
    id: `${ids}-${k}`,
    value: nota[k],
    disabled: caducado || estado === "enviando",
    onChange: (e: { target: { value: string } }) => setNota((n) => ({ ...n, [k]: e.target.value })),
  });

  async function alEnviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (caducado) return;
    setIntentado(true);
    const vacio = (["motivo", "clinica"] as const).find((k) => !nota[k].trim());
    if (vacio) {
      document.getElementById(`${ids}-${vacio}`)?.focus();
      return;
    }
    setEstado("enviando");
    try {
      setEstado(await enviarNota(enlace, historial, nota, idioma));
    } catch {
      setEstado("error");
    }
  }

  function otra() {
    setNota((n) => ({ ...NOTA_VACIA, clinica: n.clinica }));
    setIntentado(false);
    setEstado("editando");
  }

  if (estado === "enviada" || estado === "ejemplo") {
    return (
      <section className={`${s.colNota} ${s.panelNota}`} aria-labelledby={`${ids}-titulo`}>
        <h2 id={`${ids}-titulo`} className={s.tituloPanel}>
          {t("notaConsulta")}
        </h2>
        <div className={`${s.hecho} ${estado === "ejemplo" ? s.hechoEjemplo : ""}`} role="status">
          <p className={s.hechoTitulo}>
            {estado === "enviada" ? <IconCheck /> : <IconCandado size={20} />}
            {estado === "enviada" ? t("notaEnviada") : t("notaEjemplo")}
          </p>
          <p className={s.sellado}>{t("sinVistaPrevia")}</p>
        </div>
        <Button type="button" variant="outline" size="md" onClick={otra}>
          {t("otraNota")}
        </Button>
      </section>
    );
  }

  return (
    <form
      className={`${s.colNota} ${s.panelNota}`}
      onSubmit={alEnviar}
      noValidate
      aria-labelledby={`${ids}-titulo`}
    >
      <h2 id={`${ids}-titulo`} className={s.tituloPanel}>
        {t("notaConsulta")}
      </h2>

      {caducado && (
        <div className={s.avisoCaducado} role="status">
          <IconReloj />
          <p>{t("notaCaducada")}</p>
        </div>
      )}

      <div className={s.grupo}>
        <Label htmlFor={`${ids}-motivo`}>{t("motivo")}</Label>
        <Input
          {...campo("motivo")}
          lang={idioma}
          aria-invalid={falta("motivo") || undefined}
          aria-describedby={falta("motivo") ? `${ids}-motivo-error` : undefined}
          required
        />
        {falta("motivo") && (
          <p id={`${ids}-motivo-error`} className={s.faltaDato}>
            {t("campoObligatorio")}
          </p>
        )}
      </div>

      <div className={s.grupo}>
        <Label htmlFor={`${ids}-diagnostico`}>{t("diagnostico")}</Label>
        <Input {...campo("diagnostico")} lang={idioma} />
      </div>

      <div className={s.grupo}>
        <Label htmlFor={`${ids}-tratamiento`}>{t("tratamiento")}</Label>
        {/* Dosis y pautas se transcriben: van en mono, como en la ficha. */}
        <Input
          {...campo("tratamiento")}
          className="font-mono text-[15px] tabular-nums placeholder:font-sans placeholder:tracking-normal"
          placeholder={t("tratamientoEjemplo")}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div className={s.grupo}>
        <Label htmlFor={`${ids}-observaciones`}>{t("observaciones")}</Label>
        <Textarea {...campo("observaciones")} rows={4} lang={idioma} />
      </div>

      <div className={s.grupo}>
        <Label htmlFor={`${ids}-clinica`}>{t("clinica")}</Label>
        <Input
          {...campo("clinica")}
          autoComplete="organization"
          placeholder={t("nombreCiudad")}
          aria-invalid={falta("clinica") || undefined}
          aria-describedby={falta("clinica") ? `${ids}-clinica-error` : undefined}
          required
        />
        {falta("clinica") && (
          <p id={`${ids}-clinica-error`} className={s.faltaDato}>
            {t("campoObligatorio")}
          </p>
        )}
      </div>

      {estado === "error" && (
        <div className={s.falloBloque} role="alert">
          <p className={s.falloMotivo}>{t("errNota")}</p>
          <p className={s.falloSalida}>{t("errNotaAyuda")}</p>
        </div>
      )}

      <Button type="submit" disabled={caducado || estado === "enviando"}>
        <IconCandado size={20} />
        {estado === "enviando" ? t("cifrando") : t("enviarCifrado")}
      </Button>

      <p className={s.notaLateral}>{t("notaPie")}</p>
    </form>
  );
}
