import type { ReactNode } from "react";
import { Image, View } from "react-native";
import { Text } from "@/components/texto";
import { Boton, Cargando, Datos, Insignia, Pantalla, Tarjeta, Texto, Titulo } from "@/components/ui";
import { API, type Mascota } from "@/lib/api";
import { useT } from "@/lib/idioma";
import { ir, type EstadoFicha } from "@/lib/salud";
import { espacio, fuente, useColores } from "@/lib/tema";

/* Lo que comparten las pantallas de una mascota: quién es, cuánto le falta y
   qué hacer mientras la ficha carga o si falta la clave del papel. */

/** Lo imprescindible: chip activo, perfil, teléfono y ficha de salud. La placa y la foto ayudan, pero no cuentan. */
export const faltanDe = (m: Mascota) =>
  [m.estado === "activa", m.perfil.publicado, m.perfil.telefonos.length > 0, m.ficha].filter((x) => !x).length;

export const enReclamacion = (m: Mascota) => m.estado === "congelada" || m.reclamacion?.rol === "reclamante";

export function InsigniaMascota({ m }: { m: Mascota }) {
  const t = useT();
  const faltan = faltanDe(m);
  if (enReclamacion(m)) return <Insignia tono="aviso">{t("piezas.enReclamacion")}</Insignia>;
  if (faltan === 0) return <Insignia tono="listo">{t("piezas.todoEnOrden")}</Insignia>;
  return (
    <Insignia tono="aviso">{faltan === 1 ? t("piezas.falta.uno") : t("piezas.falta.varios", { n: faltan })}</Insignia>
  );
}

export function Identidad({ m, token }: { m: Mascota; token: string | null }) {
  const c = useColores();
  const t = useT();
  const nombre = m.perfil.nombre.trim();
  return (
    <View style={{ flexDirection: "row", gap: espacio.lg, alignItems: "center" }}>
      {m.perfil.foto && token ? (
        <Image
          accessibilityIgnoresInvertColors
          source={{ uri: `${API}${m.perfil.foto}`, headers: { authorization: `Bearer ${token}`, "x-bm-cliente": "app" } }}
          style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c.divider }}
        />
      ) : (
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: c.accentSoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontFamily: fuente.display, fontSize: 26, color: c.accentSoftInk }}>
            {nombre ? nombre[0].toUpperCase() : "?"}
          </Text>
        </View>
      )}
      <View style={{ flex: 1, gap: espacio.xs }}>
        <Titulo nivel={2}>{nombre || t("piezas.sinNombre")}</Titulo>
        <Datos>{t("piezas.chip", { pista: m.chipPista ?? "····" })}</Datos>
        <InsigniaMascota m={m} />
      </View>
    </View>
  );
}

/**
 * El marco de las pantallas que abren la ficha: mientras carga, si falla y si
 * falta la clave del papel. Con la ficha abierta, pinta `children`.
 */
export function ConFicha({
  estado,
  titulo,
  intro,
  alRefrescar,
  children,
}: {
  estado: EstadoFicha;
  titulo: string;
  intro: string;
  alRefrescar: () => void;
  children: (lista: Extract<EstadoFicha, { tipo: "lista" }>) => ReactNode;
}) {
  const t = useT();
  return (
    <Pantalla alRefrescar={alRefrescar} sinBorde>
      <View style={{ gap: espacio.sm }}>
        <Titulo>{titulo}</Titulo>
        <Texto tono="suave">{intro}</Texto>
      </View>
      {estado.tipo === "cargando" && <Cargando texto={t("piezas.abriendoFicha")} />}
      {estado.tipo === "error" && (
        <Tarjeta tono="alerta">
          <Texto tono="fuerte">{t("piezas.errorFicha")}</Texto>
          <Texto>{t("piezas.errorFichaTexto")}</Texto>
        </Tarjeta>
      )}
      {estado.tipo === "sin-clave" && (
        <Tarjeta tono="aviso">
          <Texto tono="fuerte">{t("piezas.sinClave")}</Texto>
          <Texto>{t("piezas.sinClaveTexto")}</Texto>
          <Boton alPulsar={() => ir("/clave")}>{t("piezas.escribirCodigo")}</Boton>
        </Tarjeta>
      )}
      {estado.tipo === "lista" && children(estado)}
    </Pantalla>
  );
}

