"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { NIVELES, type Idioma } from "@barkandmeow/i18n";
import {
  consultarChip,
  enviarAviso,
  type Consulta,
  identificar,
  normalizar,
  type Identificador,
} from "@/lib/api";
import { Button } from "@barkandmeow/ui-web/components/button";
import { Input } from "@barkandmeow/ui-web/components/input";
import { Label } from "@barkandmeow/ui-web/components/label";
import { Textarea } from "@barkandmeow/ui-web/components/textarea";
import { useIdioma } from "@/lib/idioma";
import { CabeceraVet, Insignia } from "./CabeceraVet";
import { PerfilPublico } from "./ficha/Piezas";
import s from "./consulta.module.css";

type Fase =
  | { tipo: "vacio" }
  | { tipo: "consultando" }
  | { tipo: "existe"; consulta: Consulta }
  | { tipo: "noExiste" }
  | { tipo: "errorFormato" }
  | { tipo: "errorRed"; id: Identificador };

type EstadoAviso = "editando" | "enviando" | "enviado" | "error";

/* Iconos dibujados, trazo redondo, heredando currentColor. */

function IconCheck() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5 9.5 17 19 7.5" />
    </svg>
  );
}

function IconNinguna() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5M8.5 11h5" />
    </svg>
  );
}

function IconEnviar() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12 20 4l-4 16-4.5-6.5z" />
      <path d="m11.5 13.5 8.5-9.5" />
    </svg>
  );
}

export function ConsultaChip() {
  const { idioma, cambiar: cambiarIdioma, t } = useIdioma();
  const [chip, setChip] = useState("");
  const [fase, setFase] = useState<Fase>({ tipo: "vacio" });
  const ultimo = useRef<string | null>(null);
  const enCurso = useRef<AbortController | null>(null);
  const ids = useId();

  /* Desde la presentación se llega con /chip?n=<número>: se rellena y se
     consulta como si lo hubiera escrito el lector. */
  useEffect(() => {
    const n = new URLSearchParams(window.location.search).get("n");
    if (n) alEscribir(n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function consultar(id: Identificador) {
    enCurso.current?.abort();
    const ctl = new AbortController();
    enCurso.current = ctl;
    ultimo.current = id.valor;
    setFase({ tipo: "consultando" });
    try {
      const r = await consultarChip(id, ctl.signal);
      if (ctl.signal.aborted) return;
      setFase(r.existe ? { tipo: "existe", consulta: r } : { tipo: "noExiste" });
    } catch {
      if (ctl.signal.aborted) return;
      ultimo.current = null;
      setFase({ tipo: "errorRed", id });
    }
  }

  /* Los lectores Bluetooth escriben como un teclado: los 15 dígitos llegan de
     golpe. La consulta sale sola al completarse, sin buscar un botón. */
  function alEscribir(valor: string) {
    setChip(valor);
    const limpio = normalizar(valor);
    if (limpio === ultimo.current) return;
    enCurso.current?.abort();
    ultimo.current = null;
    const id = identificar(limpio);
    if (id?.tipo === "iso") {
      void consultar(id);
    } else if (/^\d{16,}$/.test(limpio)) {
      setFase({ tipo: "errorFormato" });
    } else {
      setFase({ tipo: "vacio" });
    }
  }

  function alEnviarChip(e: FormEvent) {
    e.preventDefault();
    const limpio = normalizar(chip);
    if (!limpio) return;
    if (limpio === ultimo.current && fase.tipo !== "errorRed") return;
    const id = identificar(limpio);
    if (id) void consultar(id);
    else setFase({ tipo: "errorFormato" });
  }

  const errorFormato = fase.tipo === "errorFormato";

  return (
    <div className={s.pantalla}>
      <CabeceraVet
        insignia={
          <Insignia tono={0} detalle={NIVELES[idioma]["0.que"]}>
            {NIVELES[idioma]["0"]}
          </Insignia>
        }
        idioma={idioma}
        onIdioma={cambiarIdioma}
        etiquetaIdioma={t("idioma")}
      />

      <main className={s.cuerpo}>
      <div className={s.principal}>
      <h1 className={s.titulo}>{t("consultaVeterinaria")}</h1>
      <form className={s.consulta} onSubmit={alEnviarChip} noValidate>
        <Label htmlFor={`${ids}-chip`}>{t("numeroChip")}</Label>
        {/* Borde de 2px en verde y mono de 18px: se lee desde el otro lado del
            mostrador. Es la única excepción al campo estándar. */}
        <Input
          id={`${ids}-chip`}
          className="h-[52px] border-2 border-brand font-mono text-lg tracking-[0.04em] tabular-nums hover:border-brand aria-invalid:border-alert-ink"
          type="text"
          inputMode="numeric"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          autoFocus
          maxLength={32}
          value={chip}
          onChange={(e) => alEscribir(e.target.value)}
          aria-invalid={errorFormato || undefined}
          aria-describedby={`${ids}-chip-ayuda`}
        />
        <p id={`${ids}-chip-ayuda`} className={s.ayuda}>
          {t("lectoresBluetooth")}
        </p>
      </form>

      <div className={s.resultado} aria-live="polite">
        {fase.tipo === "consultando" && (
          <p className={s.estado}>
            <span className={s.giro} aria-hidden="true" />
            {t("consultando")}
          </p>
        )}

        {fase.tipo === "errorFormato" && (
          <div className={`${s.bloque} ${s.bloqueError}`} role="alert">
            <p className={s.errorMotivo}>{t("errFormato")}</p>
            <p className={s.errorSalida}>{t("errFormatoAyuda")}</p>
          </div>
        )}

        {fase.tipo === "errorRed" && (
          <div className={`${s.bloque} ${s.bloqueError}`} role="alert">
            <p className={s.errorMotivo}>{t("errRed")}</p>
            <p className={s.errorSalida}>{t("errRedAyuda")}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-1.5 self-start"
              onClick={() => void consultar(fase.id)}
            >
              {t("reintentar")}
            </Button>
          </div>
        )}

        {fase.tipo === "noExiste" && (
          <div className={`${s.bloque} ${s.bloqueNeutro}`}>
            <p className={s.bloqueTitulo}>
              <IconNinguna />
              {t("noExisteFicha")}
            </p>
            <p className={s.bloqueTexto}>{t("noExisteDetalle")}</p>
          </div>
        )}

        {fase.tipo === "existe" && (
          <>
            <div className={`${s.bloque} ${s.bloqueExiste}`}>
              <p className={s.bloqueTitulo}>
                <IconCheck />
                {t("existeFicha")}
              </p>
              <p className={s.bloqueTexto}>{t("existeFichaDetalle")}</p>
            </div>
            {/* Lo que el dueño publicó por si se pierde: foto, bio y a quién
                llamar. Si no publicó nada, el nivel 0 sigue sin contacto. */}
            {fase.consulta.perfil && <PerfilPublico perfil={fase.consulta.perfil} t={t} conFoto />}
          </>
        )}
      </div>
      </div>

      {/* Avisar al dueño va en la columna de acción: la misma de 360px que
          ocupan las acciones en /e y la nota en /s. */}
      {fase.tipo === "existe" && (
        <aside className={s.lateral}>
          <AvisoTutor key={fase.consulta.aviso} consulta={fase.consulta} t={t} idioma={idioma} />
        </aside>
      )}
      </main>

      <footer className={s.pie}>{t("descargo")}</footer>
    </div>
  );
}

function AvisoTutor({
  consulta,
  t,
  idioma,
}: {
  consulta: Consulta;
  t: (clave: string) => string;
  idioma: Idioma;
}) {
  const [clinica, setClinica] = useState("");
  const [telefono, setTelefono] = useState("");
  const [motivo, setMotivo] = useState("");
  const [intentado, setIntentado] = useState(false);
  const [estado, setEstado] = useState<EstadoAviso>("editando");
  const ids = useId();

  const faltaClinica = intentado && !clinica.trim();
  const faltaTelefono = intentado && !telefono.trim();

  async function alEnviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIntentado(true);
    if (!clinica.trim() || !telefono.trim()) {
      const campo = !clinica.trim() ? `${ids}-clinica` : `${ids}-telefono`;
      document.getElementById(campo)?.focus();
      return;
    }
    setEstado("enviando");
    try {
      await enviarAviso(consulta, {
        clinica: clinica.trim(),
        telefono: telefono.trim(),
        motivo: motivo.trim(),
        idioma,
      });
      setEstado("enviado");
    } catch {
      setEstado("error");
    }
  }

  if (estado === "enviado") {
    return (
      <div className={`${s.bloque} ${s.bloqueExiste}`} role="status">
        <p className={s.bloqueTitulo}>
          <IconCheck />
          {t("avisoEnviado")}
        </p>
        <p className={s.bloqueTexto}>{t("avisoEnviadoDetalle")}</p>
      </div>
    );
  }

  return (
    <form className={s.aviso} onSubmit={alEnviar} noValidate aria-labelledby={`${ids}-titulo`}>
      <h2 id={`${ids}-titulo`} className={s.etiqueta}>
        {t("avisarTutor")}
      </h2>

      <div className={s.grupo}>
        <Label className="font-normal" htmlFor={`${ids}-clinica`}>
          {t("clinica")}
        </Label>
        <Input
          id={`${ids}-clinica`}
          type="text"
          autoComplete="organization"
          placeholder={t("nombreClinica")}
          value={clinica}
          onChange={(e) => setClinica(e.target.value)}
          aria-invalid={faltaClinica || undefined}
          aria-describedby={faltaClinica ? `${ids}-clinica-error` : undefined}
          required
        />
        {faltaClinica && (
          <p id={`${ids}-clinica-error`} className={s.faltaDato}>
            {t("campoObligatorio")}
          </p>
        )}
      </div>

      <div className={s.grupo}>
        <Label className="font-normal" htmlFor={`${ids}-telefono`}>
          {t("telefono")}
        </Label>
        <Input
          id={`${ids}-telefono`}
          className="font-mono tabular-nums"
          type="tel"
          autoComplete="tel"
          placeholder={t("telefonoEjemplo")}
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          aria-invalid={faltaTelefono || undefined}
          aria-describedby={faltaTelefono ? `${ids}-telefono-error` : undefined}
          required
        />
        {faltaTelefono && (
          <p id={`${ids}-telefono-error`} className={s.faltaDato}>
            {t("campoObligatorio")}
          </p>
        )}
      </div>

      <div className={s.grupo}>
        <Label className="font-normal" htmlFor={`${ids}-motivo`}>
          {t("motivoOpcional")}
        </Label>
        <Textarea
          id={`${ids}-motivo`}
          rows={3}
          lang={idioma}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
      </div>

      {estado === "error" && (
        <div className={`${s.bloque} ${s.bloqueError}`} role="alert">
          <p className={s.errorMotivo}>{t("errAviso")}</p>
          <p className={s.errorSalida}>{t("errAvisoAyuda")}</p>
        </div>
      )}

      <Button type="submit" disabled={estado === "enviando"}>
        <IconEnviar />
        {estado === "enviando" ? t("enviando") : t("enviarAviso")}
      </Button>

      <p className={s.nota}>{t("avisoPie")}</p>
    </form>
  );
}
