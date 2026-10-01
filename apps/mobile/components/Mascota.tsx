import type { ReactNode } from "react";
import { Image, Text, View } from "react-native";
import { Boton, Cargando, Datos, Insignia, Pantalla, Tarjeta, Texto, Titulo } from "@/components/ui";
import { API, type Mascota } from "@/lib/api";
import { ir, type EstadoFicha } from "@/lib/salud";
import { espacio, fuente, useColores } from "@/lib/tema";

/* Lo que comparten las pantallas de una mascota: quién es, cuánto le falta y
   qué hacer mientras la ficha carga o si falta la clave del papel. */

/** Lo imprescindible: chip activo, perfil, teléfono y ficha de salud. La placa y la foto ayudan, pero no cuentan. */
export const faltanDe = (m: Mascota) =>
  [m.estado === "activa", m.perfil.publicado, m.perfil.telefonos.length > 0, m.ficha].filter((x) => !x).length;

export const enReclamacion = (m: Mascota) => m.estado === "congelada" || m.reclamacion?.rol === "reclamante";

export function InsigniaMascota({ m }: { m: Mascota }) {
  const faltan = faltanDe(m);
  if (enReclamacion(m)) return <Insignia tono="aviso">En reclamación</Insignia>;
  if (faltan === 0) return <Insignia tono="listo">Todo en orden</Insignia>;
  return <Insignia tono="aviso">{faltan === 1 ? "Falta 1 paso" : `Faltan ${faltan} pasos`}</Insignia>;
}

export function Identidad({ m, token }: { m: Mascota; token: string | null }) {
  const c = useColores();
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
        <Titulo nivel={2}>{nombre || "Sin nombre"}</Titulo>
        <Datos>CHIP ···· {m.chipPista ?? "····"}</Datos>
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
  return (
    <Pantalla alRefrescar={alRefrescar} sinBorde>
      <View style={{ gap: espacio.sm }}>
        <Titulo>{titulo}</Titulo>
        <Texto tono="suave">{intro}</Texto>
      </View>
      {estado.tipo === "cargando" && <Cargando texto="Abriendo la ficha…" />}
      {estado.tipo === "error" && (
        <Tarjeta tono="alerta">
          <Texto tono="fuerte">No se ha podido abrir la ficha.</Texto>
          <Texto>Revisa la conexión y tira hacia abajo para reintentar.</Texto>
        </Tarjeta>
      )}
      {estado.tipo === "sin-clave" && (
        <Tarjeta tono="aviso">
          <Texto tono="fuerte">Este móvil no tiene tu clave</Texto>
          <Texto>
            La ficha se guarda cerrada con tu clave, y solo se abre donde está guardada. Escribe el código de
            recuperación que apuntaste en papel al darte de alta: la clave se rehace aquí y no sale del móvil.
          </Texto>
          <Boton alPulsar={() => ir("/clave")}>Escribir el código</Boton>
        </Tarjeta>
      )}
      {estado.tipo === "lista" && children(estado)}
    </Pantalla>
  );
}

