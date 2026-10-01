"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { IconAlert, IconCheck } from "@barkandmeow/ui-web/parts";
import { Button } from "@barkandmeow/ui-web/components/button";
import { Checkbox } from "@barkandmeow/ui-web/components/checkbox";
import { Input } from "@barkandmeow/ui-web/components/input";
import { Label } from "@barkandmeow/ui-web/components/label";
import s from "@/app/console.module.css";
import { IconChip, IconClock, IconQuestion } from "@/components/iconos";
import { EditorEtiqueta } from "@/components/Pacientes";
import {
  abrirReclamacion,
  activarMascota,
  consultarChip,
  ErrorApi,
  estadoAlta,
  pedirAlta,
} from "@/lib/api";
import { dia, identificar } from "@/lib/chip";
import type { Etiquetas } from "@/lib/etiquetas";

/* El mostrador: un solo campo de chip que lo hace todo (decidido 2026-10-01).

   Se lee el chip con el animal delante y la consola dice qué toca:
   · solo hay un registro pendiente → activarlo con el código del dueño;
   · está activo y la clínica no tiene permiso → pedir el alta de nivel 3, que
     el dueño aprueba comparando un número de seis dígitos;
   · ya es paciente → nada que hacer, salvo ponerle nombre.

   El chip no es secreto (sale en pasaportes y facturas): por eso activar pide
   el código que solo ve el dueño, y si el chip ya está a nombre de otra
   persona se abre una reclamación de 14 días. El número del alta sale de la
   clave de la clínica, de la del dueño y de la petición: si alguien se hubiera
   puesto en medio no coincidiría, y por eso se dice en voz alta. */

type Paso =
  | { tipo: "leer" }
  | { tipo: "sin-registro" }
  | { tipo: "reclamada" }
  | { tipo: "pendiente" }
  | { tipo: "activada" }
  | { tipo: "ya-activo" }
  | { tipo: "reclamacion"; plazo: string }
  | { tipo: "activa"; conCodigo: boolean }
  | { tipo: "esperando"; requestId: string; sas: string; caduca: string }
  | { tipo: "rechazada" }
  | { tipo: "caducada" }
  | { tipo: "paciente"; petId: string | null; nuevo: boolean };

type Fallo = { titulo: string; salida: string };

function falloDe(e: unknown): Fallo {
  const estado = e instanceof ErrorApi ? e.estado : 0;
  const motivo = e instanceof ErrorApi ? e.datos.motivo : null;
  if (estado === 401)
    return { titulo: "La sesión de la clínica ha caducado.", salida: "Vuelve a entrar y lee el chip otra vez." };
  if (motivo === "correo-sin-verificar")
    return { titulo: "La clínica aún no está activa.", salida: "Confirma el correo del administrador con el código que os enviamos." };
  if (motivo === "dominio-sin-verificar")
    return {
      titulo: "Solo una clínica con dominio propio verificado abre reclamaciones.",
      salida: "Reclamar congela la ficha de otra persona: escribidnos y lo revisamos a mano.",
    };
  if (motivo === "sin-registro")
    return {
      titulo: "Este chip no tiene ningún registro pendiente.",
      salida: "El dueño tiene que registrarlo antes en su app de Bark & Meow; allí verá su código de activación.",
    };
  if (motivo === "codigo-incorrecto")
    return {
      titulo: "El código no corresponde a este chip.",
      salida: "Revísalo en la app del dueño. Si ha caducado, puede pedir uno nuevo desde la app.",
    };
  if (motivo === "ya-reclamado")
    return { titulo: "Ya hay una reclamación abierta sobre este chip.", salida: "Se resolverá al terminar su plazo. No hace falta abrir otra." };
  if (estado === 404)
    return { titulo: "Este chip ya no tiene ficha activa.", salida: "Lee el chip otra vez para ver qué toca." };
  if (estado === 429)
    return { titulo: "Demasiadas lecturas seguidas.", salida: "Espera un minuto y vuelve a intentarlo." };
  if (estado === 0) return { titulo: "No hay conexión con Bark & Meow.", salida: "Vuelve a intentarlo en un momento." };
  return { titulo: "No se ha podido completar.", salida: "Lee el chip otra vez y vuelve a intentarlo." };
}

const minutos = (ms: number) => {
  const seg = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, "0")}`;
};

/** Cada cuánto se pregunta por la respuesta del dueño. */
const SONDEO_MS = 3000;

type Tono = "ok" | "nivel3" | "falta" | "neutro";
const clasePorTono: Record<Tono, string> = { ok: s.vOk, nivel3: s.vNivel3, falta: s.vFalta, neutro: s.vNeutro };

/** Lo que la consola responde a un chip: qué pasa, en una línea, y qué toca. */
function Veredicto({
  tono,
  icono,
  titulo,
  children,
}: {
  tono: Tono;
  icono: ReactNode;
  titulo: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={`${s.veredicto} ${clasePorTono[tono]}`}>
      <span className={s.veredictoIcono}>{icono}</span>
      <div className={s.veredictoCuerpo}>
        <h2 className={s.veredictoTitulo}>{titulo}</h2>
        {children}
      </div>
    </div>
  );
}

export function Mostrador({
  pubKeyClinica,
  activa,
  etiquetas,
  nombreDe,
  onPaciente,
  onNombre,
}: {
  pubKeyClinica: string;
  /** La clínica ha verificado el correo: sin eso no activa ni pide altas. */
  activa: boolean;
  etiquetas: Etiquetas;
  nombreDe: (petId: string) => string | null;
  onPaciente: (petId: string | null) => void;
  onNombre: (petId: string, texto: string | null) => void;
}) {
  const router = useRouter();
  const [chip, setChip] = useState("");
  const [codigo, setCodigo] = useState("");
  const [paso, setPaso] = useState<Paso>({ tipo: "leer" });
  const [fallo, setFallo] = useState<Fallo | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [intentado, setIntentado] = useState(false);
  const [codigoIntentado, setCodigoIntentado] = useState(false);
  const [comprobado, setComprobado] = useState(false);
  const [renombrando, setRenombrando] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());
  const ids = useId();
  const campoChip = useRef<HTMLInputElement>(null);

  const id = identificar(chip);
  const codigoLimpio = codigo.toUpperCase().replace(/[\s-]/g, "");
  const faltaChip = intentado && !id;
  const faltaCodigo = codigoIntentado && codigoLimpio.length !== 8;
  const esperando = paso.tipo === "esperando" ? paso : null;

  function limpiar() {
    setCodigo("");
    setFallo(null);
    setCodigoIntentado(false);
    setComprobado(false);
    setRenombrando(false);
  }

  function otro() {
    setChip("");
    setIntentado(false);
    limpiar();
    setPaso({ tipo: "leer" });
    onPaciente(null);
    setTimeout(() => campoChip.current?.focus(), 0);
  }

  async function comprobar(ev: FormEvent) {
    ev.preventDefault();
    setIntentado(true);
    if (!id || ocupado) return;
    limpiar();
    setOcupado(true);
    try {
      const r = await consultarChip(id);
      onPaciente(r.situacion === "paciente" ? r.petId : null);
      if (r.situacion === "paciente") setPaso({ tipo: "paciente", petId: r.petId, nuevo: false });
      else if (r.situacion === "activa") setPaso({ tipo: "activa", conCodigo: false });
      else setPaso({ tipo: r.situacion });
    } catch (e) {
      setPaso({ tipo: "leer" });
      setFallo(falloDe(e));
    } finally {
      setOcupado(false);
    }
  }

  async function activar(ev: FormEvent) {
    ev.preventDefault();
    setCodigoIntentado(true);
    if (!id || codigoLimpio.length !== 8) return;
    setOcupado(true);
    setFallo(null);
    try {
      await activarMascota(id, codigoLimpio);
      setPaso({ tipo: "activada" });
    } catch (e) {
      const motivo = e instanceof ErrorApi ? e.datos.motivo : null;
      if (motivo === "ya-activo") setPaso({ tipo: "ya-activo" });
      else setFallo(falloDe(e));
    } finally {
      setOcupado(false);
    }
  }

  async function reclamar() {
    if (!id || !comprobado) return;
    setOcupado(true);
    setFallo(null);
    try {
      const r = await abrirReclamacion(id, codigoLimpio);
      setPaso({ tipo: "reclamacion", plazo: r.plazo });
    } catch (e) {
      setFallo(falloDe(e));
    } finally {
      setOcupado(false);
    }
  }

  async function pedir() {
    if (!id) return;
    setOcupado(true);
    setFallo(null);
    try {
      const r = await pedirAlta(id, pubKeyClinica);
      setAhora(Date.now());
      setPaso({ tipo: "esperando", requestId: r.requestId, sas: r.sas, caduca: r.caduca });
    } catch (e) {
      setFallo(falloDe(e));
    } finally {
      setOcupado(false);
    }
  }

  // Mientras el número está en pantalla: se pregunta por la respuesta y corre el reloj.
  useEffect(() => {
    if (!esperando) return;
    let vivo = true;
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    const sondeo = setInterval(() => {
      void estadoAlta(esperando.requestId)
        .then(async (r) => {
          if (!vivo || r.estado === "pending") return;
          if (r.estado === "rejected") return setPaso({ tipo: "rechazada" });
          if (r.estado === "expired") return setPaso({ tipo: "caducada" });
          // Aprobada: el chip ya es de un paciente, y hace falta su id para ponerle nombre.
          const leido = identificar(chip);
          const ya = leido ? await consultarChip(leido).catch(() => null) : null;
          if (!vivo) return;
          const petId = ya?.situacion === "paciente" ? ya.petId : null;
          setPaso({ tipo: "paciente", petId, nuevo: true });
          onPaciente(petId);
          router.refresh();
        })
        // Un fallo de red suelto no cambia nada: el siguiente sondeo lo reintenta.
        .catch(() => undefined);
    }, SONDEO_MS);
    return () => {
      vivo = false;
      clearInterval(reloj);
      clearInterval(sondeo);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esperando?.requestId]);

  const resta = esperando ? new Date(esperando.caduca).getTime() - ahora : 0;

  const campoCodigo = (
    <div className={ui.field}>
      <Label htmlFor={`${ids}-codigo`}>Código de activación del dueño</Label>
      <Input
        id={`${ids}-codigo`}
        className="h-12 max-w-[16rem] font-mono text-lg uppercase tracking-[0.12em]"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        autoFocus
        maxLength={9}
        placeholder="XXXX-XXXX"
        value={codigo}
        onChange={(e) => {
          setCodigo(e.target.value);
          setFallo(null);
        }}
        aria-invalid={faltaCodigo || undefined}
        aria-describedby={`${ids}-codigo-ayuda`}
      />
      <span id={`${ids}-codigo-ayuda`} className={faltaCodigo ? ui.fieldError : ui.hint}>
        {faltaCodigo ? "El código tiene 8 caracteres." : "Lo ve el dueño en su app, junto a la ficha de la mascota."}
      </span>
    </div>
  );

  const leerOtro = (
    <Button type="button" variant="outline" size="md" onClick={otro}>
      Leer otro chip
    </Button>
  );

  const nombre = paso.tipo === "paciente" && paso.petId ? nombreDe(paso.petId) : null;

  return (
    <section className={s.mostrador} aria-labelledby={`${ids}-titulo`}>
      <div>
        <h1 id={`${ids}-titulo`} className={s.mostradorTitulo}>
          Lee el chip del animal
        </h1>
        <p className={s.mostradorTexto}>
          La consola te dice qué toca: activarlo con el código del dueño, pedirle el acceso
          permanente, o nada si ya es paciente.
        </p>
      </div>

      <form className={s.lectura} onSubmit={comprobar} noValidate>
        <Label htmlFor={`${ids}-chip`}>Número del microchip</Label>
        <div className={s.lecturaFila}>
          {/* Mismo campo que la consulta del veterinario: 52px, mono, lo
              rellena de golpe un lector Bluetooth y lo envía con Intro. */}
          <Input
            ref={campoChip}
            id={`${ids}-chip`}
            className="h-[52px] min-w-0 flex-1 border-2 border-brand font-mono text-lg tracking-[0.04em] tabular-nums hover:border-brand aria-invalid:border-alert-ink"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            autoFocus
            maxLength={32}
            value={chip}
            disabled={!activa || !!esperando}
            onChange={(e) => {
              setChip(e.target.value);
              // Otro número es otro animal: lo que hubiera en pantalla ya no vale.
              if (paso.tipo !== "leer" || fallo) {
                limpiar();
                setPaso({ tipo: "leer" });
                onPaciente(null);
              }
            }}
            aria-invalid={faltaChip || undefined}
            aria-describedby={`${ids}-chip-ayuda`}
          />
          <Button type="submit" disabled={!activa || ocupado || !!esperando}>
            {ocupado && paso.tipo === "leer" ? "Comprobando…" : "Comprobar"}
          </Button>
        </div>
        <span id={`${ids}-chip-ayuda`} className={faltaChip ? ui.fieldError : ui.hint}>
          {faltaChip
            ? "Un microchip ISO tiene 15 dígitos."
            : activa
              ? "Con el lector y el animal delante: el número no se copia de ningún papel."
              : "Disponible cuando el administrador confirme el correo de la clínica."}
        </span>
      </form>

      <div aria-live="polite" className={s.respuesta}>
        {paso.tipo === "sin-registro" && (
          <Veredicto tono="neutro" icono={<IconQuestion />} titulo="Nadie ha registrado este chip">
            <p className={s.veredictoTexto}>
              Su dueño tiene que registrarlo en la app de Bark & Meow o en barkandmeow.app/mi-mascota.
              Al hacerlo verá un código de activación: con el animal aquí, volved a leer el chip.
            </p>
            <div className={ui.actions}>{leerOtro}</div>
          </Veredicto>
        )}

        {paso.tipo === "reclamada" && (
          <Veredicto tono="falta" icono={<IconAlert size={20} />} titulo="Este chip tiene una reclamación abierta">
            <p className={s.veredictoTexto}>
              Dos personas dicen ser su dueño y el registro está congelado hasta que se resuelva, como
              mucho en 14 días. Mientras tanto no se puede activar ni dar de alta.
            </p>
            <div className={ui.actions}>{leerOtro}</div>
          </Veredicto>
        )}

        {paso.tipo === "pendiente" && (
          <Veredicto tono="falta" icono={<IconChip />} titulo="Registrado por su dueño, falta activarlo">
            <p className={s.veredictoTexto}>
              Pídele el código de activación que ve en su app. Con el chip leído aquí y ese código, el
              chip queda a su nombre y nadie más puede quedárselo.
            </p>
            <form className={s.subformulario} onSubmit={activar} noValidate>
              {campoCodigo}
              <div className={ui.actions}>
                <Button type="submit" size="md" disabled={ocupado}>
                  {ocupado ? "Activando…" : "Activar"}
                </Button>
                <Button type="button" variant="ghost" size="md" onClick={otro}>
                  Cancelar
                </Button>
              </div>
            </form>
          </Veredicto>
        )}

        {paso.tipo === "activada" && (
          <Veredicto tono="ok" icono={<IconCheck size={20} />} titulo="Mascota activada">
            <p className={s.veredictoTexto}>
              El chip ya responde en Bark & Meow a nombre de su dueño. Si va a ser paciente vuestro,
              pedidle ahora el acceso permanente: es un minuto, con él delante.
            </p>
            <div className={ui.actions}>
              <Button type="button" size="md" disabled={ocupado} onClick={() => void pedir()}>
                {ocupado ? "Pidiendo…" : "Pedir el alta"}
              </Button>
              {leerOtro}
            </div>
          </Veredicto>
        )}

        {paso.tipo === "ya-activo" && (
          <Veredicto
            tono="falta"
            icono={<IconAlert size={20} />}
            titulo="Este chip ya está activo a nombre de otra persona"
          >
            <p className={s.veredictoTexto}>
              Si quien tenéis delante es el dueño real, podéis abrir una reclamación. El registro actual
              queda congelado —deja de mostrar sus teléfonos a quien encuentre al animal— y su titular
              tiene 14 días para impugnarla. Si no lo hace, el chip pasa a este dueño.
            </p>
            <Label className={ui.check}>
              <Checkbox checked={comprobado} onCheckedChange={(v) => setComprobado(v === true)} />
              He leído el chip del animal que está aquí y he comprobado la documentación de quien lo
              reclama (pasaporte o registro oficial). La reclamación queda a nombre de esta clínica.
            </Label>
            <div className={ui.actions}>
              <Button
                type="button"
                variant="destructive"
                size="md"
                disabled={!comprobado || ocupado}
                onClick={() => void reclamar()}
              >
                {ocupado ? "Abriendo…" : "Abrir reclamación"}
              </Button>
              <Button type="button" variant="ghost" size="md" onClick={otro}>
                Cancelar
              </Button>
            </div>
          </Veredicto>
        )}

        {paso.tipo === "reclamacion" && (
          <Veredicto tono="falta" icono={<IconClock />} titulo="Reclamación abierta">
            <p className={s.veredictoTexto}>
              El registro actual queda congelado y su titular tiene hasta el{" "}
              <strong className={s.fecha}>{dia(paso.plazo)}</strong> para impugnarla. Si no lo hace, el
              chip pasará al dueño que tenéis delante.
            </p>
            <div className={ui.actions}>{leerOtro}</div>
          </Veredicto>
        )}

        {paso.tipo === "activa" && (
          <Veredicto tono="nivel3" icono={<IconChip />} titulo="Tiene ficha, pero aún no es paciente vuestro">
            <p className={s.veredictoTexto}>
              Pídele a su dueño el acceso permanente. Lo aprueba desde su app comparando un número de
              seis dígitos con el que verás aquí, y puede retirarlo cuando quiera.
            </p>
            {!paso.conCodigo ? (
              <div className={ui.actions}>
                <Button type="button" size="md" disabled={ocupado} onClick={() => void pedir()}>
                  {ocupado ? "Pidiendo…" : "Pedir el alta"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  onClick={() => {
                    setFallo(null);
                    setPaso({ tipo: "activa", conCodigo: true });
                  }}
                >
                  El dueño trae un código de activación
                </Button>
              </div>
            ) : (
              <form className={s.subformulario} onSubmit={activar} noValidate>
                <p className={s.veredictoNota}>
                  Un código de activación para un chip que ya está activo quiere decir que otra persona
                  lo registró antes. Compruébalo: si el código es bueno, podréis abrir una reclamación.
                </p>
                {campoCodigo}
                <div className={ui.actions}>
                  <Button type="submit" variant="outline" size="md" disabled={ocupado}>
                    {ocupado ? "Comprobando…" : "Comprobar el código"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="md"
                    onClick={() => {
                      limpiar();
                      setPaso({ tipo: "activa", conCodigo: false });
                    }}
                  >
                    Volver
                  </Button>
                </div>
              </form>
            )}
          </Veredicto>
        )}

        {esperando && (
          <Veredicto tono="nivel3" icono={<IconClock />} titulo="Dile este número al dueño">
            <p className={s.numero}>
              {esperando.sas.slice(0, 3)} {esperando.sas.slice(3)}
            </p>
            <p className={s.veredictoTexto}>
              En su app o en su portal verá la petición de esta clínica con un número. Si es el mismo,
              que apruebe; si no coincide, que la rechace y volved a empezar.
            </p>
            <p className={s.veredictoNota} role="timer">
              {resta > 0 ? `Esperando su respuesta. Caduca en ${minutos(resta)}.` : "Comprobando si ha caducado…"}
            </p>
            <div className={ui.actions}>
              <Button type="button" variant="ghost" size="md" onClick={otro}>
                Cancelar
              </Button>
            </div>
          </Veredicto>
        )}

        {paso.tipo === "rechazada" && (
          <Veredicto tono="falta" icono={<IconAlert size={20} />} titulo="El dueño ha rechazado la petición">
            <p className={s.veredictoTexto}>
              Si fue porque el número no coincidía, no sigáis: pedid el alta de nuevo y comparad otra
              vez.
            </p>
            <div className={ui.actions}>
              <Button type="button" size="md" disabled={ocupado} onClick={() => void pedir()}>
                {ocupado ? "Pidiendo…" : "Pedir el alta de nuevo"}
              </Button>
              {leerOtro}
            </div>
          </Veredicto>
        )}

        {paso.tipo === "caducada" && (
          <Veredicto tono="falta" icono={<IconClock />} titulo="La petición ha caducado sin respuesta">
            <p className={s.veredictoTexto}>
              Dura diez minutos. Pídela de nuevo cuando el dueño tenga su app abierta.
            </p>
            <div className={ui.actions}>
              <Button type="button" size="md" disabled={ocupado} onClick={() => void pedir()}>
                {ocupado ? "Pidiendo…" : "Pedir el alta de nuevo"}
              </Button>
              {leerOtro}
            </div>
          </Veredicto>
        )}

        {paso.tipo === "paciente" && (
          <Veredicto
            tono="ok"
            icono={<IconCheck size={20} />}
            titulo={paso.nuevo ? "Alta concedida" : (nombre ?? "Ya es paciente")}
          >
            <p className={s.veredictoTexto}>
              {paso.nuevo
                ? `El dueño ha aprobado el acceso${nombre ? ` y ${nombre} ya está entre vuestros pacientes` : ": ya está entre vuestros pacientes"}. El software de gestión puede enviarle informes.`
                : nombre
                  ? "Ya es paciente de la clínica: no hay nada que activar ni que pedir."
                  : "No hay nada que activar ni que pedir: su dueño ya os dio el acceso permanente."}
            </p>
            {paso.petId && etiquetas.estado === "con-clave" && (!nombre || renombrando) && (
              <div className={s.subformulario}>
                {!nombre && <p className={s.veredictoPregunta}>¿Cómo lo llamáis en la clínica?</p>}
                <EditorEtiqueta
                  petId={paso.petId}
                  actual={nombre}
                  etiquetas={etiquetas}
                  enfocar={paso.nuevo || renombrando}
                  onCancelar={nombre ? () => setRenombrando(false) : undefined}
                  onGuardada={(t) => {
                    onNombre(paso.petId!, t);
                    setRenombrando(false);
                  }}
                />
              </div>
            )}
            <div className={ui.actions}>
              {leerOtro}
              {paso.petId && etiquetas.estado === "con-clave" && nombre && !renombrando && (
                <Button type="button" variant="ghost" size="md" onClick={() => setRenombrando(true)}>
                  Cambiar el nombre
                </Button>
              )}
            </div>
          </Veredicto>
        )}

        {fallo && (
          <div className={ui.alertBlock} role="alert">
            <strong>{fallo.titulo}</strong>
            {fallo.salida}
          </div>
        )}
      </div>
    </section>
  );
}
