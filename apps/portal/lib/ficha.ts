"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { aBase64, aBase64Url, ad, claveDeFragmento, claveFicha, deBase64, type Cripto } from "@barkandmeow/crypto";
import {
  FICHA_VACIA,
  fichaDueno,
  fichaLista,
  resumenDeFicha,
  type FichaDueno,
  type PlacaFicha,
} from "@barkandmeow/schema";
import { toast } from "@barkandmeow/ui-web/components/sonner";
import { ErrorApi, guardarFicha, leerFicha, ponerPlaca } from "./api";
import { useClave, type Llave } from "./cripto";

/* La ficha de salud en el navegador del dueño.

   Se guarda en el servidor cifrada con la clave de esa mascota, que sale de
   la secreta del dueño (su código en papel): el servidor ve bytes y un número
   de versión. Cada vez que se guarda, si la mascota tiene placa, el resumen
   de emergencia se vuelve a cifrar con la clave de la placa y se sube: el QR
   del collar siempre enseña lo último. */

const enc = new TextEncoder();
const dec = new TextDecoder();

export async function abrirFicha(c: Cripto, secreta: Uint8Array, petId: string) {
  const { sobre, version } = await leerFicha(petId);
  if (!sobre) return { datos: FICHA_VACIA, version };
  const bytes = deBase64(sobre);
  if (!bytes) throw new Error("ficha mal formada");
  // Si no abre, es otra clave: mejor fallar que enseñar una ficha vacía y pisarla.
  const claro = c.abrir(claveFicha(c, secreta, petId), ad.ficha(petId), bytes);
  return { datos: fichaDueno.parse(JSON.parse(dec.decode(claro))), version };
}

/** Guarda y devuelve la versión nueva. Un 409 sube tal cual: quien llama vuelve a leer. */
async function guardarCifrada(c: Cripto, secreta: Uint8Array, petId: string, datos: FichaDueno, version: number) {
  const sobre = c.cerrar(claveFicha(c, secreta, petId), ad.ficha(petId), enc.encode(JSON.stringify(datos)));
  return (await guardarFicha(petId, aBase64(sobre), version)).version;
}

const esConflicto = (e: unknown) => e instanceof ErrorApi && e.estado === 409;

/** Una placa nueva: su id y su clave nacen aquí y no salen de la ficha cifrada. */
export const nuevaPlaca = (telefono: string): PlacaFicha => ({
  id: crypto.randomUUID(),
  clave: aBase64Url(crypto.getRandomValues(new Uint8Array(32))),
  telefono: telefono.trim(),
  creada: new Date().toISOString(),
});

/** El enlace del QR. La clave va tras el #, que el navegador no manda al servidor. */
export const enlacePlaca = (p: PlacaFicha) => `${window.location.origin}/e/${p.id}#${p.clave}`;

/** Sube el resumen de emergencia de la placa, cifrado con la clave del QR. */
export async function publicarPlaca(c: Cripto, petId: string, ficha: FichaDueno, nombre: string) {
  if (!ficha.placa || !fichaLista(ficha)) return;
  const k = claveDeFragmento(ficha.placa.clave);
  if (!k) throw new Error("clave de placa mal formada");
  const resumen = resumenDeFicha(ficha, { nombre, telefono: ficha.placa.telefono, hoy: new Date() });
  const sobre = c.cerrar(k, ad.emergencia(ficha.placa.id), enc.encode(JSON.stringify(resumen)));
  await ponerPlaca(petId, ficha.placa.id, aBase64(sobre));
}

type Lista = Llave & { datos: FichaDueno; version: number };
export type EstadoFicha =
  | { tipo: "mirando" }
  | { tipo: "falta" }
  | { tipo: "error" }
  | ({ tipo: "lista" } & Lista);

/**
 * La ficha de una mascota, abierta con la clave del dueño. `cambiar` aplica
 * un cambio y lo guarda; si el portal y la app guardaron a la vez, relee y lo
 * aplica encima.
 */
export function useFicha(petId: string, pubKey: string, nombre: string) {
  const clave = useClave(pubKey);
  const [ficha, setFicha] = useState<{ datos: FichaDueno; version: number } | "error" | null>(null);
  const actual = useRef<{ datos: FichaDueno; version: number } | null>(null);
  const llave = clave.estado.tipo === "lista" ? clave.estado : null;

  useEffect(() => {
    if (!llave) return;
    let vivo = true;
    abrirFicha(llave.c, llave.secreta, petId)
      .then((f) => {
        if (!vivo) return;
        actual.current = f;
        setFicha(f);
      })
      .catch(() => vivo && setFicha("error"));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [llave?.secreta, petId]);

  const cambiar = useCallback(
    async (mutar: (d: FichaDueno) => FichaDueno): Promise<FichaDueno | null> => {
      if (!llave || !actual.current) return null;
      let { datos, version } = actual.current;
      for (let intento = 0; intento < 2; intento++) {
        try {
          const nuevo = { ...mutar(datos), actualizado: new Date().toISOString() };
          const v = await guardarCifrada(llave.c, llave.secreta, petId, nuevo, version);
          actual.current = { datos: nuevo, version: v };
          setFicha(actual.current);
          // El collar enseña lo último: la placa se actualiza con cada cambio.
          await publicarPlaca(llave.c, petId, nuevo, nombre).catch(() =>
            toast("La ficha se ha guardado, pero la placa no se ha actualizado", {
              description: "Se actualizará la próxima vez que guardes.",
            }),
          );
          return nuevo;
        } catch (e) {
          if (!esConflicto(e)) break;
          ({ datos, version } = await abrirFicha(llave.c, llave.secreta, petId));
        }
      }
      toast("No se ha podido guardar", { description: "Vuelve a intentarlo en un momento." });
      return null;
    },
    [llave, petId, nombre],
  );

  const estado: EstadoFicha =
    clave.estado.tipo === "mirando"
      ? { tipo: "mirando" }
      : clave.estado.tipo === "falta"
        ? { tipo: "falta" }
        : ficha === "error"
          ? { tipo: "error" }
          : ficha
            ? { ...clave.estado, ...ficha }
            : { tipo: "mirando" };

  return { estado, cambiar, publica: clave.publica, alRecuperar: clave.alRecuperar };
}
