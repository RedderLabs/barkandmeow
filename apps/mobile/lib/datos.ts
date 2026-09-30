/* Carga con recarga manual (tirar hacia abajo) y al volver a la pantalla. */

import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";

export type Carga<T> =
  | { estado: "cargando" }
  | { estado: "error" }
  | { estado: "listo"; datos: T };

export function useCarga<T>(cargar: () => Promise<T>) {
  const [carga, setCarga] = useState<Carga<T>>({ estado: "cargando" });
  const [refrescando, setRefrescando] = useState(false);

  const traer = useCallback(async () => {
    try {
      setCarga({ estado: "listo", datos: await cargar() });
    } catch {
      setCarga((c) => (c.estado === "listo" ? c : { estado: "error" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFocusEffect(
    useCallback(() => {
      void traer();
    }, [traer]),
  );

  const refrescar = useCallback(async () => {
    setRefrescando(true);
    await traer();
    setRefrescando(false);
  }, [traer]);

  return { carga, refrescar, refrescando, setCarga };
}
