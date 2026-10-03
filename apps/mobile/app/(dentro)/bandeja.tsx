import { useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import * as Linking from "expo-linking";
import { Alert, Pressable, View } from "react-native";
import {
  Boton,
  Cargando,
  Datos,
  Pantalla,
  Tarjeta,
  Texto,
  Titulo,
} from "@/components/ui";
import { borrarMensaje, borrarMensajes, leerBandeja, yo } from "@/lib/api";
import { leerClave } from "@/lib/almacen";
import { rellenarRecuperacion } from "@/lib/recuperacion";
import { abrirTodos, type Mensaje } from "@/lib/bandeja";
import { deBase64, iguales, publica } from "@/lib/cripto";
import { useCarga } from "@/lib/datos";
import { espacio, fuente, useColores } from "@/lib/tema";

/* La bandeja en el teléfono. Los mensajes llegan sellados a la clave pública
   del dueño y se abren aquí, con la secreta del llavero. Si no está (móvil
   nuevo, sesión cerrada), el código en papel la reconstruye. */

type Vista =
  | { falta: true }
  | { falta: false; mensajes: Mensaje[]; nombres: Record<string, string> };

async function cargar(): Promise<Vista> {
  const [yoMismo, clave] = await Promise.all([yo(), leerClave()]);
  rellenarRecuperacion(yoMismo, clave);
  if (!clave || !iguales(publica(clave), deBase64(yoMismo.pubKey)))
    return { falta: true };
  const { mensajes } = await leerBandeja();
  return {
    falta: false,
    mensajes: abrirTodos(clave, mensajes),
    nombres: Object.fromEntries(
      yoMismo.mascotas.map((m) => [m.petId, m.perfil.nombre]),
    ),
  };
}

const cuando = (iso: string) => {
  const d = new Date(iso);
  const dd = (n: number) => String(n).padStart(2, "0");
  return `${dd(d.getDate())}/${dd(d.getMonth() + 1)}/${d.getFullYear()} · ${dd(d.getHours())}:${dd(d.getMinutes())}`;
};

function Filas({ filas }: { filas: [string, string][] }) {
  return (
    <View style={{ gap: espacio.sm }}>
      {filas
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <View key={k} style={{ gap: 2 }}>
            <Datos>{k.toUpperCase()}</Datos>
            <Texto>{v}</Texto>
          </View>
        ))}
    </View>
  );
}

function Tarjetita({
  m,
  nombre,
  alBorrar,
  marcada,
  alMarcar,
}: {
  m: Mensaje;
  nombre: string;
  alBorrar: () => void;
  /** Solo en modo selección: si está marcada para borrar en bloque. */
  marcada?: boolean;
  alMarcar?: () => void;
}) {
  const c = useColores();
  const x = m.contenido;
  const titulo =
    x.tipo === "aviso"
      ? `Una clínica tiene a ${nombre}`
      : x.tipo === "nota"
        ? x.motivo || "Nota de la consulta"
        : x.tipo === "informe"
          ? x.motivo || "Informe de la clínica"
          : x.tipo === "certificado"
            ? x.titulo
            : x.tipo === "firma-mala"
              ? "Registro con una firma que no cuadra"
              : "Mensaje que no se puede abrir";
  const etiqueta = {
    aviso: "Aviso",
    nota: "Nota de consulta",
    informe: "Informe",
    certificado: "Pasaporte",
    "firma-mala": "Sin validar",
    ilegible: "Sin abrir",
  }[x.tipo];

  function confirmarBorrado() {
    Alert.alert(
      "¿Borrar este mensaje?",
      "Se borra del servidor y no se puede recuperar. Si es una nota o un informe y lo quieres conservar, guárdalo antes por tu cuenta.",
      [
        { text: "No, volver", style: "cancel" },
        { text: "Sí, borrar", style: "destructive", onPress: alBorrar },
      ],
    );
  }

  return (
    <Tarjeta tono={x.tipo === "aviso" ? "alerta" : "normal"}>
      {alMarcar && (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: !!marcada }}
          accessibilityLabel={`Seleccionar: ${titulo}`}
          onPress={alMarcar}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: espacio.sm,
            minHeight: 44,
          }}
        >
          <Ionicons
            name={marcada ? "checkbox" : "square-outline"}
            size={24}
            color={marcada ? c.accent : c.muted}
          />
          <Texto tono="fuerte">
            {marcada ? "Seleccionado" : "Seleccionar"}
          </Texto>
        </Pressable>
      )}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          gap: espacio.sm,
          flexWrap: "wrap",
        }}
      >
        <Datos>
          {etiqueta.toUpperCase()} · {nombre}
        </Datos>
        <Datos>{cuando(m.llegada)}</Datos>
      </View>
      <Texto tono="fuerte">{titulo}</Texto>

      {/* El remitente lo pone el servidor por la clave con que llegó; lo de dentro, la clínica. */}
      {m.origen && (
        <Texto tono="suave">
          Enviado por {m.origen.clinica}
          {m.origen.dominio
            ? ` · ${m.origen.dominio}, dominio verificado`
            : ` · ${m.origen.pais}`}{" "}
          · desde su software de gestión
        </Texto>
      )}

      {x.tipo === "aviso" && (
        <>
          <Texto>
            {x.clinica || "Una clínica veterinaria"} ha leído el chip de{" "}
            {nombre} y quiere hablar contigo
            {x.motivo ? `: «${x.motivo}»` : "."}
          </Texto>
          {x.telefono ? (
            <Boton
              alPulsar={() =>
                void Linking.openURL(`tel:${x.telefono.replace(/[^\d+]/g, "")}`)
              }
            >
              {`Llamar a la clínica · ${x.telefono}`}
            </Boton>
          ) : null}
        </>
      )}
      {x.tipo === "nota" && (
        <Filas
          filas={[
            ["Clínica", x.clinica],
            ["Diagnóstico", x.diagnostico],
            ["Tratamiento", x.tratamiento],
            ["Observaciones", x.observaciones],
          ]}
        />
      )}
      {x.tipo === "informe" && (
        <>
          <Filas
            filas={[
              ["Fecha", x.fecha && x.fecha.split("-").reverse().join("/")],
              ["Veterinario", x.veterinario],
              ["Diagnóstico", x.diagnostico],
              ["Tratamiento", x.tratamiento],
              ["Observaciones", x.observaciones],
            ]}
          />
          {x.firmado && (
            <Texto tono="suave">
              Firma de la clínica comprobada en este móvil.
            </Texto>
          )}
        </>
      )}
      {x.tipo === "certificado" && (
        <>
          <Texto>{x.detalle}</Texto>
          <Texto tono="suave">
            Firma de la clínica comprobada. Se guarda en el pasaporte de viaje
            al abrirlo en el portal web.
          </Texto>
        </>
      )}
      {x.tipo === "firma-mala" && (
        <Texto>
          Dice venir de tu clínica, pero la firma no es la de su conexión con
          Bark &amp; Meow. Si esperabas un registro, pregunta a tu clínica.
        </Texto>
      )}
      {x.tipo === "ilegible" && (
        <Texto>
          No se ha podido abrir con tu clave. Puede estar dañado o sellado para
          otra clave.
        </Texto>
      )}

      {!alMarcar && (
        <Pressable
          accessibilityRole="button"
          onPress={confirmarBorrado}
          style={{
            alignSelf: "flex-end",
            minHeight: 44,
            minWidth: 44,
            justifyContent: "center",
            paddingHorizontal: 8,
          }}
        >
          <Texto estilo={{ color: c.alertInk, fontFamily: fuente.textoFuerte }}>
            Borrar
          </Texto>
        </Pressable>
      )}
    </Tarjeta>
  );
}

export default function Bandeja() {
  const { carga, refrescar, refrescando, setCarga } = useCarga(cargar);
  // null: no se está seleccionando. Si no, los ids marcados para borrar de golpe.
  const [seleccion, setSeleccion] = useState<Set<string> | null>(null);
  const [borrando, setBorrando] = useState(false);
  const mensajes =
    carga.estado === "listo" && !carga.datos.falta ? carga.datos.mensajes : [];
  const todosMarcados =
    !!seleccion &&
    mensajes.length > 0 &&
    mensajes.every((m) => seleccion.has(m.id));

  function quitarDeLaLista(ids: Set<string>) {
    setCarga((c) =>
      c.estado === "listo" && !c.datos.falta
        ? {
            ...c,
            datos: {
              ...c.datos,
              mensajes: c.datos.mensajes.filter((m) => !ids.has(m.id)),
            },
          }
        : c,
    );
  }

  function marcar(id: string) {
    setSeleccion((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function confirmarBorradoEnBloque() {
    if (!seleccion?.size) return;
    const n = seleccion.size;
    Alert.alert(
      n === 1 ? "¿Borrar 1 mensaje?" : `¿Borrar ${n} mensajes?`,
      "Se borran del servidor y no se pueden recuperar. Si hay notas o informes que quieras conservar, guárdalos antes por tu cuenta.",
      [
        { text: "No, volver", style: "cancel" },
        {
          text: "Sí, borrar",
          style: "destructive",
          onPress: () => void borrarSeleccion(),
        },
      ],
    );
  }

  async function borrarSeleccion() {
    if (!seleccion?.size) return;
    const ids = new Set(seleccion);
    setBorrando(true);
    try {
      await borrarMensajes([...ids]);
      quitarDeLaLista(ids);
      setSeleccion(null);
    } catch {
      Alert.alert(
        "No se ha podido borrar",
        "Vuelve a intentarlo en un momento.",
      );
    } finally {
      setBorrando(false);
    }
  }

  async function alBorrar(id: string) {
    try {
      await borrarMensaje(id);
      quitarDeLaLista(new Set([id]));
    } catch {
      Alert.alert(
        "No se ha podido borrar",
        "Vuelve a intentarlo en un momento.",
      );
    }
  }

  return (
    <Pantalla alRefrescar={refrescar} refrescando={refrescando}>
      <Titulo>Bandeja</Titulo>
      {carga.estado === "cargando" && <Cargando texto="Abriendo tu bandeja…" />}
      {carga.estado === "error" && (
        <Tarjeta tono="alerta">
          <Texto>
            No se ha podido cargar la bandeja. Tira hacia abajo para reintentar.
          </Texto>
        </Tarjeta>
      )}
      {carga.estado === "listo" && carga.datos.falta && (
        <Tarjeta tono="aviso">
          <Texto tono="fuerte">Este móvil no tiene tu clave</Texto>
          <Texto>
            Las notas, los informes y los avisos llegan cerrados con tu clave, y
            solo se abren donde está guardada. Escribe el código de recuperación
            que apuntaste en el alta: la clave se reconstruye aquí y no sale del
            móvil.
          </Texto>
          <Boton alPulsar={() => router.push("/clave")}>
            Escribir el código
          </Boton>
        </Tarjeta>
      )}
      {carga.estado === "listo" &&
        !carga.datos.falta &&
        (carga.datos.mensajes.length === 0 ? (
          <Texto tono="suave">
            No tienes mensajes. Aquí llegan las notas que te deja el veterinario
            después de una consulta, los informes de tu clínica habitual y los
            avisos de una clínica si alguien lleva a tu mascota perdida.
          </Texto>
        ) : (
          <>
            {seleccion ? (
              <View style={{ gap: espacio.sm }}>
                <Boton
                  variante="secundario"
                  alPulsar={() =>
                    setSeleccion(
                      todosMarcados
                        ? new Set()
                        : new Set(mensajes.map((m) => m.id)),
                    )
                  }
                >
                  {todosMarcados ? "Quitar todos" : "Seleccionar todos"}
                </Boton>
                <Boton
                  variante="peligro"
                  desactivado={!seleccion.size}
                  ocupado={borrando}
                  alPulsar={confirmarBorradoEnBloque}
                >
                  {seleccion.size
                    ? `Borrar ${seleccion.size} seleccionado${seleccion.size === 1 ? "" : "s"}`
                    : "Borrar"}
                </Boton>
                <Boton
                  variante="secundario"
                  desactivado={borrando}
                  alPulsar={() => setSeleccion(null)}
                >
                  Cancelar
                </Boton>
              </View>
            ) : (
              <Boton
                variante="secundario"
                alPulsar={() => setSeleccion(new Set())}
              >
                Seleccionar mensajes
              </Boton>
            )}
            {carga.datos.mensajes.map((m) => (
              <Tarjetita
                key={m.id}
                m={m}
                nombre={
                  (!carga.datos.falta && carga.datos.nombres[m.petId]) ||
                  "Tu mascota"
                }
                alBorrar={() => void alBorrar(m.id)}
                marcada={seleccion?.has(m.id)}
                alMarcar={seleccion ? () => marcar(m.id) : undefined}
              />
            ))}
          </>
        ))}
    </Pantalla>
  );
}
