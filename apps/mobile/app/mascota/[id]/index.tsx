import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Alert, View } from "react-native";
import { Identidad } from "@/components/Mascota";
import { Boton, Cargando, CodigoActivacion, Fila, Pantalla, Paso, Seccion, Tarjeta, Texto } from "@/components/ui";
import { impugnar, nuevoCodigoActivacion, yo, type Mascota } from "@/lib/api";
import { leerToken } from "@/lib/almacen";
import { useCarga } from "@/lib/datos";
import { deIso, ir } from "@/lib/salud";
import { espacio } from "@/lib/tema";

/* Una mascota, de un vistazo: qué está hecho y qué falta, en dos preguntas.
   «Si se pierde»: ¿van a poder llamarte? «Si le pasa algo»: ¿va a saber un
   veterinario que no la conoce lo que no puede darle? */

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
            ? ` Si no lo impugna, pasará a ti el ${deIso(r.plazo)}.`
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
        Si no haces nada, el chip pasará a esa persona el {deIso(r.plazo)}. Mientras tanto, tu perfil público no se
        muestra.
      </Texto>
      <Boton variante="peligro" alPulsar={alImpugnar} ocupado={enviando}>
        Impugnar: el animal es mío
      </Boton>
    </Tarjeta>
  );
}

/** Genera un código de activación nuevo y lo muestra una sola vez. */
function Activar({ m }: { m: Mascota }) {
  const [codigo, setCodigo] = useState<{ codigoActivacion: string; caduca: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function generar() {
    setOcupado(true);
    try {
      setCodigo(await nuevoCodigoActivacion(m.petId));
    } catch {
      Alert.alert("No se ha podido generar el código", "Vuelve a intentarlo en un momento.");
    } finally {
      setOcupado(false);
    }
  }

  if (codigo) return <CodigoActivacion codigo={codigo.codigoActivacion} caduca={codigo.caduca} nombre={m.perfil.nombre.trim()} />;
  return (
    <Boton alPulsar={() => void generar()} ocupado={ocupado}>
      Generar código de activación
    </Boton>
  );
}

export default function Resumen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { carga, refrescar, refrescando } = useCarga(yo);
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    void leerToken().then(setToken);
  }, []);

  const m = carga.estado === "listo" ? carga.datos.mascotas.find((x) => x.petId === id) : undefined;
  const base = `/mascota/${id}`;

  return (
    <Pantalla alRefrescar={refrescar} refrescando={refrescando} sinBorde>
      {carga.estado === "cargando" && <Cargando texto="Cargando…" />}
      {(carga.estado === "error" || (carga.estado === "listo" && !m)) && (
        <Tarjeta tono="alerta">
          <Texto>No se ha podido cargar. Tira hacia abajo para reintentar.</Texto>
        </Tarjeta>
      )}
      {m && (
        <>
          <Identidad m={m} token={token} />
          <Reclamacion m={m} alCambiar={() => void refrescar()} />

          {m.mensajes > 0 && (
            <Boton variante="secundario" alPulsar={() => router.navigate("/bandeja")}>
              {m.mensajes === 1 ? "1 mensaje en la bandeja" : `${m.mensajes} mensajes en la bandeja`}
            </Boton>
          )}

          <Seccion titulo="Si le pasa algo">
            <Paso
              hecho={m.ficha}
              titulo={m.ficha ? "Ficha de salud escrita" : "Ficha de salud"}
              detalle={
                m.ficha
                  ? "Alergias, medicación y enfermedades. Tenla al día."
                  : "Si tiene alguna alergia o toma medicación, un veterinario de urgencias no lo sabrá. Son cinco minutos."
              }
            />
            <Boton variante={m.ficha ? "secundario" : "primario"} alPulsar={() => ir(`${base}/salud`)}>
              {m.ficha ? "Ver la ficha de salud" : "Escribir la ficha de salud"}
            </Boton>
            <Paso
              hecho={m.placa}
              opcional
              titulo={m.placa ? "Placa del collar activa" : "Placa del collar"}
              detalle={
                m.placa
                  ? "Quien la escanee ve el resumen de urgencia, en su idioma."
                  : "Un QR en el collar que abre el resumen de urgencia en cualquier móvil."
              }
            />
            <View style={{ gap: espacio.sm }}>
              <Boton variante="secundario" alPulsar={() => ir(`${base}/placa`)}>
                {m.placa ? "Ver la placa" : "Preparar la placa"}
              </Boton>
              <Boton variante="secundario" alPulsar={() => ir(`${base}/compartir`)}>
                Enseñar el historial a un veterinario
              </Boton>
            </View>
          </Seccion>

          <Seccion titulo="Si se pierde">
            <Paso
              hecho={m.estado === "activa"}
              titulo="Chip activado en una clínica"
              detalle={
                m.estado === "pendiente"
                  ? "Una clínica tiene que leerlo con tu mascota delante. Genera el código cuando vayas a ir: el anterior, si lo había, deja de valer."
                  : m.activada
                    ? `Desde el ${deIso(m.activada)}`
                    : undefined
              }
            />
            {m.estado === "pendiente" && !m.reclamacion && <Activar m={m} />}
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
            <Boton variante="secundario" alPulsar={() => ir(`${base}/perfil`)}>
              Editar el perfil público
            </Boton>
            <Texto tono="suave">La foto se sube desde barkandmeow.app/mi-mascota.</Texto>
          </Seccion>

          <Seccion titulo="Para viajar">
            <Texto>Qué pide cada destino, qué consta ya y un QR para enseñarlo en la frontera.</Texto>
            <Boton variante="secundario" alPulsar={() => ir(`${base}/pasaporte`)}>
              Pasaporte de viaje
            </Boton>
          </Seccion>

          <Seccion titulo="Tu clínica de siempre">
            <Fila
              titulo="Permisos"
              detalle="Quién tiene acceso permanente a la ficha, y cómo retirarlo."
              accion="Abrir"
              alPulsar={() => router.navigate("/permisos")}
            />
          </Seccion>
        </>
      )}
    </Pantalla>
  );
}
