/* La ficha de salud de una mascota, cargada y guardada desde el teléfono.

   La lógica y el cifrado están en lib/ficha.ts; aquí va lo que necesita el
   teléfono: la clave del llavero, el azar de expo-crypto y las llamadas al
   servidor. Cada cambio se guarda al momento y, si hay placa, vuelve a subir
   su resumen: el collar enseña siempre lo último. */

import { useCallback, useRef, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import * as Crypto from "expo-crypto";
import { Alert } from "react-native";
import type { FichaDueno } from "@barkandmeow/schema";
import { ErrorApi, guardarFicha, leerFicha, ponerPlaca, yo, type Mascota } from "./api";
import { leerClave } from "./almacen";
import { deBase64, iguales, publica } from "./cripto";
import { abrirFicha, cerrarFicha, sobrePlaca } from "./ficha";

/** A una pantalla que la app conoce pero cuyos tipos de ruta aún no se han regenerado. */
export const ir = (ruta: string) => router.push(ruta as never);

export type EstadoFicha =
  | { tipo: "cargando" }
  | { tipo: "error" }
  /** Falta la clave del papel en este móvil: sin ella la ficha no se abre. */
  | { tipo: "sin-clave"; m: Mascota }
  | { tipo: "lista"; m: Mascota; secreta: Uint8Array; datos: FichaDueno; version: number };

export type Cambiar = (mutar: (d: FichaDueno) => FichaDueno) => Promise<FichaDueno | null>;

/** Sube el resumen de urgencia de la placa, si la ficha tiene placa. */
export async function publicarPlaca(petId: string, ficha: FichaDueno, nombre: string) {
  const sobre = sobrePlaca(ficha, nombre, Crypto.getRandomBytes(24), new Date());
  if (sobre && ficha.placa) await ponerPlaca(petId, ficha.placa.id, sobre);
}

export function useFicha(petId: string) {
  const [estado, setEstado] = useState<EstadoFicha>({ tipo: "cargando" });
  const actual = useRef<{ datos: FichaDueno; version: number } | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [yoMismo, clave] = await Promise.all([yo(), leerClave()]);
      const m = yoMismo.mascotas.find((x) => x.petId === petId);
      if (!m) return setEstado({ tipo: "error" });
      // Una clave que no es la de esta cuenta no abre nada: mejor pedir el papel.
      if (!clave || !iguales(publica(clave), deBase64(yoMismo.pubKey))) return setEstado({ tipo: "sin-clave", m });
      const { sobre, version } = await leerFicha(petId);
      const datos = abrirFicha(clave, petId, sobre);
      actual.current = { datos, version };
      setEstado({ tipo: "lista", m, secreta: clave, datos, version });
    } catch {
      setEstado((e) => (e.tipo === "lista" ? e : { tipo: "error" }));
    }
  }, [petId]);

  // Al volver a la pantalla (por ejemplo, tras escribir el código en papel) se vuelve a cargar.
  useFocusEffect(
    useCallback(() => {
      void cargar();
    }, [cargar]),
  );

  const cambiar: Cambiar = useCallback(
    async (mutar) => {
      if (estado.tipo !== "lista" || !actual.current) return null;
      const { m, secreta } = estado;
      const nombre = m.perfil.nombre.trim();
      let { datos, version } = actual.current;
      for (let intento = 0; intento < 2; intento++) {
        try {
          const nuevo = { ...mutar(datos), actualizado: new Date().toISOString() };
          const r = await guardarFicha(petId, cerrarFicha(secreta, petId, nuevo, Crypto.getRandomBytes(24)), version);
          actual.current = { datos: nuevo, version: r.version };
          setEstado({ tipo: "lista", m, secreta, datos: nuevo, version: r.version });
          await publicarPlaca(petId, nuevo, nombre).catch(() =>
            Alert.alert("La placa no se ha actualizado", "La ficha se ha guardado. La placa se actualizará la próxima vez que guardes."),
          );
          return nuevo;
        } catch (e) {
          // El portal guardó entre medias: se relee y el cambio se aplica encima.
          if (!(e instanceof ErrorApi && e.estado === 409)) break;
          try {
            const leida = await leerFicha(petId);
            datos = abrirFicha(secreta, petId, leida.sobre);
            version = leida.version;
          } catch {
            break;
          }
        }
      }
      Alert.alert("No se ha podido guardar", "Revisa la conexión y vuelve a intentarlo.");
      return null;
    },
    [estado, petId],
  );

  return { estado, cambiar, recargar: cargar };
}

/* ── Fechas: en la pantalla, como en una cartilla; guardadas, en ISO ── */

/** 2027-03-14 → 14/03/2027. */
export const deIso = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

/** «14/3/2027» o «14-03-2027» → 2027-03-14. null si no es una fecha. "" si está vacío. */
export function aIso(texto: string): string | null {
  const t = texto.trim();
  if (!t) return "";
  const m = /^(\d{1,2})[/\-. ](\d{1,2})[/\-. ](\d{4})$/.exec(t);
  if (!m) return null;
  const [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const f = new Date(Date.UTC(a, mes - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== d) return null;
  return `${a}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export const hoyIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
