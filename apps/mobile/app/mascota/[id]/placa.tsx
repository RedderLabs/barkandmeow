import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import { Alert, Share, View } from "react-native";
import { fichaLista, terminoCronica, terminoReaccion, type FichaDueno } from "@barkandmeow/schema";
import { ConFicha } from "@/components/Mascota";
import { Qr } from "@/components/Qr";
import { Boton, Datos, Fila, Opciones, Seccion, Tarjeta, Texto } from "@/components/ui";
import { useIdioma } from "@/lib/ajustes";
import { ErrorApi, quitarPlaca, WEB, type Mascota } from "@/lib/api";
import { enlacePlaca, nuevaPlaca } from "@/lib/ficha";
import { useT } from "@/lib/idioma";
import { deIso, hoyIso, ir, useFicha, type Cambiar } from "@/lib/salud";
import { espacio, fuente, useColores } from "@/lib/tema";

/* La placa del collar (nivel 1). Un QR que cualquiera escanea con el móvil,
   sin aplicación y sin cuenta: abre el resumen de urgencia en el idioma de
   quien lo lee. La clave va dentro del propio QR, así que el servidor entrega
   un bloque que no puede abrir. Quien tenga la placa en la mano ve el resumen:
   por eso solo lleva lo de una urgencia, y el teléfono solo si el dueño quiere. */

/** Lo que enseñará la placa, dicho como en una ficha de papel. */
function Resumen({ f, telefono }: { f: FichaDueno; telefono: string }) {
  const t = useT();
  const idioma = useIdioma();
  const c = useColores();
  return (
    <View>
      {f.alergias.length > 0 && (
        <Tarjeta tono="alerta">
          <Texto estilo={{ fontFamily: fuente.textoFuerte, fontSize: 13, letterSpacing: 0.8, color: c.alertInk }}>
            {t("salud.alergias").toUpperCase()}
          </Texto>
          {f.alergias.map((a) => (
            <View key={a.id} style={{ gap: 2 }}>
              <Texto estilo={{ fontFamily: fuente.textoFuerte, fontSize: 17, color: c.alertInk }}>{a.sustancia}</Texto>
              <Texto estilo={{ color: c.alertSoftInk }}>{terminoReaccion(a)[idioma]}</Texto>
            </View>
          ))}
        </Tarjeta>
      )}
      {f.alergias.length === 0 && <Fila titulo={t("salud.alergias")} detalle={t("placa.ningunaRegistrada")} />}
      <Fila
        titulo={t("placa.medicacion")}
        detalle={
          f.medicacion.length
            ? f.medicacion.map((m) => [m.principio, m.dosis].filter(Boolean).join(" ")).join(" · ")
            : t("placa.ninguna")
        }
      />
      <Fila
        titulo={t("salud.cronicas")}
        detalle={
          f.cronicas.length
            ? f.cronicas.map((x) => terminoCronica(x)[idioma]).join(" · ")
            : t("placa.ningunaRegistrada")
        }
      />
      <Fila
        titulo={t("placa.rabia")}
        detalle={
          f.rabiaHasta
            ? t(f.rabiaHasta < hoyIso() ? "placa.caduco" : "placa.validaHasta", { fecha: deIso(f.rabiaHasta) })
            : t("placa.noConsta")
        }
      />
      <Fila titulo={t("placa.telefono")} detalle={telefono || t("placa.noSeEnsena")} />
    </View>
  );
}

function Contenido({ m, datos, cambiar, alCambiar }: { m: Mascota; datos: FichaDueno; cambiar: Cambiar; alCambiar: () => void }) {
  const t = useT();
  const nombre = m.perfil.nombre.trim();
  const llamar = nombre || t("mascota.tuMascota");
  const telefonos = m.perfil.telefonos;
  const [telefono, setTelefono] = useState(telefonos[0]?.numero ?? "");
  const [ocupado, setOcupado] = useState(false);
  const base = `/mascota/${m.petId}`;

  const opcionesTelefono = [
    ...telefonos.map((x) => [x.numero, x.etiqueta ? `${x.numero} · ${x.etiqueta}` : x.numero] as const),
    ["", t("placa.ninguno")] as const,
  ];

  if (!fichaLista(datos))
    return (
      <Seccion titulo={t("placa.antesFicha")}>
        <Texto>{t("placa.antesFichaTexto", { nombre: llamar })}</Texto>
        <Boton alPulsar={() => ir(`${base}/salud`)}>{t("mascota.escribirFicha")}</Boton>
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
    Alert.alert(t("placa.sustituirPregunta"), t("placa.sustituirTexto"), [
      { text: t("comun.volver"), style: "cancel" },
      { text: t("placa.sustituirSi"), onPress: () => void crear() },
    ]);
  }

  function retirar() {
    Alert.alert(t("placa.retirarPregunta"), t("placa.retirarTexto", { nombre: llamar }), [
      { text: t("comun.volver"), style: "cancel" },
      {
        text: t("placa.retirarSi"),
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
            Alert.alert(t("placa.retirarError"), t("comun.errorReintentar"));
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
        <Seccion titulo={t("placa.crear")}>
          <Texto>{t("placa.crearTexto", { nombre: llamar })}</Texto>
          <Opciones
            etiqueta={t("placa.telefonoQueEnsena")}
            opciones={opcionesTelefono}
            valor={telefono}
            alElegir={setTelefono}
          />
          {telefonos.length === 0 && <Texto tono="suave">{t("placa.sinTelefonos")}</Texto>}
          <Boton alPulsar={() => void crear()} ocupado={ocupado}>
            {t("placa.crear")}
          </Boton>
        </Seccion>
        <Seccion titulo={t("placa.loQueEnsenara")}>
          <Resumen f={datos} telefono={telefono} />
        </Seccion>
      </>
    );

  const url = enlacePlaca(WEB, placa);
  return (
    <>
      <Seccion titulo={t("placa.activa")}>
        <Qr valor={url} etiqueta={t("placa.qr", { nombre: llamar })} />
        <Texto>{t("placa.imprimir")}</Texto>
        <View style={{ gap: espacio.sm }}>
          <Boton alPulsar={() => void Share.share({ message: url })}>{t("placa.enviarEnlace")}</Boton>
        </View>
        <Datos>{t("placa.creada", { fecha: deIso(placa.creada) })}</Datos>
        <Texto tono="suave">{t("placa.noCambiar")}</Texto>
      </Seccion>

      <Seccion titulo={t("placa.loQueVe")}>
        <Resumen f={datos} telefono={placa.telefono} />
        <Opciones
          etiqueta={t("placa.telefonoQueEnsena")}
          opciones={
            placa.telefono && !telefonos.some((t) => t.numero === placa.telefono)
              ? [[placa.telefono, placa.telefono] as const, ...opcionesTelefono]
              : opcionesTelefono
          }
          valor={placa.telefono}
          alElegir={(v) => void cambiar((d) => (d.placa ? { ...d, placa: { ...d.placa, telefono: v } } : d))}
        />
        <Texto tono="suave">{t("placa.ademas")}</Texto>
      </Seccion>

      <Seccion titulo={t("placa.siPierdes")}>
        <Texto>{t("placa.siPierdesTexto")}</Texto>
        <View style={{ gap: espacio.sm }}>
          <Boton variante="secundario" alPulsar={sustituir} ocupado={ocupado}>
            {t("placa.sustituir")}
          </Boton>
          <Boton variante="peligro" alPulsar={retirar} desactivado={ocupado}>
            {t("placa.retirar")}
          </Boton>
        </View>
      </Seccion>
    </>
  );
}

export default function Placa() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { estado, cambiar, recargar } = useFicha(id);
  return (
    <ConFicha
      estado={estado}
      titulo={t("comun.pantalla.placa")}
      intro={t("placa.intro")}
      alRefrescar={() => void recargar()}
    >
      {({ m, datos }) => <Contenido m={m} datos={datos} cambiar={cambiar} alCambiar={() => void recargar()} />}
    </ConFicha>
  );
}
