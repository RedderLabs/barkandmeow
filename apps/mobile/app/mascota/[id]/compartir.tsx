import { useCallback, useState } from "react";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import { Alert, Share, View } from "react-native";
import { fichaLista, type FichaDueno } from "@barkandmeow/schema";
import { ConFicha } from "@/components/Mascota";
import { Qr } from "@/components/Qr";
import { Boton, Fila, Opciones, Seccion, Texto } from "@/components/ui";
import { crearEnlace, leerBandeja, leerPasaporte, listarEnlaces, retirarEnlace, WEB, type Enlace, type Mascota } from "@/lib/api";
import { notasDeBandeja, registrosDePasaporte, sobreHistorial } from "@/lib/ficha";
import { useT, type Clave } from "@/lib/idioma";
import { deIso, ir, useFicha } from "@/lib/salud";
import { espacio } from "@/lib/tema";

/* Enseñar el historial a un veterinario durante unas horas (nivel 2).

   El dueño está en la consulta: crea un enlace, el veterinario lo escanea y ve
   la ficha, las vacunas y las notas anteriores en su idioma. Puede dejar la
   nota de la visita, que vuelve cifrada a la bandeja. El enlace caduca solo y
   se puede retirar antes. */

const DURACIONES = [
  [24, "compartir.duracion.24"],
  [72, "compartir.duracion.72"],
  [168, "compartir.duracion.168"],
] as const satisfies readonly (readonly [number, Clave])[];

const hora = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const dia = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

function Contenido({ m, datos, secreta }: { m: Mascota; datos: FichaDueno; secreta: Uint8Array }) {
  const t = useT();
  const nombre = m.perfil.nombre.trim();
  const [horas, setHoras] = useState<24 | 72 | 168>(24);
  const [creando, setCreando] = useState(false);
  const [hecho, setHecho] = useState<{ id: string; url: string; caduca: string; registros: number } | null>(null);
  const [enlaces, setEnlaces] = useState<Enlace[]>([]);

  const recargar = useCallback(
    () =>
      listarEnlaces(m.petId)
        .then((r) => setEnlaces(r.enlaces))
        .catch(() => undefined),
    [m.petId],
  );
  useFocusEffect(
    useCallback(() => {
      void recargar();
    }, [recargar]),
  );

  if (!fichaLista(datos))
    return (
      <Seccion titulo={t("compartir.antesFicha")}>
        <Texto>{nombre ? t("compartir.antesFichaTexto", { nombre }) : t("compartir.antesFichaTextoSin")}</Texto>
        <Boton alPulsar={() => ir(`/mascota/${m.petId}/salud`)}>{t("compartir.escribirFicha")}</Boton>
      </Seccion>
    );

  async function crear() {
    setCreando(true);
    try {
      // Lo que ya consta: el pasaporte de viaje y las notas de la bandeja. Si algo no abre, se comparte sin ello.
      const [pasaporte, bandeja] = await Promise.all([
        leerPasaporte(m.petId).catch(() => ({ sobre: null })),
        leerBandeja().catch(() => ({ mensajes: [] })),
      ]);
      const registros = [
        ...registrosDePasaporte(secreta, m.petId, pasaporte.sobre),
        ...notasDeBandeja(secreta, m.petId, bandeja.mensajes),
      ];
      const h = sobreHistorial(
        WEB,
        datos,
        // En la consulta el veterinario tiene que poder llamarte: el primer teléfono del perfil.
        { nombre, telefono: m.perfil.telefonos[0]?.numero ?? "", hoy: new Date() },
        registros,
        { id: Crypto.randomUUID(), clave: Crypto.getRandomBytes(32), nonce: Crypto.getRandomBytes(24) },
      );
      const r = await crearEnlace(m.petId, h.id, h.sobre, horas);
      setHecho({ id: h.id, url: h.url, caduca: r.caduca, registros: h.registros });
      await recargar();
    } catch {
      Alert.alert(t("compartir.errorCrear"), t("comun.errorReintentar"));
    } finally {
      setCreando(false);
    }
  }

  function retirar(id: string) {
    Alert.alert(t("compartir.retirarPregunta"), t("compartir.retirarTexto"), [
      { text: t("comun.volver"), style: "cancel" },
      {
        text: t("compartir.retirarSi"),
        style: "destructive",
        onPress: async () => {
          try {
            await retirarEnlace(m.petId, id);
            if (hecho?.id === id) setHecho(null);
            await recargar();
          } catch {
            Alert.alert(t("compartir.errorRetirar"), t("comun.errorReintentar"));
          }
        },
      },
    ]);
  }

  return (
    <>
      {hecho ? (
        <Seccion titulo={t("compartir.qrTitulo")}>
          <Qr valor={hecho.url} etiqueta={t("compartir.qrEtiqueta")} />
          <Texto>{t("compartir.qrTexto", { dia: dia(hecho.caduca), hora: hora(hecho.caduca) })}</Texto>
          <Texto tono="suave">
            {hecho.registros === 0
              ? t("compartir.lleva")
              : hecho.registros === 1
                ? t("compartir.llevaUno")
                : t("compartir.llevaVarios", { n: hecho.registros })}{" "}
            {t("compartir.guardalo")}
          </Texto>
          <View style={{ gap: espacio.sm }}>
            <Boton alPulsar={() => void Share.share({ message: hecho.url })}>{t("compartir.enviar")}</Boton>
            <Boton variante="secundario" alPulsar={() => setHecho(null)}>
              {t("comun.hecho")}
            </Boton>
          </View>
        </Seccion>
      ) : (
        <Seccion titulo={t("compartir.crearTitulo")}>
          <Opciones
            etiqueta={t("compartir.duracion")}
            opciones={DURACIONES.map(([v, k]) => [v, t(k)] as const)}
            valor={horas}
            alElegir={setHoras}
          />
          <Boton alPulsar={() => void crear()} ocupado={creando}>
            {t("compartir.crear")}
          </Boton>
          <Texto tono="suave">{t("compartir.crearTexto")}</Texto>
        </Seccion>
      )}

      {enlaces.length > 0 && (
        <Seccion titulo={t("compartir.abiertos")}>
          <Texto tono="suave">{t("compartir.abiertosTexto")}</Texto>
          <View>
            {enlaces.map((e) => (
              <Fila
                key={e.id}
                titulo={t("compartir.creado", { fecha: deIso(e.creado) })}
                detalle={t("compartir.valeHasta", { dia: dia(e.caduca), hora: hora(e.caduca) })}
                accion={t("compartir.retirar")}
                alPulsar={() => retirar(e.id)}
              />
            ))}
          </View>
        </Seccion>
      )}
    </>
  );
}

export default function Compartir() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { estado, recargar } = useFicha(id);
  return (
    <ConFicha
      estado={estado}
      titulo={t("compartir.titulo")}
      intro={t("compartir.intro")}
      alRefrescar={() => void recargar()}
    >
      {({ m, datos, secreta }) => <Contenido m={m} datos={datos} secreta={secreta} />}
    </ConFicha>
  );
}
