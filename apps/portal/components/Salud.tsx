"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import {
  CRONICAS,
  REACCIONES,
  edadTexto,
  terminoCronica,
  terminoReaccion,
  type AlergiaFicha,
  type CronicaFicha,
  type FichaDueno,
  type Gravedad,
  type MedicacionFicha,
} from "@barkandmeow/schema";
import { toast } from "@barkandmeow/ui-web/components/sonner";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { IconAlert } from "@barkandmeow/ui-web/parts";
import { Button } from "@barkandmeow/ui-web/components/button";
import { Checkbox } from "@barkandmeow/ui-web/components/checkbox";
import { Input } from "@barkandmeow/ui-web/components/input";
import { Label } from "@barkandmeow/ui-web/components/label";
import { Recuperar } from "@/components/Bandeja";
import { fecha } from "@/lib/fecha";
import { useFicha } from "@/lib/ficha";
import s from "./portal.module.css";

/* La ficha de salud: lo que un veterinario que no conoce al animal necesita
   saber en segundos. La escribe el dueño, así que en la web del veterinario
   sale marcada como «declarado por el dueño».

   Cada cosa que se añade o se quita se guarda al momento. Los medicamentos van
   por principio activo, nunca por marca: la marca cambia de un país a otro. */

const ESPECIES = [
  ["dog", "Perro"],
  ["cat", "Gato"],
  ["ferret", "Hurón"],
  ["rabbit", "Conejo"],
  ["bird", "Ave"],
  ["rodent", "Roedor"],
  ["reptile", "Reptil"],
] as const;

const GRAVEDADES: [Gravedad, string][] = [
  ["alta", "Grave"],
  ["media", "Moderada"],
  ["baja", "Leve"],
];
const nombreGravedad = Object.fromEntries(GRAVEDADES) as Record<Gravedad, string>;

const CADA: [number, string][] = [
  [8, "Cada 8 horas"],
  [12, "Cada 12 horas"],
  [24, "Una vez al día"],
  [48, "Cada 2 días"],
  [168, "Una vez a la semana"],
  [720, "Una vez al mes"],
];
const cadaTexto = (h: number) => CADA.find(([x]) => x === h)?.[1].toLowerCase() ?? `cada ${h} horas`;

const hoy = () => new Date().toISOString().slice(0, 10);
const nuevoId = () => crypto.randomUUID();

type Cambiar = (mutar: (d: FichaDueno) => FichaDueno) => Promise<FichaDueno | null>;

function Campo({ id, etiqueta, ayuda, children }: { id: string; etiqueta: string; ayuda?: string; children: ReactNode }) {
  return (
    <div className={ui.field}>
      <Label htmlFor={id}>{etiqueta}</Label>
      {children}
      {ayuda && <span className={ui.hint}>{ayuda}</span>}
    </div>
  );
}

export function Salud({
  petId,
  nombre,
  chipPista,
  pubKey,
  tieneFicha,
}: {
  petId: string;
  nombre: string;
  chipPista: string | null;
  pubKey: string;
  /** Lo que dice el servidor: para refrescar el resumen la primera vez que se guarda. */
  tieneFicha: boolean;
}) {
  const router = useRouter();
  const { estado, cambiar, publica, alRecuperar } = useFicha(petId, pubKey, nombre);

  // La primera vez que se guarda, el resto del portal tiene que enterarse de que ya hay ficha.
  const guardar: Cambiar = async (mutar) => {
    const r = await cambiar(mutar);
    if (r && !tieneFicha) router.refresh();
    return r;
  };

  if (estado.tipo === "mirando")
    return (
      <p className={ui.panelNote} role="status">
        Abriendo la ficha…
      </p>
    );
  if (estado.tipo === "falta") return <Recuperar publica={publica} alRecuperar={alRecuperar} que="La ficha" />;
  if (estado.tipo === "error")
    return (
      <div className={ui.alertBlock} role="alert">
        <strong>No se ha podido abrir la ficha.</strong>
        Comprueba la conexión y vuelve a cargar la página.
      </div>
    );

  const f = estado.datos;
  return (
    <>
      {/* Si lo básico cambia por fuera (la app, otra pestaña), el formulario se rehace con lo nuevo. */}
      <Basico
        key={[f.especie, f.sexo, f.esterilizado, f.raza, f.nacimiento, f.pesoKg, f.chip].join("|")}
        f={f}
        cambiar={guardar}
        nombre={nombre}
        chipPista={chipPista}
      />
      <Alergias f={f} cambiar={guardar} nombre={nombre} />
      <Medicacion f={f} cambiar={guardar} />
      <Cronicas f={f} cambiar={guardar} />
      <Rabia key={f.rabiaHasta} f={f} cambiar={guardar} />
      {f.actualizado && (
        <p className={ui.hint}>
          Guardada por última vez el <span className={s.dato}>{fecha(f.actualizado)}</span>
          {f.placa ? ". La placa del collar enseña ya estos datos." : "."}
        </p>
      )}
    </>
  );
}

/* ── Lo básico ─────────────────────────────────────────────── */

function Basico({ f, cambiar, nombre, chipPista }: { f: FichaDueno; cambiar: Cambiar; nombre: string; chipPista: string | null }) {
  const ids = useId();
  const [especie, setEspecie] = useState(f.especie);
  const [sexo, setSexo] = useState(f.sexo);
  const [esterilizado, setEsterilizado] = useState(f.esterilizado);
  const [raza, setRaza] = useState(f.raza);
  const [nacimiento, setNacimiento] = useState(f.nacimiento);
  const [peso, setPeso] = useState(f.pesoKg);
  const [chip, setChip] = useState(f.chip);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const limpio = chip.replace(/[\s.-]/g, "");
  const cambiado =
    especie !== f.especie ||
    sexo !== f.sexo ||
    esterilizado !== f.esterilizado ||
    raza.trim() !== f.raza ||
    nacimiento !== f.nacimiento ||
    peso.trim() !== f.pesoKg ||
    limpio !== f.chip;

  async function alEnviar(ev: FormEvent) {
    ev.preventDefault();
    if (!sexo) return setError("Marca si es hembra o macho: sin eso la ficha no se puede enseñar.");
    if (peso.trim() && !/^\d{1,3}([.,]\d{1,2})?$/.test(peso.trim())) return setError("El peso, en kilos: por ejemplo 12,4.");
    if (nacimiento && nacimiento > hoy()) return setError("La fecha de nacimiento no puede ser futura.");
    if (limpio && !/^[0-9A-Za-z]{6,23}$/.test(limpio)) return setError("El número de chip no tiene ese formato.");
    if (limpio && chipPista && !limpio.endsWith(chipPista))
      return setError(`Ese número no acaba en ${chipPista}, como el chip de esta mascota. Revísalo.`);
    setError(null);
    setGuardando(true);
    const r = await cambiar((d) => ({
      ...d,
      especie,
      sexo,
      esterilizado,
      raza: raza.trim(),
      nacimiento,
      pesoKg: peso.trim(),
      pesoFecha: peso.trim() === d.pesoKg ? d.pesoFecha : peso.trim() ? hoy() : "",
      chip: limpio,
    }));
    setGuardando(false);
    if (r) toast("Guardado");
  }

  const edad = edadTexto(nacimiento, new Date());

  return (
    <form className={ui.panel} onSubmit={alEnviar} noValidate aria-labelledby={`${ids}-t`}>
      <h2 id={`${ids}-t`} className={ui.panelTitle}>
        Lo básico
      </h2>

      <div className={s.campos}>
        <Campo id={`${ids}-especie`} etiqueta="Especie">
          <select id={`${ids}-especie`} className={s.selector} value={especie} onChange={(e) => setEspecie(e.target.value)}>
            {ESPECIES.map(([c, t]) => (
              <option key={c} value={c}>
                {t}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id={`${ids}-raza`} etiqueta="Raza">
          <Input id={`${ids}-raza`} maxLength={80} placeholder="Mestiza, labrador…" value={raza} onChange={(e) => setRaza(e.target.value)} />
        </Campo>
      </div>

      <fieldset className={s.grupo}>
        <legend className={s.grupoEtiqueta}>Sexo</legend>
        <div className={s.opciones}>
          {(["hembra", "macho"] as const).map((x) => (
            <label key={x} className={s.opcion}>
              <input
                type="radio"
                name={`${ids}-sexo`}
                className="sr-only"
                checked={sexo === x}
                onChange={() => {
                  setSexo(x);
                  setError(null);
                }}
              />
              {x === "hembra" ? "Hembra" : "Macho"}
            </label>
          ))}
        </div>
        <Label className={ui.check}>
          <Checkbox checked={esterilizado} onCheckedChange={(v) => setEsterilizado(v === true)} />
          Está esterilizad{sexo === "macho" ? "o" : sexo === "hembra" ? "a" : "o o esterilizada"}
        </Label>
      </fieldset>

      <div className={s.campos}>
        <Campo
          id={`${ids}-nacimiento`}
          etiqueta="Fecha de nacimiento"
          ayuda={edad ? `Ahora tiene ${edad.toLowerCase()}.` : "Aproximada, si no la sabes."}
        >
          <Input id={`${ids}-nacimiento`} type="date" max={hoy()} value={nacimiento} onChange={(e) => setNacimiento(e.target.value)} />
        </Campo>
        <Campo
          id={`${ids}-peso`}
          etiqueta="Peso, en kilos"
          ayuda={f.pesoFecha && peso.trim() === f.pesoKg ? `Apuntado el ${fecha(f.pesoFecha)}.` : "De él depende la dosis de casi todo."}
        >
          <Input
            id={`${ids}-peso`}
            className="font-mono tabular-nums"
            inputMode="decimal"
            maxLength={6}
            placeholder="12,4"
            value={peso}
            onChange={(e) => setPeso(e.target.value)}
          />
        </Campo>
      </div>

      <Campo
        id={`${ids}-chip`}
        etiqueta="Número completo del microchip"
        ayuda={`Opcional. Viene en su pasaporte y acaba en ${chipPista ?? "las cifras que ves arriba"}. Sirve para que el veterinario compruebe con su lector que es ${nombre || "tu mascota"}.`}
      >
        <Input
          id={`${ids}-chip`}
          className="font-mono tracking-[0.04em] tabular-nums"
          inputMode="numeric"
          autoComplete="off"
          maxLength={32}
          value={chip}
          onChange={(e) => setChip(e.target.value)}
        />
      </Campo>

      {error && (
        <p className={ui.fieldError} role="alert">
          {error}
        </p>
      )}
      <div className={ui.actions}>
        <Button type="submit" size="md" disabled={guardando || (!cambiado && f.sexo !== null)}>
          {guardando ? "Guardando…" : "Guardar"}
        </Button>
        {!cambiado && f.sexo !== null && <span className={ui.hint}>Sin cambios por guardar.</span>}
      </div>
    </form>
  );
}

/* ── Alergias: el bloque firma, en voz baja ─────────────────── */

function Alergias({ f, cambiar, nombre }: { f: FichaDueno; cambiar: Cambiar; nombre: string }) {
  const ids = useId();
  const [sustancia, setSustancia] = useState("");
  const [reaccion, setReaccion] = useState<AlergiaFicha["reaccion"]>("urticaria");
  const [texto, setTexto] = useState("");
  const [gravedad, setGravedad] = useState<Gravedad>("alta");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function anadir(ev: FormEvent) {
    ev.preventDefault();
    if (!sustancia.trim()) return setError("Escribe a qué tiene alergia: un medicamento o un alimento.");
    if (reaccion === "otra" && !texto.trim()) return setError("Describe la reacción en pocas palabras.");
    if (f.alergias.length >= 20) return setError("Hay demasiadas alergias apuntadas. Quita alguna.");
    setError(null);
    setOcupado(true);
    const nueva: AlergiaFicha = { id: nuevoId(), sustancia: sustancia.trim(), reaccion, texto: reaccion === "otra" ? texto.trim() : "", gravedad };
    const r = await cambiar((d) => ({ ...d, alergias: [...d.alergias, nueva] }));
    setOcupado(false);
    if (r) {
      setSustancia("");
      setTexto("");
      setReaccion("urticaria");
      setGravedad("alta");
    }
  }

  const quitar = (id: string) => void cambiar((d) => ({ ...d, alergias: d.alergias.filter((a) => a.id !== id) }));

  return (
    <section className={ui.panel} aria-labelledby={`${ids}-t`}>
      <h2 id={`${ids}-t`} className={ui.panelTitle}>
        Alergias
      </h2>

      {f.alergias.length === 0 ? (
        // Sin alergias no hay bloque rojo: un rojo que dice «ninguna» enseña a ignorar el rojo.
        <p className={s.ninguna}>Ninguna registrada.</p>
      ) : (
        <div className={s.alergias}>
          <p className={s.alergiasEtiqueta}>
            <IconAlert size={16} /> Alergias de {nombre || "tu mascota"}
          </p>
          <ul className={s.alergiasLista}>
            {f.alergias.map((a) => (
              <li key={a.id} className={s.alergia}>
                <div className={s.alergiaTexto}>
                  <span className={s.alergiaSustancia}>{a.sustancia}</span>
                  <span>
                    {terminoReaccion(a).es} · {nombreGravedad[a.gravedad]}
                  </span>
                </div>
                <Button type="button" variant="destructive" size="sm" onClick={() => quitar(a.id)} aria-label={`Quitar la alergia a ${a.sustancia}`}>
                  Quitar
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form className={s.anadir} onSubmit={anadir} noValidate>
        <Campo id={`${ids}-sustancia`} etiqueta="Alergia a" ayuda="El principio activo o el alimento, no la marca: «amoxicilina», «pollo».">
          <Input id={`${ids}-sustancia`} maxLength={80} value={sustancia} onChange={(e) => setSustancia(e.target.value)} />
        </Campo>
        <div className={s.campos}>
          <Campo id={`${ids}-reaccion`} etiqueta="Qué le pasa">
            <select id={`${ids}-reaccion`} className={s.selector} value={reaccion} onChange={(e) => setReaccion(e.target.value as AlergiaFicha["reaccion"])}>
              {Object.entries(REACCIONES).map(([c, t]) => (
                <option key={c} value={c}>
                  {t.es}
                </option>
              ))}
              <option value="otra">Otra cosa</option>
            </select>
          </Campo>
          <Campo id={`${ids}-gravedad`} etiqueta="Gravedad">
            <select id={`${ids}-gravedad`} className={s.selector} value={gravedad} onChange={(e) => setGravedad(e.target.value as Gravedad)}>
              {GRAVEDADES.map(([c, t]) => (
                <option key={c} value={c}>
                  {t}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        {reaccion === "otra" && (
          <Campo id={`${ids}-texto`} etiqueta="Descríbelo" ayuda="Se enseñará tal como lo escribas, sin traducir.">
            <Input id={`${ids}-texto`} maxLength={80} value={texto} onChange={(e) => setTexto(e.target.value)} />
          </Campo>
        )}
        {error && (
          <p className={ui.fieldError} role="alert">
            {error}
          </p>
        )}
        <Button type="submit" variant="outline" size="md" className="self-start" disabled={ocupado}>
          {ocupado ? "Añadiendo…" : "Añadir alergia"}
        </Button>
      </form>
    </section>
  );
}

/* ── Medicación habitual ───────────────────────────────────── */

function Medicacion({ f, cambiar }: { f: FichaDueno; cambiar: Cambiar }) {
  const ids = useId();
  const [principio, setPrincipio] = useState("");
  const [dosis, setDosis] = useState("");
  const [cada, setCada] = useState(24);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function anadir(ev: FormEvent) {
    ev.preventDefault();
    if (!principio.trim()) return setError("Escribe qué toma.");
    if (f.medicacion.length >= 20) return setError("Hay demasiados medicamentos apuntados. Quita alguno.");
    setError(null);
    setOcupado(true);
    const nuevo: MedicacionFicha = { id: nuevoId(), principio: principio.trim(), dosis: dosis.trim(), cadaHoras: cada };
    const r = await cambiar((d) => ({ ...d, medicacion: [...d.medicacion, nuevo] }));
    setOcupado(false);
    if (r) {
      setPrincipio("");
      setDosis("");
    }
  }

  return (
    <section className={ui.panel} aria-labelledby={`${ids}-t`}>
      <h2 id={`${ids}-t`} className={ui.panelTitle}>
        Medicación habitual
      </h2>

      {f.medicacion.length === 0 ? (
        <p className={s.ninguna}>No toma nada de forma habitual.</p>
      ) : (
        <ul className={s.registros}>
          {f.medicacion.map((m) => (
            <li key={m.id} className={s.registro}>
              <div className={s.registroTexto}>
                <span className={s.pasoTitulo}>{m.principio}</span>
                <span className={s.pasoDetalle}>
                  {m.dosis && <span className={s.dato}>{m.dosis} · </span>}
                  {cadaTexto(m.cadaHoras)}
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void cambiar((d) => ({ ...d, medicacion: d.medicacion.filter((x) => x.id !== m.id) }))}
                aria-label={`Quitar ${m.principio}`}
              >
                Quitar
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form className={s.anadir} onSubmit={anadir} noValidate>
        <Campo
          id={`${ids}-principio`}
          etiqueta="Qué toma"
          ayuda="El principio activo, que viene en la caja en letra pequeña. La marca cambia de un país a otro."
        >
          <Input id={`${ids}-principio`} maxLength={80} placeholder="Omeprazol" value={principio} onChange={(e) => setPrincipio(e.target.value)} />
        </Campo>
        <div className={s.campos}>
          <Campo id={`${ids}-dosis`} etiqueta="Dosis">
            <Input id={`${ids}-dosis`} className="font-mono" maxLength={40} placeholder="10 mg" value={dosis} onChange={(e) => setDosis(e.target.value)} />
          </Campo>
          <Campo id={`${ids}-cada`} etiqueta="Cada cuánto">
            <select id={`${ids}-cada`} className={s.selector} value={cada} onChange={(e) => setCada(Number(e.target.value))}>
              {CADA.map(([h, t]) => (
                <option key={h} value={h}>
                  {t}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        {error && (
          <p className={ui.fieldError} role="alert">
            {error}
          </p>
        )}
        <Button type="submit" variant="outline" size="md" className="self-start" disabled={ocupado}>
          {ocupado ? "Añadiendo…" : "Añadir medicamento"}
        </Button>
      </form>
    </section>
  );
}

/* ── Enfermedades crónicas ─────────────────────────────────── */

function Cronicas({ f, cambiar }: { f: FichaDueno; cambiar: Cambiar }) {
  const ids = useId();
  const [codigo, setCodigo] = useState<CronicaFicha["codigo"] | "">("");
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const ya = new Set(f.cronicas.filter((c) => c.codigo !== "otra").map((c) => c.codigo));

  async function anadir(ev: FormEvent) {
    ev.preventDefault();
    if (!codigo) return setError("Elige una de la lista.");
    if (codigo === "otra" && !texto.trim()) return setError("Escribe cuál.");
    if (f.cronicas.length >= 20) return setError("Hay demasiadas apuntadas. Quita alguna.");
    setError(null);
    setOcupado(true);
    const nueva: CronicaFicha = { id: nuevoId(), codigo, texto: codigo === "otra" ? texto.trim() : "" };
    const r = await cambiar((d) => ({ ...d, cronicas: [...d.cronicas, nueva] }));
    setOcupado(false);
    if (r) {
      setCodigo("");
      setTexto("");
    }
  }

  return (
    <section className={ui.panel} aria-labelledby={`${ids}-t`}>
      <h2 id={`${ids}-t`} className={ui.panelTitle}>
        Enfermedades crónicas
      </h2>

      {f.cronicas.length === 0 ? (
        <p className={s.ninguna}>Ninguna registrada.</p>
      ) : (
        <ul className={s.registros}>
          {f.cronicas.map((c) => (
            <li key={c.id} className={s.registro}>
              <span className={s.pasoTitulo}>{terminoCronica(c).es}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void cambiar((d) => ({ ...d, cronicas: d.cronicas.filter((x) => x.id !== c.id) }))}
                aria-label={`Quitar ${terminoCronica(c).es}`}
              >
                Quitar
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form className={s.anadir} onSubmit={anadir} noValidate>
        <Campo id={`${ids}-codigo`} etiqueta="Enfermedad" ayuda="Solo las que haya diagnosticado un veterinario.">
          <select id={`${ids}-codigo`} className={s.selector} value={codigo} onChange={(e) => setCodigo(e.target.value as CronicaFicha["codigo"] | "")}>
            <option value="">Elige una…</option>
            {Object.entries(CRONICAS)
              .filter(([c]) => !ya.has(c as keyof typeof CRONICAS))
              .map(([c, t]) => (
                <option key={c} value={c}>
                  {t.es}
                </option>
              ))}
            <option value="otra">Otra que no está en la lista</option>
          </select>
        </Campo>
        {codigo === "otra" && (
          <Campo id={`${ids}-texto`} etiqueta="Cuál" ayuda="Se enseñará tal como lo escribas, sin traducir.">
            <Input id={`${ids}-texto`} maxLength={80} value={texto} onChange={(e) => setTexto(e.target.value)} />
          </Campo>
        )}
        {error && (
          <p className={ui.fieldError} role="alert">
            {error}
          </p>
        )}
        <Button type="submit" variant="outline" size="md" className="self-start" disabled={ocupado}>
          {ocupado ? "Añadiendo…" : "Añadir enfermedad"}
        </Button>
      </form>
    </section>
  );
}

/* ── Rabia ─────────────────────────────────────────────────── */

function Rabia({ f, cambiar }: { f: FichaDueno; cambiar: Cambiar }) {
  const ids = useId();
  const [hasta, setHasta] = useState(f.rabiaHasta);
  const [ocupado, setOcupado] = useState(false);
  const caducada = !!f.rabiaHasta && f.rabiaHasta < hoy();

  async function alEnviar(ev: FormEvent) {
    ev.preventDefault();
    setOcupado(true);
    const r = await cambiar((d) => ({ ...d, rabiaHasta: hasta }));
    setOcupado(false);
    if (r) toast("Guardado");
  }

  return (
    <form className={ui.panel} onSubmit={alEnviar} noValidate aria-labelledby={`${ids}-t`}>
      <h2 id={`${ids}-t`} className={ui.panelTitle}>
        Vacuna de la rabia
      </h2>
      <Campo
        id={`${ids}-hasta`}
        etiqueta="Válida hasta"
        ayuda="La fecha que pone en su cartilla o en su pasaporte. Es lo primero que mira un veterinario ante un mordisco."
      >
        <Input id={`${ids}-hasta`} type="date" className="max-w-[14rem]" value={hasta} onChange={(e) => setHasta(e.target.value)} />
      </Campo>
      {caducada && (
        <div className={ui.pendingBlock} role="status">
          Según esta fecha, la vacuna caducó el <span className={s.dato}>{fecha(f.rabiaHasta)}</span>. Si ya se la han
          puesto de nuevo, actualiza la fecha.
        </div>
      )}
      <div className={ui.actions}>
        <Button type="submit" variant="outline" size="md" disabled={ocupado || hasta === f.rabiaHasta}>
          {ocupado ? "Guardando…" : "Guardar"}
        </Button>
        {f.rabiaHasta && (
          <Button
            type="button"
            variant="ghost"
            size="md"
            disabled={ocupado}
            onClick={() => void cambiar((d) => ({ ...d, rabiaHasta: "" }))}
          >
            No consta
          </Button>
        )}
      </div>
    </form>
  );
}
