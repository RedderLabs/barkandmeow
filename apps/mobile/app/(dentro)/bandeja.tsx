import { useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import * as Linking from "expo-linking";
import { Alert, Pressable, View } from "react-native";
import { Boton, Cargando, Datos, Pantalla, Tarjeta, Texto, Titulo } from "@/components/ui";
import { borrarMensaje, borrarMensajes, leerBandeja, yo } from "@/lib/api";
import { leerClave } from "@/lib/almacen";
import { rellenarRecuperacion } from "@/lib/recuperacion";
import { abrirTodos, resumenRegistro, type Mensaje } from "@/lib/bandeja";
import { deBase64, iguales, publica } from "@/lib/cripto";
import { useCarga } from "@/lib/datos";
import { useT } from "@/lib/idioma";
import { espacio, fuente, useColores } from "@/lib/tema";

/* La bandeja en el teléfono. Los mensajes llegan sellados a la clave pública
   del dueño y se abren aquí, con la secreta del llavero. Si no está (móvil
   nuevo, sesión cerrada), el código en papel la reconstruye. */

type Vista = { falta: true } | { falta: false; mensajes: Mensaje[]; nombres: Record<string, string> };

async function cargar(): Promise<Vista> {
  const [yoMismo, clave] = await Promise.all([yo(), leerClave()]);
  rellenarRecuperacion(yoMismo, clave);
  if (!clave || !iguales(publica(clave), deBase64(yoMismo.pubKey))) return { falta: true };
  const { mensajes } = await leerBandeja();
  return {
    falta: false,
    mensajes: abrirTodos(clave, mensajes),
    nombres: Object.fromEntries(yoMismo.mascotas.map((m) => [m.petId, m.perfil.nombre])),
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
  const t = useT();
  const x = m.contenido;
  const registro = x.tipo === "certificado" ? resumenRegistro(x.registro, t) : null;
  const titulo =
    x.tipo === "aviso"
      ? t("bandeja.titulo.aviso", { nombre })
      : x.tipo === "nota"
        ? x.motivo || t("bandeja.titulo.nota")
        : x.tipo === "informe"
          ? x.motivo || t("bandeja.titulo.informe")
          : registro
            ? registro.titulo
            : x.tipo === "firma-mala"
              ? t("bandeja.titulo.firmaMala")
              : t("bandeja.titulo.ilegible");
  const etiqueta = t(
    (
      {
        aviso: "bandeja.tipo.aviso",
        nota: "bandeja.tipo.nota",
        informe: "bandeja.tipo.informe",
        certificado: "bandeja.tipo.certificado",
        "firma-mala": "bandeja.tipo.firmaMala",
        ilegible: "bandeja.tipo.ilegible",
      } as const
    )[x.tipo],
  );

  function confirmarBorrado() {
    Alert.alert(t("bandeja.borrarUno"), t("bandeja.borrarUnoTexto"), [
      { text: t("comun.volver"), style: "cancel" },
      { text: t("comun.siBorrar"), style: "destructive", onPress: alBorrar },
    ]);
  }

  return (
    <Tarjeta tono={x.tipo === "aviso" ? "alerta" : "normal"}>
      {alMarcar && (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: !!marcada }}
          accessibilityLabel={t("bandeja.seleccionarMensaje", { titulo })}
          onPress={alMarcar}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: espacio.sm,
            minHeight: 44,
          }}
        >
          <Ionicons name={marcada ? "checkbox" : "square-outline"} size={24} color={marcada ? c.accent : c.muted} />
          <Texto tono="fuerte">{marcada ? t("bandeja.seleccionado") : t("bandeja.seleccionar")}</Texto>
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
          {m.origen.dominio
            ? t("bandeja.enviadoDominio", { clinica: m.origen.clinica, dominio: m.origen.dominio })
            : t("bandeja.enviadoPais", { clinica: m.origen.clinica, pais: m.origen.pais })}
        </Texto>
      )}

      {x.tipo === "aviso" && (
        <>
          <Texto>
            {t(x.motivo ? "bandeja.aviso.textoMotivo" : "bandeja.aviso.texto", {
              clinica: x.clinica || t("bandeja.aviso.unaClinica"),
              nombre,
              motivo: x.motivo,
            })}
          </Texto>
          {x.telefono ? (
            <Boton alPulsar={() => void Linking.openURL(`tel:${x.telefono.replace(/[^\d+]/g, "")}`)}>
              {t("bandeja.aviso.llamar", { telefono: x.telefono })}
            </Boton>
          ) : null}
        </>
      )}
      {x.tipo === "nota" && (
        <Filas
          filas={[
            [t("bandeja.campo.clinica"), x.clinica],
            [t("bandeja.campo.diagnostico"), x.diagnostico],
            [t("bandeja.campo.tratamiento"), x.tratamiento],
            [t("bandeja.campo.observaciones"), x.observaciones],
          ]}
        />
      )}
      {x.tipo === "informe" && (
        <>
          <Filas
            filas={[
              [t("bandeja.campo.fecha"), x.fecha && x.fecha.split("-").reverse().join("/")],
              [t("bandeja.campo.veterinario"), x.veterinario],
              [t("bandeja.campo.diagnostico"), x.diagnostico],
              [t("bandeja.campo.tratamiento"), x.tratamiento],
              [t("bandeja.campo.observaciones"), x.observaciones],
            ]}
          />
          {x.firmado && <Texto tono="suave">{t("bandeja.informeFirmado")}</Texto>}
        </>
      )}
      {registro && (
        <>
          <Texto>{registro.detalle}</Texto>
          <Texto tono="suave">{t("bandeja.certificadoNota")}</Texto>
        </>
      )}
      {x.tipo === "firma-mala" && (
        <Texto>{t("bandeja.firmaMalaTexto")}</Texto>
      )}
      {x.tipo === "ilegible" && (
        <Texto>{t("bandeja.ilegibleTexto")}</Texto>
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
          <Texto estilo={{ color: c.alertInk, fontFamily: fuente.textoFuerte }}>{t("comun.borrar")}</Texto>
        </Pressable>
      )}
    </Tarjeta>
  );
}

export default function Bandeja() {
  const t = useT();
  const { carga, refrescar, refrescando, setCarga } = useCarga(cargar);
  // null: no se está seleccionando. Si no, los ids marcados para borrar de golpe.
  const [seleccion, setSeleccion] = useState<Set<string> | null>(null);
  const [borrando, setBorrando] = useState(false);
  const mensajes = carga.estado === "listo" && !carga.datos.falta ? carga.datos.mensajes : [];
  const todosMarcados = !!seleccion && mensajes.length > 0 && mensajes.every((m) => seleccion.has(m.id));

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
      n === 1 ? t("bandeja.borrarVarios.uno") : t("bandeja.borrarVarios.varios", { n }),
      t("bandeja.borrarVariosTexto"),
      [
        { text: t("comun.volver"), style: "cancel" },
        {
          text: t("comun.siBorrar"),
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
      Alert.alert(t("bandeja.errorBorrar"), t("comun.errorReintentar"));
    } finally {
      setBorrando(false);
    }
  }

  async function alBorrar(id: string) {
    try {
      await borrarMensaje(id);
      quitarDeLaLista(new Set([id]));
    } catch {
      Alert.alert(t("bandeja.errorBorrar"), t("comun.errorReintentar"));
    }
  }

  return (
    <Pantalla alRefrescar={refrescar} refrescando={refrescando}>
      <Titulo>{t("comun.tab.bandeja")}</Titulo>
      {carga.estado === "cargando" && <Cargando texto={t("bandeja.abriendo")} />}
      {carga.estado === "error" && (
        <Tarjeta tono="alerta">
          <Texto>{t("bandeja.errorCarga")}</Texto>
        </Tarjeta>
      )}
      {carga.estado === "listo" && carga.datos.falta && (
        <Tarjeta tono="aviso">
          <Texto tono="fuerte">{t("cuenta.claveNo")}</Texto>
          <Texto>{t("bandeja.faltaClave")}</Texto>
          <Boton alPulsar={() => router.push("/clave")}>{t("cuenta.escribirCodigo")}</Boton>
        </Tarjeta>
      )}
      {carga.estado === "listo" &&
        !carga.datos.falta &&
        (carga.datos.mensajes.length === 0 ? (
          <Texto tono="suave">{t("bandeja.vacia")}</Texto>
        ) : (
          <>
            {seleccion ? (
              <View style={{ gap: espacio.sm }}>
                <Boton
                  variante="secundario"
                  alPulsar={() => setSeleccion(todosMarcados ? new Set() : new Set(mensajes.map((m) => m.id)))}
                >
                  {todosMarcados ? t("bandeja.quitarTodos") : t("bandeja.seleccionarTodos")}
                </Boton>
                <Boton
                  variante="peligro"
                  desactivado={!seleccion.size}
                  ocupado={borrando}
                  alPulsar={confirmarBorradoEnBloque}
                >
                  {seleccion.size === 0
                    ? t("comun.borrar")
                    : seleccion.size === 1
                      ? t("bandeja.borrarSeleccion.uno")
                      : t("bandeja.borrarSeleccion.varios", { n: seleccion.size })}
                </Boton>
                <Boton variante="secundario" desactivado={borrando} alPulsar={() => setSeleccion(null)}>
                  {t("comun.cancelar")}
                </Boton>
              </View>
            ) : (
              <Boton variante="secundario" alPulsar={() => setSeleccion(new Set())}>
                {t("bandeja.seleccionarMensajes")}
              </Boton>
            )}
            {carga.datos.mensajes.map((m) => (
              <Tarjetita
                key={m.id}
                m={m}
                nombre={(!carga.datos.falta && carga.datos.nombres[m.petId]) || t("comun.tuMascota")}
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
