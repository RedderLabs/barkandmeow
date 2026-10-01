import { useCallback, useMemo, useState } from "react";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import { Alert, Share, View } from "react-native";
import { DESTINOS, evaluarViaje, type Destino, type PasaporteDueno } from "@barkandmeow/schema";
import { Qr } from "@/components/Qr";
import { Boton, Campo, Cargando, Datos, Fila, Opciones, Pantalla, Paso, Seccion, Tarjeta, Texto, Titulo } from "@/components/ui";
import { crearEnlace, leerBandeja, leerPasaporte, WEB, yo, type Mascota } from "@/lib/api";
import { leerClave } from "@/lib/almacen";
import { deBase64, iguales, publica } from "@/lib/cripto";
import { abrirPasaporte, firmadosDeBandeja, registrosDeViaje, sobrePasaporte, type FilaPasaporte } from "@/lib/pasaporte";
import { aIso, deIso, ir } from "@/lib/salud";
import { espacio, fuente, useColores } from "@/lib/tema";
import type { RegistroEvaluable } from "@barkandmeow/schema";

/* El pasaporte de viaje en el teléfono: qué consta, qué falta para un viaje y
   un QR para enseñarlo en la frontera. No sustituye al pasaporte europeo de
   papel: es su copia digital, con cada dato marcado por su origen. Apuntar
   registros a mano se hace en barkandmeow.app/mi-mascota. */

type Estado =
  | { tipo: "cargando" }
  | { tipo: "error" }
  | { tipo: "sin-clave"; m: Mascota }
  | { tipo: "listo"; m: Mascota; datos: PasaporteDueno; filas: FilaPasaporte[]; evaluables: RegistroEvaluable[] };

const DESTINOS_OPC = (Object.keys(DESTINOS) as Destino[]).map((d) => [d, DESTINOS[d].nombre] as const);
const DURACIONES = [
  [24, "24 horas"],
  [72, "3 días"],
  [168, "7 días"],
] as const;

const enUnaSemana = () => {
  const d = new Date(Date.now() + 7 * 864e5);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

function Viaje({ datos, evaluables }: { datos: PasaporteDueno; evaluables: RegistroEvaluable[] }) {
  const [destino, setDestino] = useState<Destino>("ue");
  const [llegada, setLlegada] = useState(enUnaSemana);
  const iso = aIso(llegada);
  const requisitos = useMemo(
    () => (iso ? evaluarViaje(datos, evaluables, destino, new Date(`${iso}T10:00:00`)) : []),
    [datos, evaluables, destino, iso],
  );
  const faltan = requisitos.filter((r) => r.estado === "falta").length;

  return (
    <Seccion titulo="Preparar un viaje">
      <Opciones etiqueta="Destino" opciones={DESTINOS_OPC} valor={destino} alElegir={setDestino} />
      <Texto tono="suave">{DESTINOS[destino].detalle}</Texto>
      <Campo
        etiqueta="Día de llegada"
        datos
        placeholder="14/03/2027"
        keyboardType="numbers-and-punctuation"
        maxLength={10}
        value={llegada}
        onChangeText={setLlegada}
        error={iso === null ? "La fecha, así: 14/03/2027." : null}
      />
      {iso ? (
        <>
          <Texto tono="fuerte">
            {faltan === 0
              ? "Con lo que consta, no falta nada obligatorio."
              : faltan === 1
                ? "Falta 1 requisito."
                : `Faltan ${faltan} requisitos.`}
          </Texto>
          <View style={{ gap: espacio.lg }}>
            {requisitos.map((r) => (
              <Paso
                key={r.clave}
                hecho={r.estado === "ok"}
                opcional={r.estado === "info" || r.estado === "aviso"}
                titulo={r.titulo + (r.origen === "declarado" ? " (declarado por ti)" : "")}
                detalle={r.detalle}
              />
            ))}
          </View>
          <Texto tono="suave">
            En la frontera vale el pasaporte de papel. Esto te ayuda a llegar con todo en regla; compruébalo con tu
            veterinario antes de viajar.
          </Texto>
        </>
      ) : null}
    </Seccion>
  );
}

function Compartir({ m, datos }: { m: Mascota; datos: PasaporteDueno }) {
  const [horas, setHoras] = useState<24 | 72 | 168>(72);
  const [creando, setCreando] = useState(false);
  const [hecho, setHecho] = useState<{ url: string; caduca: string } | null>(null);

  async function crear() {
    setCreando(true);
    try {
      const c = sobrePasaporte(WEB, datos, m.perfil.nombre.trim(), new Date(), {
        id: Crypto.randomUUID(),
        clave: Crypto.getRandomBytes(32),
        nonce: Crypto.getRandomBytes(24),
      });
      const r = await crearEnlace(m.petId, c.id, c.sobre, horas);
      setHecho({ url: c.url, caduca: r.caduca });
    } catch {
      Alert.alert("No se ha podido crear el enlace", "Vuelve a intentarlo en un momento.");
    } finally {
      setCreando(false);
    }
  }

  return (
    <Seccion titulo="Enseñarlo en el viaje">
      {hecho ? (
        <>
          <Qr valor={hecho.url} etiqueta="Código QR del pasaporte de viaje" />
          <Texto>
            Abre este pasaporte en el móvil del veterinario de frontera o de la compañía, en su idioma. Vale hasta el{" "}
            {deIso(hecho.caduca)}.
          </Texto>
          <Boton alPulsar={() => void Share.share({ message: hecho.url })}>Enviar el enlace</Boton>
          <Boton variante="secundario" alPulsar={() => setHecho(null)}>
            Hecho
          </Boton>
        </>
      ) : (
        <>
          <Texto>
            Un QR que abre el pasaporte allí donde te lo pidan. Comprueban en el momento qué firmó cada clínica. Caduca
            solo, y los enlaces abiertos se retiran desde «Compartir».
          </Texto>
          <Opciones etiqueta="Válido durante" opciones={DURACIONES} valor={horas} alElegir={setHoras} />
          <Boton alPulsar={() => void crear()} ocupado={creando}>
            Crear el QR
          </Boton>
        </>
      )}
    </Seccion>
  );
}

export default function Pasaporte() {
  const c = useColores();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [estado, setEstado] = useState<Estado>({ tipo: "cargando" });

  const cargar = useCallback(async () => {
    try {
      const [yoMismo, clave] = await Promise.all([yo(), leerClave()]);
      const m = yoMismo.mascotas.find((x) => x.petId === id);
      if (!m) return setEstado({ tipo: "error" });
      if (!clave || !iguales(publica(clave), deBase64(yoMismo.pubKey))) return setEstado({ tipo: "sin-clave", m });
      const [pasaporte, bandeja] = await Promise.all([leerPasaporte(id), leerBandeja().catch(() => ({ mensajes: [] }))]);
      const datos = abrirPasaporte(clave, id, pasaporte.sobre);
      // Lo que firmó la clínica y aún espera en la bandeja también cuenta.
      const deBandeja = firmadosDeBandeja(clave, id, m.chipPista, datos, bandeja.mensajes);
      setEstado({ tipo: "listo", m, datos, ...registrosDeViaje(datos, deBandeja) });
    } catch {
      setEstado((e) => (e.tipo === "listo" ? e : { tipo: "error" }));
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void cargar();
    }, [cargar]),
  );

  return (
    <Pantalla alRefrescar={() => void cargar()} sinBorde>
      <View style={{ gap: espacio.sm }}>
        <Titulo>Pasaporte de viaje</Titulo>
        <Texto tono="suave">
          La copia digital de su pasaporte europeo: lo que firma tu clínica, lo que apuntas tú y lo que falta para cada
          viaje.
        </Texto>
      </View>

      {estado.tipo === "cargando" && <Cargando texto="Abriendo el pasaporte…" />}
      {estado.tipo === "error" && (
        <Tarjeta tono="alerta">
          <Texto tono="fuerte">No se ha podido abrir el pasaporte.</Texto>
          <Texto>Revisa la conexión y tira hacia abajo para reintentar.</Texto>
        </Tarjeta>
      )}
      {estado.tipo === "sin-clave" && (
        <Tarjeta tono="aviso">
          <Texto tono="fuerte">Este móvil no tiene tu clave</Texto>
          <Texto>
            El pasaporte se guarda cerrado con tu clave. Escribe el código de recuperación que apuntaste en papel: la
            clave se rehace aquí y no sale del móvil.
          </Texto>
          <Boton alPulsar={() => ir("/clave")}>Escribir el código</Boton>
        </Tarjeta>
      )}

      {estado.tipo === "listo" && (
        <>
          <Viaje datos={estado.datos} evaluables={estado.evaluables} />

          <Seccion titulo="Lo que consta">
            {estado.filas.length === 0 ? (
              <Texto tono="suave">
                Todavía no hay nada. Lo que envíe tu clínica aparece aquí solo; lo que quieras apuntar tú se añade en
                barkandmeow.app/mi-mascota.
              </Texto>
            ) : (
              <View>
                {estado.filas.map((f) => (
                  <View key={f.id} style={{ paddingVertical: espacio.sm, borderTopWidth: 1, borderTopColor: c.divider, gap: 2 }}>
                    <Texto estilo={{ fontFamily: fuente.textoFuerte, fontSize: 15 }}>{f.titulo}</Texto>
                    {f.detalle ? <Datos>{f.detalle}</Datos> : null}
                    {/* De dónde sale el dato: es lo que importa en una frontera, así que va escrito. */}
                    <Texto estilo={{ fontSize: 13, color: f.certificado ? c.info : c.owner }}>
                      {f.certificado ? `Firmado por ${f.clinica || "la clínica"}` : "Declarado por ti"}
                    </Texto>
                  </View>
                ))}
              </View>
            )}
            <Fila
              titulo="Datos del pasaporte"
              detalle={[
                estado.datos.numeroPasaporte ? `Nº ${estado.datos.numeroPasaporte}` : "Sin número de pasaporte",
                estado.datos.chip ? `chip ${estado.datos.chip}` : "sin chip completo",
              ].join(" · ")}
            />
          </Seccion>

          <Compartir m={estado.m} datos={estado.datos} />
        </>
      )}
    </Pantalla>
  );
}
