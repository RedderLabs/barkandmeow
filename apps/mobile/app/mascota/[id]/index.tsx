import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Alert, View } from "react-native";
import { Identidad } from "@/components/Mascota";
import { Boton, Cargando, CodigoActivacion, Fila, Pantalla, Paso, Seccion, Tarjeta, Texto } from "@/components/ui";
import { impugnar, nuevoCodigoActivacion, yo, type Mascota } from "@/lib/api";
import { leerToken } from "@/lib/almacen";
import { useCarga } from "@/lib/datos";
import { useT } from "@/lib/idioma";
import { deIso, ir } from "@/lib/salud";
import { espacio } from "@/lib/tema";

/* Una mascota, de un vistazo: qué está hecho y qué falta, en dos preguntas.
   «Si se pierde»: ¿van a poder llamarte? «Si le pasa algo»: ¿va a saber un
   veterinario que no la conoce lo que no puede darle? */

function Reclamacion({ m, alCambiar }: { m: Mascota; alCambiar: () => void }) {
  const t = useT();
  const r = m.reclamacion;
  const [enviando, setEnviando] = useState(false);
  if (!r) return null;
  const nombre = m.perfil.nombre || t("mascota.tuMascota");
  if (r.rol === "reclamante")
    return (
      <Tarjeta tono="aviso">
        <Texto>
          {t("mascota.reclamante")}{" "}
          {r.estado === "abierta"
            ? t("mascota.reclamanteAbierta", { fecha: deIso(r.plazo) })
            : t("mascota.reclamanteImpugnada")}
        </Texto>
      </Tarjeta>
    );
  if (r.estado === "impugnada")
    return (
      <Tarjeta tono="aviso">
        <Texto>{t("mascota.impugnada")}</Texto>
      </Tarjeta>
    );

  function alImpugnar() {
    Alert.alert(t("mascota.impugnarPregunta", { nombre }), t("mascota.impugnarTexto"), [
      { text: t("comun.volver"), style: "cancel" },
      {
        text: t("mascota.impugnarSi"),
        onPress: async () => {
          setEnviando(true);
          try {
            await impugnar(r!.id);
            alCambiar();
          } catch {
            Alert.alert(t("mascota.impugnarError"), t("mascota.impugnarErrorTexto"));
          } finally {
            setEnviando(false);
          }
        },
      },
    ]);
  }

  return (
    <Tarjeta tono="alerta">
      <Texto tono="fuerte">{t("mascota.reclamadoTitulo")}</Texto>
      <Texto>{t("mascota.reclamadoTexto", { nombre, fecha: deIso(r.plazo) })}</Texto>
      <Boton variante="peligro" alPulsar={alImpugnar} ocupado={enviando}>
        {t("mascota.impugnarBoton")}
      </Boton>
    </Tarjeta>
  );
}

/** Genera un código de activación nuevo y lo muestra una sola vez. */
function Activar({ m }: { m: Mascota }) {
  const t = useT();
  const [codigo, setCodigo] = useState<{ codigoActivacion: string; caduca: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function generar() {
    setOcupado(true);
    try {
      setCodigo(await nuevoCodigoActivacion(m.petId));
    } catch {
      Alert.alert(t("mascota.codigoError"), t("comun.errorReintentar"));
    } finally {
      setOcupado(false);
    }
  }

  if (codigo) return <CodigoActivacion codigo={codigo.codigoActivacion} caduca={codigo.caduca} nombre={m.perfil.nombre.trim()} />;
  return (
    <Boton alPulsar={() => void generar()} ocupado={ocupado}>
      {t("mascota.generarCodigo")}
    </Boton>
  );
}

export default function Resumen() {
  const t = useT();
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
      {carga.estado === "cargando" && <Cargando texto={t("comun.cargando")} />}
      {(carga.estado === "error" || (carga.estado === "listo" && !m)) && (
        <Tarjeta tono="alerta">
          <Texto>{t("comun.errorCarga")}</Texto>
        </Tarjeta>
      )}
      {m && (
        <>
          <Identidad m={m} token={token} />
          <Reclamacion m={m} alCambiar={() => void refrescar()} />

          {m.mensajes > 0 && (
            <Boton variante="secundario" alPulsar={() => router.navigate("/bandeja")}>
              {m.mensajes === 1 ? t("mascota.mensajes.uno") : t("mascota.mensajes.varios", { n: m.mensajes })}
            </Boton>
          )}

          <Seccion titulo={t("mascota.siLePasa")}>
            <Paso
              hecho={m.ficha}
              titulo={m.ficha ? t("mascota.fichaHecha") : t("comun.pantalla.salud")}
              detalle={m.ficha ? t("mascota.fichaHechaTexto") : t("mascota.fichaFaltaTexto")}
            />
            <Boton variante={m.ficha ? "secundario" : "primario"} alPulsar={() => ir(`${base}/salud`)}>
              {m.ficha ? t("mascota.verFicha") : t("mascota.escribirFicha")}
            </Boton>
            <Paso
              hecho={m.placa}
              opcional
              titulo={m.placa ? t("mascota.placaActiva") : t("comun.pantalla.placa")}
              detalle={m.placa ? t("mascota.placaActivaTexto") : t("mascota.placaFaltaTexto")}
            />
            <View style={{ gap: espacio.sm }}>
              <Boton variante="secundario" alPulsar={() => ir(`${base}/placa`)}>
                {m.placa ? t("mascota.verPlaca") : t("mascota.prepararPlaca")}
              </Boton>
              <Boton variante="secundario" alPulsar={() => ir(`${base}/compartir`)}>
                {t("mascota.ensenarHistorial")}
              </Boton>
            </View>
          </Seccion>

          <Seccion titulo={t("mascota.siSePierde")}>
            <Paso
              hecho={m.estado === "activa"}
              titulo={t("mascota.chipActivado")}
              detalle={
                m.estado === "pendiente"
                  ? t("mascota.chipPendiente")
                  : m.activada
                    ? t("mascota.chipDesde", { fecha: deIso(m.activada) })
                    : undefined
              }
            />
            {m.estado === "pendiente" && !m.reclamacion && <Activar m={m} />}
            <Paso
              hecho={m.perfil.publicado}
              titulo={t("mascota.perfilVisible")}
              detalle={m.perfil.publicado ? undefined : t("mascota.perfilOculto")}
            />
            <Paso
              hecho={m.perfil.telefonos.length > 0}
              titulo={t("mascota.telefono")}
              detalle={m.perfil.telefonos.map((x) => x.etiqueta || x.numero).join(" · ") || undefined}
            />
            <Boton variante="secundario" alPulsar={() => ir(`${base}/perfil`)}>
              {t("mascota.editarPerfil")}
            </Boton>
            <Texto tono="suave">{t("mascota.fotoWeb")}</Texto>
          </Seccion>

          <Seccion titulo={t("mascota.paraViajar")}>
            <Texto>{t("mascota.viajarTexto")}</Texto>
            <Boton variante="secundario" alPulsar={() => ir(`${base}/pasaporte`)}>
              {t("comun.pantalla.pasaporte")}
            </Boton>
          </Seccion>

          <Seccion titulo={t("mascota.clinica")}>
            <Fila
              titulo={t("comun.tab.permisos")}
              detalle={t("mascota.permisosTexto")}
              accion={t("mascota.abrir")}
              alPulsar={() => router.navigate("/permisos")}
            />
          </Seccion>
        </>
      )}
    </Pantalla>
  );
}
