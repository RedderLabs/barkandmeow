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
import { deIso, ir, useFicha } from "@/lib/salud";
import { espacio } from "@/lib/tema";

/* Enseñar el historial a un veterinario durante unas horas (nivel 2).

   El dueño está en la consulta: crea un enlace, el veterinario lo escanea y ve
   la ficha, las vacunas y las notas anteriores en su idioma. Puede dejar la
   nota de la visita, que vuelve cifrada a la bandeja. El enlace caduca solo y
   se puede retirar antes. */

const DURACIONES = [
  [24, "24 horas"],
  [72, "3 días"],
  [168, "7 días"],
] as const;

const hora = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const dia = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

function Contenido({ m, datos, secreta }: { m: Mascota; datos: FichaDueno; secreta: Uint8Array }) {
  const nombre = m.perfil.nombre.trim();
  const llamar = nombre || "tu mascota";
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
      <Seccion titulo="Antes, la ficha de salud">
        <Texto>
          Lo que se enseña es la ficha de {llamar}: sus alergias, lo que toma y sus enfermedades. Escríbela primero y
          vuelve aquí.
        </Texto>
        <Boton alPulsar={() => ir(`/mascota/${m.petId}/salud`)}>Escribir la ficha de salud</Boton>
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
      Alert.alert("No se ha podido crear el enlace", "Vuelve a intentarlo en un momento.");
    } finally {
      setCreando(false);
    }
  }

  function retirar(id: string) {
    Alert.alert("¿Retirar este enlace?", "Dejará de abrirse al momento. Lo que alguien vio no se puede borrar.", [
      { text: "No, volver", style: "cancel" },
      {
        text: "Sí, retirarlo",
        style: "destructive",
        onPress: async () => {
          try {
            await retirarEnlace(m.petId, id);
            if (hecho?.id === id) setHecho(null);
            await recargar();
          } catch {
            Alert.alert("No se ha podido retirar", "Vuelve a intentarlo en un momento.");
          }
        },
      },
    ]);
  }

  return (
    <>
      {hecho ? (
        <Seccion titulo="Enséñale este QR">
          <Qr valor={hecho.url} etiqueta="Código QR del enlace al historial" />
          <Texto>
            El veterinario lo escanea con su móvil. Vale hasta el {dia(hecho.caduca)} a las {hora(hecho.caduca)}.
          </Texto>
          <Texto tono="suave">
            Lleva la ficha de salud
            {hecho.registros > 0
              ? ` y ${hecho.registros === 1 ? "un registro" : `${hecho.registros} registros`} de vacunas, tratamientos y notas.`
              : "."}{" "}
            Guárdalo ahora: la clave va en el propio enlace y no se puede volver a mostrar.
          </Texto>
          <View style={{ gap: espacio.sm }}>
            <Boton alPulsar={() => void Share.share({ message: hecho.url })}>Enviar el enlace</Boton>
            <Boton variante="secundario" alPulsar={() => setHecho(null)}>
              Hecho
            </Boton>
          </View>
        </Seccion>
      ) : (
        <Seccion titulo="Crear un enlace">
          <Opciones etiqueta="Cuánto tiempo vale" opciones={DURACIONES} valor={horas} alElegir={setHoras} />
          <Boton alPulsar={() => void crear()} ocupado={creando}>
            Crear el enlace
          </Boton>
          <Texto tono="suave">
            Verá la ficha de salud, las vacunas y tratamientos que constan y las notas de consultas anteriores, en su
            idioma y sin crear una cuenta. Puede dejarte la nota de la visita: te llega cifrada a la bandeja.
          </Texto>
        </Seccion>
      )}

      {enlaces.length > 0 && (
        <Seccion titulo="Enlaces que siguen abiertos">
          <Texto tono="suave">Los de esta pantalla y los del pasaporte de viaje.</Texto>
          <View>
            {enlaces.map((e) => (
              <Fila
                key={e.id}
                titulo={`Creado el ${deIso(e.creado)}`}
                detalle={`Vale hasta el ${dia(e.caduca)} a las ${hora(e.caduca)}`}
                accion="Retirar"
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
  const { id } = useLocalSearchParams<{ id: string }>();
  const { estado, recargar } = useFicha(id);
  return (
    <ConFicha
      estado={estado}
      titulo="Compartir con un veterinario"
      intro="Para una consulta fuera de casa: un enlace que enseña el historial y caduca solo."
      alRefrescar={() => void recargar()}
    >
      {({ m, datos, secreta }) => <Contenido m={m} datos={datos} secreta={secreta} />}
    </ConFicha>
  );
}
