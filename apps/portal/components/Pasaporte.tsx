"use client";

import { useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { renderSVG } from "uqr";
import { cargarCripto, deBase64, firmaValida, type Cripto } from "@barkandmeow/crypto";
import {
  DESTINOS,
  REVISADO,
  aCalendario,
  declarado,
  evaluarViaje,
  recordatoriosViaje,
  registroClinico,
  type Declarado,
  type Destino,
  type PasaporteDueno,
  type Requisito,
} from "@barkandmeow/schema";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { IconAlert, IconCheck } from "@barkandmeow/ui-web/parts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@barkandmeow/ui-web/components/alert-dialog";
import { Button } from "@barkandmeow/ui-web/components/button";
import { Input } from "@barkandmeow/ui-web/components/input";
import { Label } from "@barkandmeow/ui-web/components/label";
import { toast } from "@barkandmeow/ui-web/components/sonner";
import { Recuperar } from "@/components/Bandeja";
import { listarEnlaces, retirarEnlace, type Enlace } from "@/lib/api";
import { leerClave } from "@/lib/claves";
import { CRYPTO_WASM_URL } from "@/lib/crypto-url";
import { fecha } from "@/lib/fecha";
import { abrirPasaporte, compartir, esConflicto, evaluables, guardar, nuevosDeLaBandeja, resumenRegistro, sinRepetidos } from "@/lib/pasaporte";
import s from "./portal.module.css";

/* Pasaporte de viaje: la copia digital del pasaporte europeo, con lo que
   certifica la clínica separado de lo que apunta el dueño, y lo que falta
   para un viaje concreto. Todo se abre y se cifra aquí; el servidor guarda
   bytes. En la frontera vale el pasaporte de papel: la pantalla lo dice. */

let criptoCargada: Promise<Cripto> | null = null;
const cripto = () => (criptoCargada ??= cargarCripto(fetch(CRYPTO_WASM_URL)));

const igual = (a: Uint8Array | null, b: Uint8Array | null) =>
  !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);

const ESPECIES = [
  ["dog", "Perro"],
  ["cat", "Gato"],
  ["ferret", "Hurón"],
  ["rabbit", "Conejo"],
  ["bird", "Ave"],
  ["rodent", "Roedor"],
  ["reptile", "Reptil"],
] as const;

type Listo = { c: Cripto; secreta: Uint8Array; datos: PasaporteDueno; version: number };
type Estado = { tipo: "mirando" } | { tipo: "falta" } | { tipo: "error" } | ({ tipo: "listo" } & Listo);

export function Pasaporte({
  petId,
  nombre,
  chipPista,
  pubKey,
}: {
  petId: string;
  nombre: string;
  chipPista: string | null;
  pubKey: string;
}) {
  const [estado, setEstado] = useState<Estado>({ tipo: "mirando" });
  const publica = deBase64(pubKey);

  async function cargar(secreta: Uint8Array) {
    try {
      const c = await cripto();
      let { datos, version } = await abrirPasaporte(c, secreta, petId);
      // Lo que envió la clínica y espera en la bandeja entra en el pasaporte.
      const limpio = sinRepetidos(datos);
      const nuevos = await nuevosDeLaBandeja(c, secreta, petId, chipPista, limpio ?? datos);
      if (limpio || nuevos.length) {
        datos = { ...(limpio ?? datos), certificados: [...(limpio ?? datos).certificados, ...nuevos] };
        version = await guardar(c, secreta, petId, datos, version);
      }
      if (nuevos.length) {
        toast(nuevos.length === 1 ? "Un registro nuevo de tu clínica" : `${nuevos.length} registros nuevos de tu clínica`, {
          description: "Firmados por la clínica y guardados en el pasaporte.",
        });
      }
      setEstado({ tipo: "listo", c, secreta, datos, version });
    } catch {
      setEstado({ tipo: "error" });
    }
  }

  useEffect(() => {
    void (async () => {
      const [c, local] = await Promise.all([cripto(), leerClave()]);
      if (local && igual(c.publica(local.secreta), publica)) await cargar(local.secreta);
      else setEstado({ tipo: "falta" });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId, pubKey]);

  /** Aplica un cambio y lo guarda. Si otro navegador guardó antes, relee y lo aplica encima. */
  async function cambiar(mutar: (d: PasaporteDueno) => PasaporteDueno): Promise<boolean> {
    if (estado.tipo !== "listo") return false;
    const { c, secreta } = estado;
    let { datos, version } = estado;
    for (let intento = 0; intento < 2; intento++) {
      try {
        const nuevo = mutar(datos);
        const v = await guardar(c, secreta, petId, nuevo, version);
        setEstado({ tipo: "listo", c, secreta, datos: nuevo, version: v });
        return true;
      } catch (e) {
        if (!esConflicto(e)) break;
        ({ datos, version } = await abrirPasaporte(c, secreta, petId));
      }
    }
    toast("No se ha podido guardar", { description: "Vuelve a intentarlo en un momento." });
    return false;
  }

  if (estado.tipo === "mirando")
    return (
      <p className={ui.panelNote} role="status">
        Abriendo el pasaporte…
      </p>
    );
  if (estado.tipo === "falta")
    return <Recuperar publica={publica} alRecuperar={cargar} que="El pasaporte" />;
  if (estado.tipo === "error")
    return (
      <div className={ui.alertBlock} role="alert">
        No se ha podido abrir el pasaporte. Comprueba la conexión y vuelve a cargar la página.
      </div>
    );

  return (
    <>
      <Viaje estado={estado} nombre={nombre} />
      <Registros estado={estado} cambiar={cambiar} />
      <Datos datos={estado.datos} cambiar={cambiar} chipPista={chipPista} />
      <Compartir petId={petId} nombre={nombre} estado={estado} />
    </>
  );
}

/* ── Preparar un viaje ─────────────────────────────────────── */

const icono: Record<Requisito["estado"], "hecho" | "falta" | "aviso" | "info"> = {
  ok: "hecho",
  falta: "falta",
  aviso: "aviso",
  info: "info",
};
const leido: Record<Requisito["estado"], string> = { ok: "Hecho: ", falta: "Falta: ", aviso: "Atención: ", info: "Información: " };

function enUnaSemana() {
  const d = new Date(Date.now() + 7 * 864e5);
  d.setHours(10, 0, 0, 0);
  const dd = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}T10:00`;
}

function Viaje({ estado, nombre }: { estado: Listo; nombre: string }) {
  const ids = useId();
  const [destino, setDestino] = useState<Destino>("ue");
  const [llegada, setLlegada] = useState(enUnaSemana);
  const requisitos = useMemo(() => {
    const d = new Date(llegada);
    if (Number.isNaN(d.getTime())) return [];
    return evaluarViaje(estado.datos, evaluables(estado.c, estado.datos), destino, d);
  }, [estado, destino, llegada]);
  const faltan = requisitos.filter((r) => r.estado === "falta").length;
  const recordatorios = useMemo(() => {
    const d = new Date(llegada);
    if (Number.isNaN(d.getTime())) return [];
    return recordatoriosViaje(estado.datos, evaluables(estado.c, estado.datos), destino, d, nombre);
  }, [estado, destino, llegada, nombre]);

  /* El calendario se genera aquí y se descarga: ni el servidor sabe las fechas
     ni hace falta darle permiso a nadie para escribir en tu calendario. */
  function descargarRecordatorios() {
    const ics = aCalendario(recordatorios);
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `viaje-${(nombre || "mascota").toLowerCase().replace(/[^a-z0-9ñáéíóúü]+/g, "-")}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Recordatorios descargados", { description: "Ábrelo para añadirlos a tu calendario." });
  }

  return (
    <section className={ui.panel} aria-labelledby={`${ids}-t`}>
      <h2 id={`${ids}-t`} className={ui.panelTitle}>
        Preparar un viaje
      </h2>
      <div className={s.viajeCampos}>
        <div className={ui.field}>
          <Label htmlFor={`${ids}-destino`}>Destino</Label>
          <select
            id={`${ids}-destino`}
            className={s.selector}
            value={destino}
            onChange={(e) => setDestino(e.target.value as Destino)}
          >
            {(Object.keys(DESTINOS) as Destino[]).map((d) => (
              <option key={d} value={d}>
                {DESTINOS[d].nombre}
              </option>
            ))}
          </select>
          <span className={ui.hint}>{DESTINOS[destino].detalle}</span>
        </div>
        <div className={ui.field}>
          <Label htmlFor={`${ids}-llegada`}>Llegada al destino</Label>
          <Input id={`${ids}-llegada`} type="datetime-local" value={llegada} onChange={(e) => setLlegada(e.target.value)} />
        </div>
      </div>

      <p className={s.viajeResumen} role="status">
        {faltan === 0 ? (
          <>
            <IconCheck size={16} /> Con lo que consta, no falta nada obligatorio.
          </>
        ) : (
          <>
            <IconAlert size={15} /> {faltan === 1 ? "Falta 1 requisito." : `Faltan ${faltan} requisitos.`}
          </>
        )}
      </p>
      <ul className={s.pasosLista}>
        {requisitos.map((r) => (
          <li key={r.clave} className={s.paso}>
            <span className={`${s.pasoIcono} ${s[`paso_${icono[r.estado]}`]}`} aria-hidden="true">
              {r.estado === "ok" ? <IconCheck size={16} /> : r.estado === "aviso" ? <IconAlert size={15} /> : null}
            </span>
            <div className={s.pasoTexto}>
              <span className={s.pasoTitulo}>
                <span className="sr-only">{leido[r.estado]}</span>
                {r.titulo}
                {r.origen && (
                  <span className={`${s.origen} ${r.origen === "certificado" ? s.origenClinica : ""}`}>
                    {r.origen === "certificado" ? "Firmado por la clínica" : "Declarado por ti"}
                  </span>
                )}
              </span>
              <span className={s.pasoDetalle}>{r.detalle}</span>
            </div>
          </li>
        ))}
      </ul>

      {recordatorios.length > 0 && (
        <div className={s.recordatorios}>
          <ul className={s.recordatoriosLista}>
            {recordatorios.map((r) => (
              <li key={r.clave}>
                <span className={s.dato}>{fecha(r.inicio.toISOString())}</span> · {r.titulo}
              </li>
            ))}
          </ul>
          <Button type="button" variant="outline" size="md" className="self-start" onClick={descargarRecordatorios}>
            Añadir al calendario
          </Button>
        </div>
      )}

      <p className={ui.panelNote}>
        Es una ayuda para preparar el viaje, no un certificado: en la frontera vale el pasaporte
        europeo de papel. Requisitos revisados el {fecha(REVISADO)}; cambian, así que compruébalos
        antes de salir en{" "}
        {DESTINOS[destino].fuentes.map((f, i) => (
          <span key={f.url}>
            {i > 0 && (i === DESTINOS[destino].fuentes.length - 1 ? " y " : ", ")}
            <a href={f.url} target="_blank" rel="noreferrer">
              {f.nombre}
            </a>
          </span>
        ))}
        .
      </p>
    </section>
  );
}

/* ── Registros ─────────────────────────────────────────────── */

type Fila = { id: string; certificado: boolean; titulo: string; detalle: string; firma?: string; declarado?: Declarado };

function Registros({ estado, cambiar }: { estado: Listo; cambiar: (m: (d: PasaporteDueno) => PasaporteDueno) => Promise<boolean> }) {
  const ids = useId();
  const filas: Fila[] = [
    ...estado.datos.certificados.flatMap((x) => {
      const p = registroClinico.safeParse(JSON.parse(x.registro));
      if (!p.success || p.data.tipo === "informe") return [];
      const ok = firmaValida(estado.c, x);
      const { titulo, detalle } = resumenRegistro(p.data);
      return [
        {
          id: x.id,
          certificado: ok,
          titulo,
          detalle,
          firma: ok
            ? `Firmado por ${x.origen.clinica}${x.origen.dominio ? ` · ${x.origen.dominio}` : ""} · firma comprobada`
            : "La firma no cuadra: no cuenta para el viaje",
        },
      ];
    }),
    ...estado.datos.declarados.map((d) => ({ id: d.id, certificado: false, ...resumenRegistro(d.registro), declarado: d })),
  ];

  return (
    <section className={ui.panel} aria-labelledby={`${ids}-t`}>
      <h2 id={`${ids}-t`} className={ui.panelTitle}>
        Vacunas, tratamientos y análisis
      </h2>
      {filas.length === 0 ? (
        <p className={ui.panelNote}>
          Todavía no hay nada. Si tu clínica tiene su software conectado a Bark &amp; Meow y le
          has dado acceso permanente, lo que registre llega firmado a tu bandeja y se guarda aquí.
          Mientras tanto, puedes apuntarlo a mano desde tu pasaporte de papel.
        </p>
      ) : (
        <ul className={s.registros}>
          {filas.map((f) => (
            <li key={f.id} className={s.registro}>
              <div className={s.registroTexto}>
                <span className={s.pasoTitulo}>{f.titulo}</span>
                <span className={s.pasoDetalle}>{f.detalle}</span>
                <span className={`${s.origen} ${f.certificado ? s.origenClinica : ""}`}>
                  {f.firma ?? "Declarado por ti · no lo firma ninguna clínica"}
                </span>
              </div>
              {f.declarado && (
                <BorrarDeclarado
                  titulo={f.titulo}
                  alBorrar={() => cambiar((d) => ({ ...d, declarados: d.declarados.filter((x) => x.id !== f.id) }))}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      <NuevoDeclarado
        alGuardar={(registro) =>
          cambiar((d) => ({ ...d, declarados: [...d.declarados, { id: crypto.randomUUID(), registro }] }))
        }
      />
    </section>
  );
}

function BorrarDeclarado({ titulo, alBorrar }: { titulo: string; alBorrar: () => Promise<boolean> }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Borrar
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Borrar «{titulo}»?</AlertDialogTitle>
          <AlertDialogDescription>
            Lo apuntaste tú; se borra de este pasaporte. Lo que firma una clínica no se borra desde
            aquí.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>No, volver</AlertDialogCancel>
          <AlertDialogAction onClick={() => void alBorrar()}>Sí, borrar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type TipoManual = "rabia" | "vacuna" | "tenia" | "titulacion";

function NuevoDeclarado({ alGuardar }: { alGuardar: (r: Declarado["registro"]) => Promise<boolean> }) {
  const ids = useId();
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<TipoManual>("rabia");
  const [v, setV] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const campo = (k: string) => ({ value: v[k] ?? "", onChange: (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value }) });

  if (!abierto)
    return (
      <Button type="button" variant="outline" size="md" className="self-start" onClick={() => setAbierto(true)}>
        Apuntar a mano
      </Button>
    );

  async function alEnviar(ev: FormEvent) {
    ev.preventDefault();
    const base = { version: 1 as const, fecha: v.fecha ?? "", clinica: v.clinica ?? "", veterinario: "" };
    const registro =
      tipo === "rabia" || tipo === "vacuna"
        ? { ...base, tipo: "vacuna" as const, enfermedad: tipo === "rabia" ? ("rabia" as const) : ("otra" as const), nombre: v.nombre ?? "", producto: v.producto ?? "", lote: v.lote ?? "", validaHasta: v.validaHasta ?? "" }
        : tipo === "tenia"
          ? { ...base, tipo: "desparasitacion" as const, contra: "equinococo" as const, producto: v.producto ?? "", hora: v.hora ?? "" }
          : { ...base, tipo: "titulacion" as const, resultado: Number((v.resultado ?? "").replace(",", ".")), laboratorio: v.laboratorio ?? "", fechaMuestra: v.fecha ?? "" };
    // Sin chip: lo pone el pasaporte. Un número que no lo es (NaN) no pasa.
    const p = declarado.shape.registro.safeParse(registro);
    if (!p.success) return setError("Revisa los campos: las fechas, la hora y el resultado son obligatorios.");
    setError(null);
    setGuardando(true);
    const ok = await alGuardar(p.data);
    setGuardando(false);
    if (ok) {
      setV({});
      setAbierto(false);
      toast("Apuntado en el pasaporte", { description: "Como declarado por ti." });
    }
  }

  const tipos: [TipoManual, string][] = [
    ["rabia", "Vacuna de la rabia"],
    ["vacuna", "Otra vacuna"],
    ["tenia", "Tratamiento contra la tenia"],
    ["titulacion", "Análisis de anticuerpos"],
  ];

  return (
    <form className={s.formDeclarado} onSubmit={alEnviar} noValidate>
      <p className={ui.panelNote}>
        Cópialo de tu pasaporte de papel. Queda como «declarado por ti»: sirve para recordar
        plazos, pero no lo firma ninguna clínica.
      </p>
      <div className={ui.field}>
        <Label htmlFor={`${ids}-tipo`}>Qué es</Label>
        <select id={`${ids}-tipo`} className={s.selector} value={tipo} onChange={(e) => setTipo(e.target.value as TipoManual)}>
          {tipos.map(([k, t]) => (
            <option key={k} value={k}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div className={ui.fieldRow}>
        <Campo id={`${ids}-fecha`} etiqueta={tipo === "titulacion" ? "Fecha de la muestra" : "Fecha"}>
          <Input id={`${ids}-fecha`} type="date" {...campo("fecha")} />
        </Campo>
        {(tipo === "rabia" || tipo === "vacuna") && (
          <Campo id={`${ids}-valida`} etiqueta="Válida hasta">
            <Input id={`${ids}-valida`} type="date" {...campo("validaHasta")} />
          </Campo>
        )}
        {tipo === "tenia" && (
          <Campo id={`${ids}-hora`} etiqueta="Hora">
            <Input id={`${ids}-hora`} type="time" {...campo("hora")} />
          </Campo>
        )}
        {tipo === "titulacion" && (
          <Campo id={`${ids}-resultado`} etiqueta="Resultado (UI/ml)">
            <Input id={`${ids}-resultado`} inputMode="decimal" {...campo("resultado")} />
          </Campo>
        )}
      </div>
      {tipo === "vacuna" && (
        <Campo id={`${ids}-nombre`} etiqueta="Contra qué">
          <Input id={`${ids}-nombre`} placeholder="Moquillo, parvovirosis…" {...campo("nombre")} />
        </Campo>
      )}
      <div className={ui.fieldRow}>
        {tipo === "titulacion" ? (
          <Campo id={`${ids}-lab`} etiqueta="Laboratorio">
            <Input id={`${ids}-lab`} {...campo("laboratorio")} />
          </Campo>
        ) : (
          <Campo id={`${ids}-producto`} etiqueta="Producto">
            <Input id={`${ids}-producto`} {...campo("producto")} />
          </Campo>
        )}
        {(tipo === "rabia" || tipo === "vacuna") && (
          <Campo id={`${ids}-lote`} etiqueta="Lote">
            <Input id={`${ids}-lote`} {...campo("lote")} />
          </Campo>
        )}
      </div>
      <Campo id={`${ids}-clinica`} etiqueta="Clínica (opcional)">
        <Input id={`${ids}-clinica`} {...campo("clinica")} />
      </Campo>
      {error && (
        <p className={ui.fieldError} role="alert">
          {error}
        </p>
      )}
      <div className={ui.actions}>
        <Button type="submit" size="md" disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar"}
        </Button>
        <Button type="button" variant="outline" size="md" onClick={() => setAbierto(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function Campo({ id, etiqueta, children }: { id: string; etiqueta: string; children: ReactNode }) {
  return (
    <div className={ui.field}>
      <Label htmlFor={id}>{etiqueta}</Label>
      {children}
    </div>
  );
}

/* ── Datos del pasaporte de papel ──────────────────────────── */

function Datos({
  datos,
  cambiar,
  chipPista,
}: {
  datos: PasaporteDueno;
  cambiar: (m: (d: PasaporteDueno) => PasaporteDueno) => Promise<boolean>;
  chipPista: string | null;
}) {
  const ids = useId();
  const [especie, setEspecie] = useState<string>(datos.especie);
  const [chip, setChip] = useState(datos.chip);
  const [numero, setNumero] = useState(datos.numeroPasaporte);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function alEnviar(ev: FormEvent) {
    ev.preventDefault();
    const limpio = chip.replace(/[\s.-]/g, "");
    if (limpio && !/^[0-9A-Za-z]{6,23}$/.test(limpio)) return setError("Revisa el número de chip.");
    if (limpio && chipPista && !limpio.endsWith(chipPista))
      return setError(`Ese chip no acaba en ${chipPista}, que es el de esta mascota.`);
    setError(null);
    setGuardando(true);
    const ok = await cambiar((d) => ({
      ...d,
      especie: especie as PasaporteDueno["especie"],
      chip: limpio,
      numeroPasaporte: numero.trim(),
    }));
    setGuardando(false);
    if (ok) toast("Datos guardados");
  }

  return (
    <section className={ui.panel} aria-labelledby={`${ids}-t`}>
      <h2 id={`${ids}-t`} className={ui.panelTitle}>
        Datos del pasaporte de papel
      </h2>
      <form className="flex flex-col gap-3" onSubmit={alEnviar} noValidate>
        <div className={ui.fieldRow}>
          <Campo id={`${ids}-especie`} etiqueta="Especie">
            <select id={`${ids}-especie`} className={s.selector} value={especie} onChange={(e) => setEspecie(e.target.value)}>
              {ESPECIES.map(([k, t]) => (
                <option key={k} value={k}>
                  {t}
                </option>
              ))}
            </select>
          </Campo>
          <Campo id={`${ids}-numero`} etiqueta="Número del pasaporte">
            <Input id={`${ids}-numero`} value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="ES…" />
          </Campo>
        </div>
        <Campo id={`${ids}-chip`} etiqueta="Número de chip completo">
          <Input
            id={`${ids}-chip`}
            className="font-mono"
            inputMode="numeric"
            value={chip}
            onChange={(e) => setChip(e.target.value)}
            placeholder={chipPista ? `··· ${chipPista}` : ""}
          />
        </Campo>
        <p className={ui.panelNote}>
          Bark &amp; Meow no guarda el chip en claro: aquí va cifrado, para que quien abra el enlace
          del viaje pueda compararlo con el que lee su lector.
        </p>
        {error && (
          <p className={ui.fieldError} role="alert">
            {error}
          </p>
        )}
        <Button type="submit" size="md" className="self-start" disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar"}
        </Button>
      </form>
    </section>
  );
}

/* ── Compartir para el viaje ───────────────────────────────── */

const DURACIONES: [24 | 72 | 168, string][] = [
  [24, "24 horas"],
  [72, "3 días"],
  [168, "7 días"],
];

function Compartir({ petId, nombre, estado }: { petId: string; nombre: string; estado: Listo }) {
  const ids = useId();
  const [horas, setHoras] = useState<24 | 72 | 168>(72);
  const [creando, setCreando] = useState(false);
  const [hecho, setHecho] = useState<{ url: string; caduca: string } | null>(null);
  const [enlaces, setEnlaces] = useState<Enlace[]>([]);

  const recargar = () => listarEnlaces(petId).then((r) => setEnlaces(r.enlaces)).catch(() => {});
  useEffect(() => {
    void recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId]);

  async function crear() {
    setCreando(true);
    try {
      const r = await compartir(estado.c, petId, nombre, estado.datos, horas);
      setHecho(r);
      await recargar();
    } catch {
      toast("No se ha podido crear el enlace", { description: "Vuelve a intentarlo en un momento." });
    } finally {
      setCreando(false);
    }
  }

  async function retirar(id: string) {
    try {
      await retirarEnlace(petId, id);
      if (hecho?.url.includes(id)) setHecho(null);
      await recargar();
      toast("Enlace retirado", { description: "Ya no se abre. Lo que alguien descargó no vuelve." });
    } catch {
      toast("No se ha podido retirar");
    }
  }

  async function copiar() {
    if (!hecho) return;
    try {
      await navigator.clipboard.writeText(hecho.url);
      toast("Enlace copiado");
    } catch {
      toast("No se ha podido copiar", { description: "Selecciónalo y cópialo a mano." });
    }
  }

  return (
    <section className={ui.panel} aria-labelledby={`${ids}-t`}>
      <h2 id={`${ids}-t`} className={ui.panelTitle}>
        Enseñarlo en el viaje
      </h2>
      <p className={ui.panelNote}>
        Un QR que abre este pasaporte en el móvil del veterinario de frontera o de la compañía, en
        su idioma. Comprueba allí mismo qué firmó cada clínica. Caduca solo, y puedes retirarlo
        antes.
      </p>

      {hecho ? (
        <div className={s.qr}>
          {/* El QR se dibuja aquí: el enlace lleva la clave y no sale del navegador. */}
          <div className={s.qrImagen} role="img" aria-label="Código QR del enlace" dangerouslySetInnerHTML={{ __html: renderSVG(hecho.url, { border: 2 }) }} />
          <div className="flex flex-col gap-3">
            <div className={ui.copyBlock}>
              <code className="select-all">{hecho.url}</code>
            </div>
            <p className={ui.panelNote}>
              Válido hasta el {fecha(hecho.caduca)}. Guárdalo ahora: la clave va en el propio enlace
              y no se puede volver a mostrar. Si lo pierdes, crea otro.
            </p>
            <div className={ui.actions}>
              <Button type="button" size="md" onClick={() => void copiar()}>
                Copiar el enlace
              </Button>
              <Button type="button" variant="outline" size="md" onClick={() => setHecho(null)}>
                Hecho
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className={ui.fieldRow}>
          <div className={ui.field}>
            <Label htmlFor={`${ids}-horas`}>Válido durante</Label>
            <select id={`${ids}-horas`} className={s.selector} value={horas} onChange={(e) => setHoras(Number(e.target.value) as 24 | 72 | 168)}>
              {DURACIONES.map(([h, t]) => (
                <option key={h} value={h}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" size="md" className="self-end" disabled={creando} onClick={() => void crear()}>
            {creando ? "Creando…" : "Crear el QR"}
          </Button>
        </div>
      )}

      {enlaces.length > 0 && (
        <ul className={s.registros}>
          {enlaces.map((e) => (
            <li key={e.id} className={s.registro}>
              <div className={s.registroTexto}>
                <span className={s.pasoTitulo}>Enlace del {fecha(e.creado)}</span>
                <span className={s.pasoDetalle}>Válido hasta el {fecha(e.caduca)}</span>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => void retirar(e.id)}>
                Retirar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
