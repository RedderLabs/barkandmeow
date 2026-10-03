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
import { useT, type Clave, type T } from "@/lib/idioma";
import {
  abrirPasaporte,
  firmadosDeBandeja,
  registrosDeViaje,
  sobrePasaporte,
  traducirRequisito,
  type FilaPasaporte,
} from "@/lib/pasaporte";
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

// Nombre y ejemplos de cada destino; el orden es el de DESTINOS.
const NOMBRES_DESTINO = {
  ue: ["pasaporte.destino.ue", "pasaporte.destino.ue.detalle"],
  "ue-equinococo": ["pasaporte.destino.ueEquinococo", "pasaporte.destino.ueEquinococo.detalle"],
  gb: ["pasaporte.destino.gb", "pasaporte.destino.gb.detalle"],
  "fuera-ue": ["pasaporte.destino.fueraUe", "pasaporte.destino.fueraUe.detalle"],
} as const satisfies Record<Destino, readonly [Clave, Clave]>;
const destinos = (t: T) => (Object.keys(DESTINOS) as Destino[]).map((d) => [d, t(NOMBRES_DESTINO[d][0])] as const);
const DURACIONES = [
  [24, "compartir.duracion.24"],
  [72, "compartir.duracion.72"],
  [168, "compartir.duracion.168"],
] as const satisfies readonly (readonly [number, Clave])[];

const enUnaSemana = () => {
  const d = new Date(Date.now() + 7 * 864e5);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

function Viaje({ datos, evaluables }: { datos: PasaporteDueno; evaluables: RegistroEvaluable[] }) {
  const t = useT();
  const [destino, setDestino] = useState<Destino>("ue");
  const [llegada, setLlegada] = useState(enUnaSemana);
  const iso = aIso(llegada);
  const requisitos = useMemo(
    () => (iso ? evaluarViaje(datos, evaluables, destino, new Date(`${iso}T10:00:00`)) : []),
    [datos, evaluables, destino, iso],
  );
  const faltan = requisitos.filter((r) => r.estado === "falta").length;

  return (
    <Seccion titulo={t("pasaporte.viaje")}>
      <Opciones etiqueta={t("pasaporte.destino")} opciones={destinos(t)} valor={destino} alElegir={setDestino} />
      <Texto tono="suave">{t(NOMBRES_DESTINO[destino][1])}</Texto>
      <Campo
        etiqueta={t("pasaporte.llegada")}
        datos
        placeholder="14/03/2027"
        keyboardType="numbers-and-punctuation"
        maxLength={10}
        value={llegada}
        onChangeText={setLlegada}
        error={iso === null ? t("pasaporte.fechaMal") : null}
      />
      {iso ? (
        <>
          <Texto tono="fuerte">
            {faltan === 0
              ? t("pasaporte.nadaFalta")
              : faltan === 1
                ? t("pasaporte.faltaUno")
                : t("pasaporte.faltanVarios", { n: faltan })}
          </Texto>
          <View style={{ gap: espacio.lg }}>
            {requisitos.map((r) => {
              const { titulo, detalle } = traducirRequisito(r, t);
              return (
                <Paso
                  key={r.clave}
                  hecho={r.estado === "ok"}
                  opcional={r.estado === "info" || r.estado === "aviso"}
                  titulo={r.origen === "declarado" ? t("pasaporte.requisitoDeclarado", { titulo }) : titulo}
                  detalle={detalle}
                />
              );
            })}
          </View>
          <Texto tono="suave">{t("pasaporte.papelVale")}</Texto>
        </>
      ) : null}
    </Seccion>
  );
}

function Compartir({ m, datos }: { m: Mascota; datos: PasaporteDueno }) {
  const t = useT();
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
      Alert.alert(t("compartir.errorCrear"), t("comun.errorReintentar"));
    } finally {
      setCreando(false);
    }
  }

  return (
    <Seccion titulo={t("pasaporte.ensenar")}>
      {hecho ? (
        <>
          <Qr valor={hecho.url} etiqueta={t("pasaporte.qrEtiqueta")} />
          <Texto>{t("pasaporte.qrTexto", { fecha: deIso(hecho.caduca) })}</Texto>
          <Boton alPulsar={() => void Share.share({ message: hecho.url })}>{t("compartir.enviar")}</Boton>
          <Boton variante="secundario" alPulsar={() => setHecho(null)}>
            {t("comun.hecho")}
          </Boton>
        </>
      ) : (
        <>
          <Texto>{t("pasaporte.qrIntro")}</Texto>
          <Opciones
            etiqueta={t("pasaporte.validoDurante")}
            opciones={DURACIONES.map(([v, k]) => [v, t(k)] as const)}
            valor={horas}
            alElegir={setHoras}
          />
          <Boton alPulsar={() => void crear()} ocupado={creando}>
            {t("pasaporte.crearQr")}
          </Boton>
        </>
      )}
    </Seccion>
  );
}

export default function Pasaporte() {
  const c = useColores();
  const t = useT();
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
      setEstado({ tipo: "listo", m, datos, ...registrosDeViaje(datos, deBandeja, t) });
    } catch {
      setEstado((e) => (e.tipo === "listo" ? e : { tipo: "error" }));
    }
  }, [id, t]);

  useFocusEffect(
    useCallback(() => {
      void cargar();
    }, [cargar]),
  );

  return (
    <Pantalla alRefrescar={() => void cargar()} sinBorde>
      <View style={{ gap: espacio.sm }}>
        <Titulo>{t("comun.pantalla.pasaporte")}</Titulo>
        <Texto tono="suave">{t("pasaporte.intro")}</Texto>
      </View>

      {estado.tipo === "cargando" && <Cargando texto={t("pasaporte.abriendo")} />}
      {estado.tipo === "error" && (
        <Tarjeta tono="alerta">
          <Texto tono="fuerte">{t("pasaporte.errorAbrir")}</Texto>
          <Texto>{t("pasaporte.errorAbrirTexto")}</Texto>
        </Tarjeta>
      )}
      {estado.tipo === "sin-clave" && (
        <Tarjeta tono="aviso">
          <Texto tono="fuerte">{t("cuenta.claveNo")}</Texto>
          <Texto>{t("pasaporte.sinClaveTexto")}</Texto>
          <Boton alPulsar={() => ir("/clave")}>{t("cuenta.escribirCodigo")}</Boton>
        </Tarjeta>
      )}

      {estado.tipo === "listo" && (
        <>
          <Viaje datos={estado.datos} evaluables={estado.evaluables} />

          <Seccion titulo={t("pasaporte.consta")}>
            {estado.filas.length === 0 ? (
              <Texto tono="suave">{t("pasaporte.vacio")}</Texto>
            ) : (
              <View>
                {estado.filas.map((f) => (
                  <View key={f.id} style={{ paddingVertical: espacio.sm, borderTopWidth: 1, borderTopColor: c.divider, gap: 2 }}>
                    <Texto estilo={{ fontFamily: fuente.textoFuerte, fontSize: 15 }}>{f.titulo}</Texto>
                    {f.detalle ? <Datos>{f.detalle}</Datos> : null}
                    {/* De dónde sale el dato: es lo que importa en una frontera, así que va escrito. */}
                    <Texto estilo={{ fontSize: 13, color: f.certificado ? c.info : c.owner }}>
                      {f.certificado
                        ? f.clinica
                          ? t("pasaporte.firmadoPor", { clinica: f.clinica })
                          : t("pasaporte.firmadoClinica")
                        : t("pasaporte.declaradoTi")}
                    </Texto>
                  </View>
                ))}
              </View>
            )}
            <Fila
              titulo={t("pasaporte.datos")}
              detalle={[
                estado.datos.numeroPasaporte
                  ? t("pasaporte.numero", { numero: estado.datos.numeroPasaporte })
                  : t("pasaporte.sinNumero"),
                estado.datos.chip ? t("pasaporte.chip", { chip: estado.datos.chip }) : t("pasaporte.sinChip"),
              ].join(" · ")}
            />
          </Seccion>

          <Compartir m={estado.m} datos={estado.datos} />
        </>
      )}
    </Pantalla>
  );
}
