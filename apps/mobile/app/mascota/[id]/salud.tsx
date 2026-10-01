import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import { View } from "react-native";
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
} from "@barkandmeow/schema";
import { ConFicha } from "@/components/Mascota";
import { Boton, Campo, Fila, Opciones, Seccion, Tarjeta, Texto } from "@/components/ui";
import { aIso, deIso, hoyIso, useFicha, type Cambiar } from "@/lib/salud";
import { espacio, fuente, useColores } from "@/lib/tema";

/* La ficha de salud en el teléfono: la misma que en el portal. Lo que un
   veterinario que no conoce al animal necesita saber antes de darle nada.
   Cada cosa que se añade o se quita se guarda al momento. Los medicamentos
   van por principio activo, nunca por marca: la marca cambia de país a país. */

const ESPECIES = [
  ["dog", "Perro"],
  ["cat", "Gato"],
  ["ferret", "Hurón"],
  ["rabbit", "Conejo"],
  ["bird", "Ave"],
  ["rodent", "Roedor"],
  ["reptile", "Reptil"],
] as const;

const SEXOS = [
  ["hembra", "Hembra"],
  ["macho", "Macho"],
] as const;

const SI_NO = [
  ["si", "Sí"],
  ["no", "No"],
] as const;

const GRAVEDADES: readonly (readonly [Gravedad, string])[] = [
  ["alta", "Grave"],
  ["media", "Moderada"],
  ["baja", "Leve"],
];
const nombreGravedad: Record<Gravedad, string> = { alta: "Grave", media: "Moderada", baja: "Leve" };

const CADA = [
  [8, "Cada 8 h"],
  [12, "Cada 12 h"],
  [24, "Una vez al día"],
  [48, "Cada 2 días"],
  [168, "Cada semana"],
  [720, "Cada mes"],
] as const;
const cadaTexto = (h: number) => CADA.find(([x]) => x === h)?.[1].toLowerCase() ?? `cada ${h} horas`;

const REACCIONES_OPC = [...Object.entries(REACCIONES).map(([c, t]) => [c, t.es] as const), ["otra", "Otra cosa"] as const] as readonly (readonly [
  AlergiaFicha["reaccion"],
  string,
])[];

function Basico({ f, cambiar, chipPista }: { f: FichaDueno; cambiar: Cambiar; chipPista: string | null }) {
  const [especie, setEspecie] = useState(f.especie);
  const [sexo, setSexo] = useState(f.sexo);
  const [esterilizado, setEsterilizado] = useState(f.esterilizado);
  const [raza, setRaza] = useState(f.raza);
  const [nacimiento, setNacimiento] = useState(deIso(f.nacimiento));
  const [peso, setPeso] = useState(f.pesoKg);
  const [chip, setChip] = useState(f.chip);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const nacimientoIso = aIso(nacimiento);
  const edad = nacimientoIso ? edadTexto(nacimientoIso, new Date()) : "";

  async function guardar() {
    const limpio = chip.replace(/[\s.-]/g, "");
    if (!sexo) return setError("Marca si es hembra o macho: sin eso la ficha no se puede enseñar.");
    if (nacimientoIso === null) return setError("La fecha de nacimiento, así: 14/05/2021.");
    if (nacimientoIso > hoyIso()) return setError("La fecha de nacimiento no puede ser futura.");
    if (peso.trim() && !/^\d{1,3}([.,]\d{1,2})?$/.test(peso.trim())) return setError("El peso, en kilos: por ejemplo 12,4.");
    if (limpio && !/^[0-9A-Za-z]{6,23}$/.test(limpio)) return setError("El número de chip no tiene ese formato.");
    if (limpio && chipPista && !limpio.endsWith(chipPista))
      return setError(`Ese número no acaba en ${chipPista}, como el chip de esta mascota. Revísalo.`);
    setError(null);
    setGuardando(true);
    await cambiar((d) => ({
      ...d,
      especie,
      sexo,
      esterilizado,
      raza: raza.trim(),
      nacimiento: nacimientoIso,
      pesoKg: peso.trim(),
      pesoFecha: peso.trim() === d.pesoKg ? d.pesoFecha : peso.trim() ? hoyIso() : "",
      chip: limpio,
    }));
    setGuardando(false);
  }

  return (
    <Seccion titulo="Lo básico">
      <Opciones etiqueta="Especie" opciones={ESPECIES} valor={especie as (typeof ESPECIES)[number][0]} alElegir={setEspecie} />
      <Opciones etiqueta="Sexo" opciones={SEXOS} valor={sexo} alElegir={setSexo} />
      <Opciones
        etiqueta={sexo === "macho" ? "Esterilizado" : sexo === "hembra" ? "Esterilizada" : "Esterilización"}
        opciones={SI_NO}
        valor={esterilizado ? "si" : "no"}
        alElegir={(v) => setEsterilizado(v === "si")}
      />
      <Campo etiqueta="Raza" placeholder="Mestiza, labrador…" maxLength={80} value={raza} onChangeText={setRaza} />
      <Campo
        etiqueta={edad ? `Fecha de nacimiento · ${edad.toLowerCase()}` : "Fecha de nacimiento"}
        datos
        placeholder="14/05/2021"
        keyboardType="numbers-and-punctuation"
        maxLength={10}
        value={nacimiento}
        onChangeText={setNacimiento}
      />
      <Campo
        etiqueta="Peso, en kilos"
        datos
        placeholder="12,4"
        keyboardType="decimal-pad"
        maxLength={6}
        value={peso}
        onChangeText={setPeso}
      />
      <Campo
        etiqueta={`Número completo del chip (opcional, acaba en ${chipPista ?? "····"})`}
        datos
        keyboardType="number-pad"
        maxLength={32}
        value={chip}
        onChangeText={setChip}
        error={error}
      />
      <Boton alPulsar={() => void guardar()} ocupado={guardando}>
        Guardar
      </Boton>
    </Seccion>
  );
}

function Alergias({ f, cambiar, nombre }: { f: FichaDueno; cambiar: Cambiar; nombre: string }) {
  const c = useColores();
  const [sustancia, setSustancia] = useState("");
  const [reaccion, setReaccion] = useState<AlergiaFicha["reaccion"]>("urticaria");
  const [texto, setTexto] = useState("");
  const [gravedad, setGravedad] = useState<Gravedad>("alta");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function anadir() {
    if (!sustancia.trim()) return setError("Escribe a qué tiene alergia: un medicamento o un alimento.");
    if (reaccion === "otra" && !texto.trim()) return setError("Describe la reacción en pocas palabras.");
    if (f.alergias.length >= 20) return setError("Hay demasiadas alergias apuntadas. Quita alguna.");
    setError(null);
    setOcupado(true);
    const nueva: AlergiaFicha = {
      id: Crypto.randomUUID(),
      sustancia: sustancia.trim(),
      reaccion,
      texto: reaccion === "otra" ? texto.trim() : "",
      gravedad,
    };
    const r = await cambiar((d) => ({ ...d, alergias: [...d.alergias, nueva] }));
    setOcupado(false);
    if (r) {
      setSustancia("");
      setTexto("");
      setReaccion("urticaria");
      setGravedad("alta");
    }
  }

  return (
    <Seccion titulo="Alergias">
      {f.alergias.length === 0 ? (
        // Sin alergias no hay bloque rojo: un rojo que dice «ninguna» enseña a ignorar el rojo.
        <Texto tono="suave">Ninguna registrada.</Texto>
      ) : (
        <Tarjeta tono="alerta">
          <Texto estilo={{ fontFamily: fuente.textoFuerte, fontSize: 13, letterSpacing: 0.8, color: c.alertInk }}>
            ALERGIAS DE {(nombre || "tu mascota").toUpperCase()}
          </Texto>
          {f.alergias.map((a) => (
            <View key={a.id} style={{ flexDirection: "row", alignItems: "center", gap: espacio.md }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Texto estilo={{ fontFamily: fuente.textoFuerte, fontSize: 17, color: c.alertInk }}>{a.sustancia}</Texto>
                <Texto estilo={{ color: c.alertSoftInk }}>
                  {terminoReaccion(a).es} · {nombreGravedad[a.gravedad]}
                </Texto>
              </View>
              <Boton
                variante="peligro"
                alPulsar={() => void cambiar((d) => ({ ...d, alergias: d.alergias.filter((x) => x.id !== a.id) }))}
              >
                Quitar
              </Boton>
            </View>
          ))}
        </Tarjeta>
      )}
      <Campo
        etiqueta="Alergia a (principio activo o alimento, no la marca)"
        placeholder="Amoxicilina, pollo…"
        maxLength={80}
        value={sustancia}
        onChangeText={setSustancia}
      />
      <Opciones etiqueta="Qué le pasa" opciones={REACCIONES_OPC} valor={reaccion} alElegir={setReaccion} />
      {reaccion === "otra" && (
        <Campo etiqueta="Descríbelo (se enseña sin traducir)" maxLength={80} value={texto} onChangeText={setTexto} />
      )}
      <Opciones etiqueta="Gravedad" opciones={GRAVEDADES} valor={gravedad} alElegir={setGravedad} />
      {error ? <Texto estilo={{ color: c.alertInk }}>{error}</Texto> : null}
      <Boton variante="secundario" alPulsar={() => void anadir()} ocupado={ocupado}>
        Añadir alergia
      </Boton>
    </Seccion>
  );
}

function Medicacion({ f, cambiar }: { f: FichaDueno; cambiar: Cambiar }) {
  const c = useColores();
  const [principio, setPrincipio] = useState("");
  const [dosis, setDosis] = useState("");
  const [cada, setCada] = useState<(typeof CADA)[number][0]>(24);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function anadir() {
    if (!principio.trim()) return setError("Escribe qué toma.");
    if (f.medicacion.length >= 20) return setError("Hay demasiados medicamentos apuntados. Quita alguno.");
    setError(null);
    setOcupado(true);
    const nuevo = { id: Crypto.randomUUID(), principio: principio.trim(), dosis: dosis.trim(), cadaHoras: cada };
    const r = await cambiar((d) => ({ ...d, medicacion: [...d.medicacion, nuevo] }));
    setOcupado(false);
    if (r) {
      setPrincipio("");
      setDosis("");
    }
  }

  return (
    <Seccion titulo="Medicación habitual">
      {f.medicacion.length === 0 ? (
        <Texto tono="suave">No toma nada de forma habitual.</Texto>
      ) : (
        <View>
          {f.medicacion.map((m) => (
            <Fila
              key={m.id}
              titulo={m.principio}
              detalle={[m.dosis, cadaTexto(m.cadaHoras)].filter(Boolean).join(" · ")}
              accion="Quitar"
              alPulsar={() => void cambiar((d) => ({ ...d, medicacion: d.medicacion.filter((x) => x.id !== m.id) }))}
            />
          ))}
        </View>
      )}
      <Campo
        etiqueta="Qué toma (el principio activo, no la marca)"
        placeholder="Omeprazol"
        maxLength={80}
        value={principio}
        onChangeText={setPrincipio}
      />
      <Campo etiqueta="Dosis" datos placeholder="10 mg" maxLength={40} value={dosis} onChangeText={setDosis} />
      <Opciones etiqueta="Cada cuánto" opciones={CADA} valor={cada} alElegir={setCada} />
      {error ? <Texto estilo={{ color: c.alertInk }}>{error}</Texto> : null}
      <Boton variante="secundario" alPulsar={() => void anadir()} ocupado={ocupado}>
        Añadir medicamento
      </Boton>
    </Seccion>
  );
}

function Cronicas({ f, cambiar }: { f: FichaDueno; cambiar: Cambiar }) {
  const c = useColores();
  const [codigo, setCodigo] = useState<CronicaFicha["codigo"] | null>(null);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const ya = new Set(f.cronicas.map((x) => x.codigo));
  const opciones = [
    ...Object.entries(CRONICAS)
      .filter(([k]) => !ya.has(k as CronicaFicha["codigo"]))
      .map(([k, t]) => [k as CronicaFicha["codigo"], t.es] as const),
    ["otra", "Otra"] as const,
  ];

  async function anadir() {
    if (!codigo) return setError("Elige una de la lista.");
    if (codigo === "otra" && !texto.trim()) return setError("Escribe cuál.");
    if (f.cronicas.length >= 20) return setError("Hay demasiadas apuntadas. Quita alguna.");
    setError(null);
    setOcupado(true);
    const nueva: CronicaFicha = { id: Crypto.randomUUID(), codigo, texto: codigo === "otra" ? texto.trim() : "" };
    const r = await cambiar((d) => ({ ...d, cronicas: [...d.cronicas, nueva] }));
    setOcupado(false);
    if (r) {
      setCodigo(null);
      setTexto("");
    }
  }

  return (
    <Seccion titulo="Enfermedades crónicas">
      {f.cronicas.length === 0 ? (
        <Texto tono="suave">Ninguna registrada.</Texto>
      ) : (
        <View>
          {f.cronicas.map((x) => (
            <Fila
              key={x.id}
              titulo={terminoCronica(x).es}
              accion="Quitar"
              alPulsar={() => void cambiar((d) => ({ ...d, cronicas: d.cronicas.filter((y) => y.id !== x.id) }))}
            />
          ))}
        </View>
      )}
      <Opciones etiqueta="Añadir una (solo las que haya diagnosticado un veterinario)" opciones={opciones} valor={codigo} alElegir={setCodigo} />
      {codigo === "otra" && <Campo etiqueta="Cuál (se enseña sin traducir)" maxLength={80} value={texto} onChangeText={setTexto} />}
      {error ? <Texto estilo={{ color: c.alertInk }}>{error}</Texto> : null}
      {codigo && (
        <Boton variante="secundario" alPulsar={() => void anadir()} ocupado={ocupado}>
          Añadir enfermedad
        </Boton>
      )}
    </Seccion>
  );
}

function Rabia({ f, cambiar }: { f: FichaDueno; cambiar: Cambiar }) {
  const [hasta, setHasta] = useState(deIso(f.rabiaHasta));
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const caducada = !!f.rabiaHasta && f.rabiaHasta < hoyIso();

  async function guardar() {
    const iso = aIso(hasta);
    if (iso === null) return setError("La fecha, así: 14/03/2027. Déjala vacía si no consta.");
    setError(null);
    setOcupado(true);
    await cambiar((d) => ({ ...d, rabiaHasta: iso }));
    setOcupado(false);
  }

  return (
    <Seccion titulo="Vacuna de la rabia">
      <Campo
        etiqueta="Válida hasta (la fecha de su cartilla)"
        datos
        placeholder="14/03/2027"
        keyboardType="numbers-and-punctuation"
        maxLength={10}
        value={hasta}
        onChangeText={setHasta}
        error={error}
      />
      {caducada && (
        <Tarjeta tono="aviso">
          <Texto>Según esta fecha, la vacuna caducó el {deIso(f.rabiaHasta)}. Si ya se la han puesto, actualízala.</Texto>
        </Tarjeta>
      )}
      <Boton variante="secundario" alPulsar={() => void guardar()} ocupado={ocupado}>
        Guardar la fecha
      </Boton>
    </Seccion>
  );
}

export default function Salud() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { estado, cambiar, recargar } = useFicha(id);

  return (
    <ConFicha
      estado={estado}
      titulo="Ficha de salud"
      intro="Lo que un veterinario que no conoce a tu mascota necesita saber antes de darle nada. Se guarda cifrada con tu clave: nadie la ve hasta que tú la enseñes."
      alRefrescar={() => void recargar()}
    >
      {({ datos, m }) => {
        const nombre = m.perfil.nombre.trim();
        return (
          <>
            {/* Si lo básico cambia por fuera (el portal), el formulario se rehace con lo nuevo. */}
            <Basico
              key={[datos.especie, datos.sexo, datos.esterilizado, datos.raza, datos.nacimiento, datos.pesoKg, datos.chip].join("|")}
              f={datos}
              cambiar={cambiar}
              chipPista={m.chipPista}
            />
            <Alergias f={datos} cambiar={cambiar} nombre={nombre} />
            <Medicacion f={datos} cambiar={cambiar} />
            <Cronicas f={datos} cambiar={cambiar} />
            <Rabia key={datos.rabiaHasta} f={datos} cambiar={cambiar} />
            <Texto tono="suave">
              {datos.actualizado ? `Guardada por última vez el ${deIso(datos.actualizado)}. ` : ""}
              Lo que escribes aquí sale marcado como «declarado por el dueño»: no pesa lo mismo que un informe firmado
              por una clínica.
            </Texto>
          </>
        );
      }}
    </ConFicha>
  );
}
