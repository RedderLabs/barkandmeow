import { useState } from "react";
import { router } from "expo-router";
import * as Crypto from "expo-crypto";
import { Alert, View } from "react-native";
import { Boton, Cargando, Datos, Pantalla, Tarjeta, Texto, Titulo } from "@/components/ui";
import { aprobarAlta, ErrorApi, leerPermisos, rechazarAlta, retirarAlta, yo } from "@/lib/api";
import { leerClave } from "@/lib/almacen";
import { aBase64, claveFicha, deBase64, iguales, publica, sellar } from "@/lib/cripto";
import { useCarga } from "@/lib/datos";
import { useT } from "@/lib/idioma";
import { espacio, fuente, useColores } from "@/lib/tema";

/* Permisos de nivel 3 en el teléfono: las clínicas que piden acceso permanente
   a la ficha y las que ya lo tienen.

   Aprobar es envolver la clave de la ficha de esa mascota para la clave
   pública de la clínica, aquí en el móvil: al servidor suben bytes que no
   puede abrir. Por eso hace falta la clave del llavero; rechazar y retirar no
   la necesitan. */

type Lista = Awaited<ReturnType<typeof leerPermisos>>;
type Vista = Lista & { clave: Uint8Array | null; nombres: Record<string, string> };

async function cargar(): Promise<Vista> {
  const [yoMismo, clave, lista] = await Promise.all([yo(), leerClave(), leerPermisos()]);
  return {
    ...lista,
    clave: clave && iguales(publica(clave), deBase64(yoMismo.pubKey)) ? clave : null,
    nombres: Object.fromEntries(yoMismo.mascotas.map((m) => [m.petId, m.perfil.nombre])),
  };
}

const dd = (n: number) => String(n).padStart(2, "0");
const hora = (iso: string) => {
  const d = new Date(iso);
  return `${dd(d.getHours())}:${dd(d.getMinutes())}`;
};
const dia = (iso: string) => {
  const d = new Date(iso);
  return `${dd(d.getDate())}/${dd(d.getMonth() + 1)}/${d.getFullYear()}`;
};

export default function Permisos() {
  const c = useColores();
  const t = useT();
  const { carga, refrescar, refrescando } = useCarga(cargar);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const datos = carga.estado === "listo" ? carga.datos : null;
  const nombre = (petId: string) => datos?.nombres[petId] || t("comun.tuMascota").toLowerCase();

  async function aprobar(p: Lista["peticiones"][number]) {
    const destino = deBase64(p.vetPubKey);
    if (!datos?.clave || !destino || destino.length !== 32) return;
    setOcupado(p.requestId);
    try {
      const envuelta = sellar(destino, Crypto.getRandomBytes(32), claveFicha(datos.clave, p.petId));
      await aprobarAlta(p.requestId, aBase64(envuelta));
      Alert.alert(
        t("permisos.concedido"),
        t("permisos.concedidoTexto", { clinica: p.clinica.nombre, nombre: nombre(p.petId) }),
      );
    } catch (e) {
      if (e instanceof ErrorApi && e.estado === 410)
        Alert.alert(t("permisos.caducada"), t("permisos.caducadaTexto"));
      else Alert.alert(t("permisos.errorAprobar"), t("comun.errorReintentar"));
    } finally {
      setOcupado(null);
      await refrescar();
    }
  }

  function confirmarAprobar(p: Lista["peticiones"][number]) {
    Alert.alert(
      t("permisos.aprobarPregunta", { clinica: p.clinica.nombre }),
      t("permisos.aprobarTexto", { numero: `${p.sas.slice(0, 3)} ${p.sas.slice(3)}` }),
      [
        { text: t("comun.volver"), style: "cancel" },
        { text: t("permisos.siCoincide"), onPress: () => void aprobar(p) },
      ],
    );
  }

  async function rechazar(p: Lista["peticiones"][number]) {
    setOcupado(p.requestId);
    try {
      await rechazarAlta(p.requestId);
    } catch {
      Alert.alert(t("permisos.errorRechazar"), t("permisos.errorRechazarTexto"));
    } finally {
      setOcupado(null);
      await refrescar();
    }
  }

  function confirmarRetirar(g: Lista["permisos"][number]) {
    Alert.alert(
      t("permisos.retirarPregunta", { clinica: g.clinica.nombre }),
      t("permisos.retirarTexto"),
      [
        { text: t("comun.volver"), style: "cancel" },
        {
          text: t("permisos.siRetirar"),
          style: "destructive",
          onPress: () => {
            setOcupado(g.grantId);
            void retirarAlta(g.grantId)
              .catch(() => Alert.alert(t("permisos.errorRetirar"), t("comun.errorReintentar")))
              .finally(() => {
                setOcupado(null);
                void refrescar();
              });
          },
        },
      ],
    );
  }

  return (
    <Pantalla alRefrescar={refrescar} refrescando={refrescando}>
      <Titulo>{t("comun.tab.permisos")}</Titulo>
      {carga.estado === "cargando" && <Cargando texto={t("permisos.cargando")} />}
      {carga.estado === "error" && (
        <Tarjeta tono="alerta">
          <Texto>{t("permisos.errorCarga")}</Texto>
        </Tarjeta>
      )}

      {datos && (
        <>
          <Titulo nivel={2}>{t("permisos.peticiones")}</Titulo>
          {datos.peticiones.length === 0 && (
            <Texto tono="suave">{t("permisos.sinPeticiones")}</Texto>
          )}
          {datos.peticiones.length > 0 && !datos.clave && (
            <Tarjeta tono="aviso">
              <Texto tono="fuerte">{t("cuenta.claveNo")}</Texto>
              <Texto>{t("permisos.faltaClave")}</Texto>
              <Boton alPulsar={() => router.push("/clave")}>{t("cuenta.escribirCodigo")}</Boton>
            </Tarjeta>
          )}
          {datos.peticiones.map((p) => (
            <Tarjeta key={p.requestId}>
              <Datos>
                {t("permisos.cabecera", {
                  pais: p.clinica.pais,
                  dominio: p.clinica.dominio ?? t("permisos.sinDominio"),
                  hora: hora(p.caduca),
                })}
              </Datos>
              <Texto tono="fuerte">{p.clinica.nombre}</Texto>
              <Texto>{t("permisos.pide", { nombre: nombre(p.petId) })}</Texto>
              <Texto
                estilo={{ fontFamily: fuente.datos, fontSize: 34, lineHeight: 42, letterSpacing: 4, color: c.ink }}
              >
                {`${p.sas.slice(0, 3)} ${p.sas.slice(3)}`}
              </Texto>
              <Texto tono="suave">{t("permisos.pideNumero")}</Texto>
              <View style={{ gap: espacio.sm }}>
                <Boton
                  alPulsar={() => confirmarAprobar(p)}
                  ocupado={ocupado === p.requestId}
                  desactivado={!datos.clave}
                >
                  {t("permisos.coincide")}
                </Boton>
                <Boton variante="secundario" alPulsar={() => void rechazar(p)} desactivado={ocupado === p.requestId}>
                  {t("permisos.rechazar")}
                </Boton>
              </View>
            </Tarjeta>
          ))}

          <Titulo nivel={2}>{t("permisos.conAcceso")}</Titulo>
          {datos.permisos.length === 0 && (
            <Texto tono="suave">{t("permisos.sinAcceso")}</Texto>
          )}
          {datos.permisos.map((g) => (
            <Tarjeta key={g.grantId}>
              <Texto tono="fuerte">{g.clinica.nombre}</Texto>
              <Texto tono="suave">{t("permisos.fichaDesde", { nombre: nombre(g.petId), fecha: dia(g.desde) })}</Texto>
              <Boton variante="peligro" alPulsar={() => confirmarRetirar(g)} ocupado={ocupado === g.grantId}>
                {t("permisos.retirar")}
              </Boton>
            </Tarjeta>
          ))}
        </>
      )}
    </Pantalla>
  );
}
