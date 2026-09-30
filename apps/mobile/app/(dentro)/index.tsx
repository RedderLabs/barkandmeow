import { useEffect, useState } from "react";
import { router } from "expo-router";
import { Alert, Image, Pressable, Text, View } from "react-native";
import { Boton, Cargando, Datos, Insignia, Pantalla, Tarjeta, Texto, Titulo } from "@/components/ui";
import { API, impugnar, yo, type Mascota } from "@/lib/api";
import { leerToken } from "@/lib/almacen";
import { useCarga } from "@/lib/datos";
import { espacio, fuente, radio, useColores } from "@/lib/tema";

/* «Mis mascotas»: la misma pregunta que el panel del portal. Si alguien
   encuentra a mi animal, ¿me van a poder llamar? La insignia lo contesta y
   debajo van los pasos. Lo que falta se edita en el portal web. */

const fecha = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

function Paso({ hecho, titulo, detalle }: { hecho: boolean; titulo: string; detalle?: string }) {
  const c = useColores();
  return (
    <View style={{ flexDirection: "row", gap: espacio.md, alignItems: "flex-start" }}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={{
          width: 22,
          height: 22,
          marginTop: 1,
          borderRadius: 11,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: hecho ? c.accent : "transparent",
          borderWidth: hecho ? 0 : 2,
          borderColor: c.warn,
        }}
      >
        {hecho && <Text style={{ color: c.accentOn, fontSize: 13, fontFamily: fuente.textoFuerte }}>✓</Text>}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Texto estilo={{ fontFamily: fuente.textoFuerte }}>
          {hecho ? "" : "Falta: "}
          {titulo}
        </Texto>
        {detalle ? <Texto tono="suave">{detalle}</Texto> : null}
      </View>
    </View>
  );
}

function Reclamacion({ m, alCambiar }: { m: Mascota; alCambiar: () => void }) {
  const r = m.reclamacion;
  const [enviando, setEnviando] = useState(false);
  if (!r) return null;
  const nombre = m.perfil.nombre || "tu mascota";
  if (r.rol === "reclamante")
    return (
      <Tarjeta tono="aviso">
        <Texto>
          Has reclamado este chip, que estaba activo a nombre de otra persona.
          {r.estado === "abierta"
            ? ` Si no lo impugna, pasará a ti el ${fecha(r.plazo)}.`
            : " La otra persona la ha impugnado: revisaremos el caso con la documentación de las dos partes."}
        </Texto>
      </Tarjeta>
    );
  if (r.estado === "impugnada")
    return (
      <Tarjeta tono="aviso">
        <Texto>
          Has impugnado la reclamación. El chip no cambiará de dueño mientras revisamos el caso; te escribiremos para
          pedirte la documentación.
        </Texto>
      </Tarjeta>
    );

  function alImpugnar() {
    Alert.alert(
      `¿Impugnar la reclamación sobre ${nombre}?`,
      "El chip no cambiará de dueño y revisaremos el caso a mano con la documentación de las dos partes.",
      [
        { text: "No, volver", style: "cancel" },
        {
          text: "Sí, impugnar",
          onPress: async () => {
            setEnviando(true);
            try {
              await impugnar(r!.id);
              alCambiar();
            } catch {
              Alert.alert("No se ha podido impugnar", "Vuelve a intentarlo en un momento o entra en el portal web.");
            } finally {
              setEnviando(false);
            }
          },
        },
      ],
    );
  }

  return (
    <Tarjeta tono="alerta">
      <Texto tono="fuerte">Alguien ha reclamado este chip</Texto>
      <Texto>
        Una clínica ha registrado que otra persona dice ser la dueña de {nombre} y ha llevado un animal con este chip.
        Si no haces nada, el chip pasará a esa persona el {fecha(r.plazo)}. Mientras tanto, tu perfil público no se
        muestra.
      </Texto>
      <Boton variante="peligro" alPulsar={alImpugnar} ocupado={enviando}>
        Impugnar: el animal es mío
      </Boton>
    </Tarjeta>
  );
}

function Ficha({ m, token, alCambiar }: { m: Mascota; token: string | null; alCambiar: () => void }) {
  const c = useColores();
  const nombre = m.perfil.nombre.trim();
  const reclamada = m.estado === "congelada" || m.reclamacion?.rol === "reclamante";
  const faltan = [m.estado === "activa", m.perfil.publicado, m.perfil.telefonos.length > 0].filter((x) => !x).length;

  return (
    <View
      style={{
        backgroundColor: c.surface,
        borderColor: c.line,
        borderWidth: 1,
        borderRadius: radio.panel,
        padding: espacio.xl,
        gap: espacio.xl,
      }}
    >
      <View style={{ flexDirection: "row", gap: espacio.lg, alignItems: "center" }}>
        {m.perfil.foto && token ? (
          <Image
            accessibilityIgnoresInvertColors
            source={{ uri: `${API}${m.perfil.foto}`, headers: { authorization: `Bearer ${token}`, "x-bm-cliente": "app" } }}
            style={{ width: 64, height: 64, borderRadius: radio.card, backgroundColor: c.divider }}
          />
        ) : (
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: radio.card,
              backgroundColor: c.ownerSoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontFamily: fuente.display, fontSize: 26, color: c.owner }}>
              {nombre ? nombre[0].toUpperCase() : "?"}
            </Text>
          </View>
        )}
        <View style={{ flex: 1, gap: espacio.xs }}>
          <Titulo nivel={2}>{nombre || "Sin nombre"}</Titulo>
          <Datos>CHIP ···· {m.chipPista ?? "····"}</Datos>
          {reclamada ? (
            <Insignia tono="aviso">En reclamación</Insignia>
          ) : faltan === 0 ? (
            <Insignia tono="listo">Todo en orden</Insignia>
          ) : (
            <Insignia tono="aviso">{faltan === 1 ? "Falta 1 paso" : `Faltan ${faltan} pasos`}</Insignia>
          )}
        </View>
      </View>

      <Reclamacion m={m} alCambiar={alCambiar} />

      <View style={{ gap: espacio.lg }}>
        <Texto tono="suave">Si se pierde</Texto>
        <Paso
          hecho={m.estado === "activa"}
          titulo="Chip activado en una clínica"
          detalle={
            m.estado === "pendiente"
              ? "Lleva a tu mascota a una clínica con el código de activación del portal."
              : m.activada
                ? `Desde el ${fecha(m.activada)}`
                : undefined
          }
        />
        <Paso
          hecho={m.perfil.publicado}
          titulo="Perfil público visible"
          detalle={m.perfil.publicado ? undefined : "Quien la encuentre no verá su nombre ni tu teléfono."}
        />
        <Paso
          hecho={m.perfil.telefonos.length > 0}
          titulo="Un teléfono para llamarte"
          detalle={m.perfil.telefonos.map((t) => t.etiqueta || t.numero).join(" · ") || undefined}
        />
      </View>

      {m.mensajes > 0 && (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.navigate("/bandeja")}
          style={{ minHeight: 44, justifyContent: "center" }}
        >
          <Texto estilo={{ color: c.accentInk, fontFamily: fuente.textoFuerte }}>
            {m.mensajes === 1 ? "1 mensaje en la bandeja" : `${m.mensajes} mensajes en la bandeja`} →
          </Texto>
        </Pressable>
      )}
    </View>
  );
}

export default function Mascotas() {
  const { carga, refrescar, refrescando } = useCarga(yo);
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    void leerToken().then(setToken);
  }, []);

  return (
    <Pantalla alRefrescar={refrescar} refrescando={refrescando}>
      <Titulo>Mis mascotas</Titulo>
      {carga.estado === "cargando" && <Cargando texto="Cargando tus mascotas…" />}
      {carga.estado === "error" && (
        <Tarjeta tono="alerta">
          <Texto>No se han podido cargar. Tira hacia abajo para reintentar.</Texto>
        </Tarjeta>
      )}
      {carga.estado === "listo" &&
        (carga.datos.mascotas.length === 0 ? (
          <Texto tono="suave">No tienes mascotas en esta cuenta. Añádelas desde el portal web.</Texto>
        ) : (
          carga.datos.mascotas.map((m) => (
            <Ficha key={m.petId} m={m} token={token} alCambiar={() => void refrescar()} />
          ))
        ))}
      <Texto tono="suave">El perfil público, los teléfonos y la foto se editan en barkandmeow.app/mi-mascota.</Texto>
    </Pantalla>
  );
}
