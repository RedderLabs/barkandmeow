import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import { Alert, Share, View } from "react-native";
import { fichaLista, terminoCronica, terminoReaccion, type FichaDueno } from "@barkandmeow/schema";
import { ConFicha } from "@/components/Mascota";
import { Qr } from "@/components/Qr";
import { Boton, Datos, Fila, Opciones, Seccion, Tarjeta, Texto } from "@/components/ui";
import { ErrorApi, quitarPlaca, WEB, type Mascota } from "@/lib/api";
import { enlacePlaca, nuevaPlaca } from "@/lib/ficha";
import { deIso, hoyIso, ir, useFicha, type Cambiar } from "@/lib/salud";
import { espacio, fuente, useColores } from "@/lib/tema";

/* La placa del collar (nivel 1). Un QR que cualquiera escanea con el móvil,
   sin aplicación y sin cuenta: abre el resumen de urgencia en el idioma de
   quien lo lee. La clave va dentro del propio QR, así que el servidor entrega
   un bloque que no puede abrir. Quien tenga la placa en la mano ve el resumen:
   por eso solo lleva lo de una urgencia, y el teléfono solo si el dueño quiere. */

/** Lo que enseñará la placa, dicho como en una ficha de papel. */
function Resumen({ f, telefono }: { f: FichaDueno; telefono: string }) {
  const c = useColores();
  return (
    <View>
      {f.alergias.length > 0 && (
        <Tarjeta tono="alerta">
          <Texto estilo={{ fontFamily: fuente.textoFuerte, fontSize: 13, letterSpacing: 0.8, color: c.alertInk }}>
            ALERGIAS
          </Texto>
          {f.alergias.map((a) => (
            <View key={a.id} style={{ gap: 2 }}>
              <Texto estilo={{ fontFamily: fuente.textoFuerte, fontSize: 17, color: c.alertInk }}>{a.sustancia}</Texto>
              <Texto estilo={{ color: c.alertSoftInk }}>{terminoReaccion(a).es}</Texto>
            </View>
          ))}
        </Tarjeta>
      )}
      {f.alergias.length === 0 && <Fila titulo="Alergias" detalle="Ninguna registrada" />}
      <Fila
        titulo="Medicación"
        detalle={f.medicacion.length ? f.medicacion.map((m) => [m.principio, m.dosis].filter(Boolean).join(" ")).join(" · ") : "Ninguna"}
      />
      <Fila
        titulo="Enfermedades crónicas"
        detalle={f.cronicas.length ? f.cronicas.map((x) => terminoCronica(x).es).join(" · ") : "Ninguna registrada"}
      />
      <Fila
        titulo="Rabia"
        detalle={
          f.rabiaHasta ? `${f.rabiaHasta < hoyIso() ? "Caducó el" : "Válida hasta el"} ${deIso(f.rabiaHasta)}` : "No consta"
        }
      />
      <Fila titulo="Teléfono" detalle={telefono || "No se enseña"} />
    </View>
  );
}

function Contenido({ m, datos, cambiar, alCambiar }: { m: Mascota; datos: FichaDueno; cambiar: Cambiar; alCambiar: () => void }) {
  const nombre = m.perfil.nombre.trim();
  const llamar = nombre || "tu mascota";
  const telefonos = m.perfil.telefonos;
  const [telefono, setTelefono] = useState(telefonos[0]?.numero ?? "");
  const [ocupado, setOcupado] = useState(false);
  const base = `/mascota/${m.petId}`;

  const opcionesTelefono = [
    ...telefonos.map((t) => [t.numero, t.etiqueta ? `${t.numero} · ${t.etiqueta}` : t.numero] as const),
    ["", "Ninguno"] as const,
  ];

  if (!fichaLista(datos))
    return (
      <Seccion titulo="Antes, la ficha de salud">
        <Texto>
          La placa enseña el resumen de urgencia de {llamar}: sus alergias, lo que toma y sus enfermedades. Escribe
          primero la ficha; después vuelve aquí y la placa se crea con un botón.
        </Texto>
        <Boton alPulsar={() => ir(`${base}/salud`)}>Escribir la ficha de salud</Boton>
      </Seccion>
    );

  async function crear() {
    setOcupado(true);
    // Guardar la ficha sube también el resumen cifrado con la clave de la placa.
    await cambiar((d) => ({
      ...d,
      placa: nuevaPlaca(Crypto.randomUUID(), Crypto.getRandomBytes(32), telefono, new Date()),
    }));
    setOcupado(false);
    alCambiar();
  }

  function sustituir() {
    Alert.alert("¿Sustituir la placa?", "El QR de ahora dejará de funcionar y tendrás que imprimir el nuevo. La ficha de salud no cambia.", [
      { text: "No, volver", style: "cancel" },
      { text: "Sí, crear un QR nuevo", onPress: () => void crear() },
    ]);
  }

  function retirar() {
    Alert.alert("¿Retirar la placa?", `El QR dejará de abrir nada y ${llamar} se quedará sin placa. Puedes crear otra cuando quieras.`, [
      { text: "No, volver", style: "cancel" },
      {
        text: "Sí, retirarla",
        style: "destructive",
        onPress: async () => {
          setOcupado(true);
          try {
            await quitarPlaca(m.petId).catch((e) => {
              // Si el servidor ya no la tenía, da igual: lo que importa es que no responda.
              if (!(e instanceof ErrorApi && e.estado === 404)) throw e;
            });
            await cambiar((d) => ({ ...d, placa: null }));
            alCambiar();
          } catch {
            Alert.alert("No se ha podido retirar", "Vuelve a intentarlo en un momento.");
          } finally {
            setOcupado(false);
          }
        },
      },
    ]);
  }

  const placa = datos.placa;
  if (!placa)
    return (
      <>
        <Seccion titulo="Crear la placa">
          <Texto>
            Quien la escanee con el móvil ve el resumen de urgencia de {llamar} en su idioma, sin instalar nada: un
            veterinario de guardia en otro país, o quien la encuentre.
          </Texto>
          <Opciones etiqueta="Teléfono que enseña la placa" opciones={opcionesTelefono} valor={telefono} alElegir={setTelefono} />
          {telefonos.length === 0 && (
            <Texto tono="suave">No tienes teléfonos en el perfil público. Se añaden en barkandmeow.app/mi-mascota.</Texto>
          )}
          <Boton alPulsar={() => void crear()} ocupado={ocupado}>
            Crear la placa
          </Boton>
        </Seccion>
        <Seccion titulo="Esto es lo que enseñará">
          <Resumen f={datos} telefono={telefono} />
        </Seccion>
      </>
    );

  const url = enlacePlaca(WEB, placa);
  return (
    <>
      <Seccion titulo="Placa activa">
        <Qr valor={url} etiqueta={`Código QR de la placa de ${llamar}`} />
        <Texto>
          Imprímelo o grábalo en una chapa y ponlo en su collar. También puedes escribir el enlace en una etiqueta NFC.
        </Texto>
        <View style={{ gap: espacio.sm }}>
          <Boton alPulsar={() => void Share.share({ message: url })}>Enviar o guardar el enlace</Boton>
        </View>
        <Datos>Creada el {deIso(placa.creada)}</Datos>
        <Texto tono="suave">No hay que cambiarla nunca: cuando actualizas la ficha, el mismo QR enseña lo nuevo.</Texto>
      </Seccion>

      <Seccion titulo="Lo que ve quien la escanea">
        <Resumen f={datos} telefono={placa.telefono} />
        <Opciones
          etiqueta="Teléfono que enseña la placa"
          opciones={
            placa.telefono && !telefonos.some((t) => t.numero === placa.telefono)
              ? [[placa.telefono, placa.telefono] as const, ...opcionesTelefono]
              : opcionesTelefono
          }
          valor={placa.telefono}
          alElegir={(v) => void cambiar((d) => (d.placa ? { ...d, placa: { ...d.placa, telefono: v } } : d))}
        />
        <Texto tono="suave">
          Además, el nombre, la especie, el sexo, la edad y el peso. Lo escribes tú: en la pantalla del veterinario
          sale como información del dueño, no como un registro oficial.
        </Texto>
      </Seccion>

      <Seccion titulo="Si pierdes la placa">
        <Texto>
          Quien tenga el QR puede ver el resumen de urgencia. Si la placa se pierde, sustitúyela: el QR anterior deja de
          abrir nada al momento.
        </Texto>
        <View style={{ gap: espacio.sm }}>
          <Boton variante="secundario" alPulsar={sustituir} ocupado={ocupado}>
            Sustituir la placa
          </Boton>
          <Boton variante="peligro" alPulsar={retirar} desactivado={ocupado}>
            Retirar la placa
          </Boton>
        </View>
      </Seccion>
    </>
  );
}

export default function Placa() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { estado, cambiar, recargar } = useFicha(id);
  return (
    <ConFicha
      estado={estado}
      titulo="Placa del collar"
      intro="Un QR que abre el resumen de urgencia en cualquier móvil, en el idioma de quien lo lee."
      alRefrescar={() => void recargar()}
    >
      {({ m, datos }) => <Contenido m={m} datos={datos} cambiar={cambiar} alCambiar={() => void recargar()} />}
    </ConFicha>
  );
}
