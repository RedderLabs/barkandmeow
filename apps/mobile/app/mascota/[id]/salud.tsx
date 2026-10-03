import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import { View } from "react-native";
import {
  CRONICAS,
  REACCIONES,
  terminoCronica,
  terminoReaccion,
  type AlergiaFicha,
  type CronicaFicha,
  type FichaDueno,
  type Gravedad,
} from "@barkandmeow/schema";
import { ConFicha } from "@/components/Mascota";
import { Boton, Campo, Fila, Opciones, Seccion, Tarjeta, Texto } from "@/components/ui";
import { useIdioma } from "@/lib/ajustes";
import { useT, type Clave, type T } from "@/lib/idioma";
import { aIso, deIso, edadEn, hoyIso, useFicha, type Cambiar } from "@/lib/salud";
import { espacio, fuente, useColores } from "@/lib/tema";

/* La ficha de salud en el teléfono: la misma que en el portal. Lo que un
   veterinario que no conoce al animal necesita saber antes de darle nada.
   Cada cosa que se añade o se quita se guarda al momento. Los medicamentos
   van por principio activo, nunca por marca: la marca cambia de país a país. */

const ESPECIES = [
  ["dog", "salud.especie.dog"],
  ["cat", "salud.especie.cat"],
  ["ferret", "salud.especie.ferret"],
  ["rabbit", "salud.especie.rabbit"],
  ["bird", "salud.especie.bird"],
  ["rodent", "salud.especie.rodent"],
  ["reptile", "salud.especie.reptile"],
] as const satisfies readonly (readonly [string, Clave])[];

const SEXOS = [
  ["hembra", "salud.sexo.hembra"],
  ["macho", "salud.sexo.macho"],
] as const satisfies readonly (readonly [string, Clave])[];

const SI_NO = [
  ["si", "salud.si"],
  ["no", "salud.no"],
] as const satisfies readonly (readonly [string, Clave])[];

const GRAVEDADES = [
  ["alta", "salud.gravedad.alta"],
  ["media", "salud.gravedad.media"],
  ["baja", "salud.gravedad.baja"],
] as const satisfies readonly (readonly [Gravedad, Clave])[];
const nombreGravedad = Object.fromEntries(GRAVEDADES) as Record<Gravedad, Clave>;

const CADA = [
  [8, "salud.cada.8"],
  [12, "salud.cada.12"],
  [24, "salud.cada.24"],
  [48, "salud.cada.48"],
  [168, "salud.cada.168"],
  [720, "salud.cada.720"],
] as const satisfies readonly (readonly [number, Clave])[];
const cadaTexto = (t: T, h: number) => {
  const k = CADA.find(([x]) => x === h)?.[1];
  return k ? t(k).toLowerCase() : t("salud.cada.horas", { n: h });
};

/** Pasa una lista [valor, clave] a [valor, texto] para <Opciones>. */
const traducir = <V,>(t: T, lista: readonly (readonly [V, Clave])[]) => lista.map(([v, k]) => [v, t(k)] as const);

function Basico({ f, cambiar, chipPista }: { f: FichaDueno; cambiar: Cambiar; chipPista: string | null }) {
  const t = useT();
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
  const edad = nacimientoIso ? edadEn(t, nacimientoIso, new Date()) : "";

  async function guardar() {
    const limpio = chip.replace(/[\s.-]/g, "");
    if (!sexo) return setError(t("salud.error.sexo"));
    if (nacimientoIso === null) return setError(t("salud.error.nacimiento"));
    if (nacimientoIso > hoyIso()) return setError(t("salud.error.futura"));
    if (peso.trim() && !/^\d{1,3}([.,]\d{1,2})?$/.test(peso.trim())) return setError(t("salud.error.peso"));
    if (limpio && !/^[0-9A-Za-z]{6,23}$/.test(limpio)) return setError(t("salud.error.chip"));
    if (limpio && chipPista && !limpio.endsWith(chipPista))
      return setError(t("salud.error.chipPista", { pista: chipPista }));
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
    <Seccion titulo={t("salud.basico")}>
      <Opciones
        etiqueta={t("salud.especie")}
        opciones={traducir(t, ESPECIES)}
        valor={especie as (typeof ESPECIES)[number][0]}
        alElegir={setEspecie}
      />
      <Opciones etiqueta={t("salud.sexo")} opciones={traducir(t, SEXOS)} valor={sexo} alElegir={setSexo} />
      <Opciones
        etiqueta={t(
          sexo === "macho" ? "salud.esterilizado" : sexo === "hembra" ? "salud.esterilizada" : "salud.esterilizacion",
        )}
        opciones={traducir(t, SI_NO)}
        valor={esterilizado ? "si" : "no"}
        alElegir={(v) => setEsterilizado(v === "si")}
      />
      <Campo
        etiqueta={t("salud.raza")}
        placeholder={t("salud.razaEjemplo")}
        maxLength={80}
        value={raza}
        onChangeText={setRaza}
      />
      <Campo
        etiqueta={edad ? t("salud.nacimientoEdad", { edad }) : t("salud.nacimiento")}
        datos
        placeholder="14/05/2021"
        keyboardType="numbers-and-punctuation"
        maxLength={10}
        value={nacimiento}
        onChangeText={setNacimiento}
      />
      <Campo
        etiqueta={t("salud.peso")}
        datos
        placeholder={t("salud.pesoEjemplo")}
        keyboardType="decimal-pad"
        maxLength={6}
        value={peso}
        onChangeText={setPeso}
      />
      <Campo
        etiqueta={t("salud.chip", { pista: chipPista ?? "····" })}
        datos
        keyboardType="number-pad"
        maxLength={32}
        value={chip}
        onChangeText={setChip}
        error={error}
      />
      <Boton alPulsar={() => void guardar()} ocupado={guardando}>
        {t("comun.guardar")}
      </Boton>
    </Seccion>
  );
}

function Alergias({ f, cambiar, nombre }: { f: FichaDueno; cambiar: Cambiar; nombre: string }) {
  const t = useT();
  const idioma = useIdioma();
  const c = useColores();
  const [sustancia, setSustancia] = useState("");
  const [reaccion, setReaccion] = useState<AlergiaFicha["reaccion"]>("urticaria");
  const [texto, setTexto] = useState("");
  const [gravedad, setGravedad] = useState<Gravedad>("alta");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function anadir() {
    if (!sustancia.trim()) return setError(t("salud.error.sustancia"));
    if (reaccion === "otra" && !texto.trim()) return setError(t("salud.error.reaccion"));
    if (f.alergias.length >= 20) return setError(t("salud.error.muchasAlergias"));
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

  const reacciones = [
    ...Object.entries(REACCIONES).map(([k, x]) => [k as AlergiaFicha["reaccion"], x[idioma]] as const),
    ["otra", t("salud.reaccionOtra")] as const,
  ];

  return (
    <Seccion titulo={t("salud.alergias")}>
      {f.alergias.length === 0 ? (
        // Sin alergias no hay bloque rojo: un rojo que dice «ninguna» enseña a ignorar el rojo.
        <Texto tono="suave">{t("salud.ningunaRegistrada")}</Texto>
      ) : (
        <Tarjeta tono="alerta">
          <Texto estilo={{ fontFamily: fuente.textoFuerte, fontSize: 13, letterSpacing: 0.8, color: c.alertInk }}>
            {t("salud.alergiasDe", { nombre: (nombre || t("mascota.tuMascota")).toUpperCase() })}
          </Texto>
          {f.alergias.map((a) => (
            <View key={a.id} style={{ flexDirection: "row", alignItems: "center", gap: espacio.md }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Texto estilo={{ fontFamily: fuente.textoFuerte, fontSize: 17, color: c.alertInk }}>{a.sustancia}</Texto>
                <Texto estilo={{ color: c.alertSoftInk }}>
                  {terminoReaccion(a)[idioma]} · {t(nombreGravedad[a.gravedad])}
                </Texto>
              </View>
              <Boton
                variante="peligro"
                alPulsar={() => void cambiar((d) => ({ ...d, alergias: d.alergias.filter((x) => x.id !== a.id) }))}
              >
                {t("salud.quitar")}
              </Boton>
            </View>
          ))}
        </Tarjeta>
      )}
      <Campo
        etiqueta={t("salud.alergiaA")}
        placeholder={t("salud.alergiaEjemplo")}
        maxLength={80}
        value={sustancia}
        onChangeText={setSustancia}
      />
      <Opciones etiqueta={t("salud.reaccion")} opciones={reacciones} valor={reaccion} alElegir={setReaccion} />
      {reaccion === "otra" && (
        <Campo etiqueta={t("salud.reaccionTexto")} maxLength={80} value={texto} onChangeText={setTexto} />
      )}
      <Opciones
        etiqueta={t("salud.gravedad")}
        opciones={traducir(t, GRAVEDADES)}
        valor={gravedad}
        alElegir={setGravedad}
      />
      {error ? <Texto estilo={{ color: c.alertInk }}>{error}</Texto> : null}
      <Boton variante="secundario" alPulsar={() => void anadir()} ocupado={ocupado}>
        {t("salud.anadirAlergia")}
      </Boton>
    </Seccion>
  );
}

function Medicacion({ f, cambiar }: { f: FichaDueno; cambiar: Cambiar }) {
  const t = useT();
  const c = useColores();
  const [principio, setPrincipio] = useState("");
  const [dosis, setDosis] = useState("");
  const [cada, setCada] = useState<(typeof CADA)[number][0]>(24);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function anadir() {
    if (!principio.trim()) return setError(t("salud.error.principio"));
    if (f.medicacion.length >= 20) return setError(t("salud.error.muchosMedicamentos"));
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
    <Seccion titulo={t("salud.medicacion")}>
      {f.medicacion.length === 0 ? (
        <Texto tono="suave">{t("salud.sinMedicacion")}</Texto>
      ) : (
        <View>
          {f.medicacion.map((m) => (
            <Fila
              key={m.id}
              titulo={m.principio}
              detalle={[m.dosis, cadaTexto(t, m.cadaHoras)].filter(Boolean).join(" · ")}
              accion={t("salud.quitar")}
              alPulsar={() => void cambiar((d) => ({ ...d, medicacion: d.medicacion.filter((x) => x.id !== m.id) }))}
            />
          ))}
        </View>
      )}
      <Campo
        etiqueta={t("salud.principio")}
        placeholder={t("salud.principioEjemplo")}
        maxLength={80}
        value={principio}
        onChangeText={setPrincipio}
      />
      <Campo
        etiqueta={t("salud.dosis")}
        datos
        placeholder="10 mg"
        maxLength={40}
        value={dosis}
        onChangeText={setDosis}
      />
      <Opciones etiqueta={t("salud.cada")} opciones={traducir(t, CADA)} valor={cada} alElegir={setCada} />
      {error ? <Texto estilo={{ color: c.alertInk }}>{error}</Texto> : null}
      <Boton variante="secundario" alPulsar={() => void anadir()} ocupado={ocupado}>
        {t("salud.anadirMedicamento")}
      </Boton>
    </Seccion>
  );
}

function Cronicas({ f, cambiar }: { f: FichaDueno; cambiar: Cambiar }) {
  const t = useT();
  const idioma = useIdioma();
  const c = useColores();
  const [codigo, setCodigo] = useState<CronicaFicha["codigo"] | null>(null);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const ya = new Set(f.cronicas.map((x) => x.codigo));
  const opciones = [
    ...Object.entries(CRONICAS)
      .filter(([k]) => !ya.has(k as CronicaFicha["codigo"]))
      .map(([k, x]) => [k as CronicaFicha["codigo"], x[idioma]] as const),
    ["otra", t("salud.cronicaOtra")] as const,
  ];

  async function anadir() {
    if (!codigo) return setError(t("salud.error.elegir"));
    if (codigo === "otra" && !texto.trim()) return setError(t("salud.error.cual"));
    if (f.cronicas.length >= 20) return setError(t("salud.error.muchasCronicas"));
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
    <Seccion titulo={t("salud.cronicas")}>
      {f.cronicas.length === 0 ? (
        <Texto tono="suave">{t("salud.ningunaRegistrada")}</Texto>
      ) : (
        <View>
          {f.cronicas.map((x) => (
            <Fila
              key={x.id}
              titulo={terminoCronica(x)[idioma]}
              accion={t("salud.quitar")}
              alPulsar={() => void cambiar((d) => ({ ...d, cronicas: d.cronicas.filter((y) => y.id !== x.id) }))}
            />
          ))}
        </View>
      )}
      <Opciones etiqueta={t("salud.cronicaAnadir")} opciones={opciones} valor={codigo} alElegir={setCodigo} />
      {codigo === "otra" && (
        <Campo etiqueta={t("salud.cronicaTexto")} maxLength={80} value={texto} onChangeText={setTexto} />
      )}
      {error ? <Texto estilo={{ color: c.alertInk }}>{error}</Texto> : null}
      {codigo && (
        <Boton variante="secundario" alPulsar={() => void anadir()} ocupado={ocupado}>
          {t("salud.anadirEnfermedad")}
        </Boton>
      )}
    </Seccion>
  );
}

function Rabia({ f, cambiar }: { f: FichaDueno; cambiar: Cambiar }) {
  const t = useT();
  const [hasta, setHasta] = useState(deIso(f.rabiaHasta));
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const caducada = !!f.rabiaHasta && f.rabiaHasta < hoyIso();

  async function guardar() {
    const iso = aIso(hasta);
    if (iso === null) return setError(t("salud.error.rabia"));
    setError(null);
    setOcupado(true);
    await cambiar((d) => ({ ...d, rabiaHasta: iso }));
    setOcupado(false);
  }

  return (
    <Seccion titulo={t("salud.rabia")}>
      <Campo
        etiqueta={t("salud.rabiaHasta")}
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
          <Texto>{t("salud.rabiaCaducada", { fecha: deIso(f.rabiaHasta) })}</Texto>
        </Tarjeta>
      )}
      <Boton variante="secundario" alPulsar={() => void guardar()} ocupado={ocupado}>
        {t("salud.guardarFecha")}
      </Boton>
    </Seccion>
  );
}

export default function Salud() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { estado, cambiar, recargar } = useFicha(id);

  return (
    <ConFicha
      estado={estado}
      titulo={t("comun.pantalla.salud")}
      intro={t("salud.intro")}
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
              {datos.actualizado ? `${t("salud.guardada", { fecha: deIso(datos.actualizado) })} ` : ""}
              {t("salud.declarado")}
            </Texto>
          </>
        );
      }}
    </ConFicha>
  );
}
