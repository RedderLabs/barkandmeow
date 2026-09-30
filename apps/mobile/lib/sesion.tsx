/* Estado de la sesión del dueño en la app.

   Entrar son dos pasos, como en el portal: chip y contraseña, y después el
   código que llega por correo o SMS. El token pendiente vive solo en memoria;
   el de la sesión abierta, en el llavero. */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  alCaducarSesion,
  confirmarCodigo,
  entrar as entrarApi,
  reenviarCodigo,
  salir as salirApi,
  type Canal,
  type Identificador,
  type Pendiente,
} from "./api";
import { borrarClave, borrarToken, guardarToken, leerToken } from "./almacen";
import { activarPush, desactivarPush } from "./push";

type Paso = { token: string; destino: string; canal: Canal; otroCanal: Canal | null };

type Sesion = {
  estado: "cargando" | "fuera" | "dentro";
  paso: Paso | null;
  entrar(id: Identificador, password: string): Promise<void>;
  confirmar(codigo: string): Promise<void>;
  reenviar(canal?: Canal): Promise<void>;
  salir(): Promise<void>;
};

const Contexto = createContext<Sesion | null>(null);

function aPaso(p: Pendiente): Paso {
  if (!p.token) throw new Error("el servidor no devolvió el token de la app");
  return { token: p.token, destino: p.correo, canal: p.canal ?? "correo", otroCanal: p.otroCanal ?? null };
}

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Sesion["estado"]>("cargando");
  const [paso, setPaso] = useState<Paso | null>(null);

  useEffect(() => {
    alCaducarSesion(() => setEstado("fuera"));
    void leerToken()
      .then((t) => setEstado(t ? "dentro" : "fuera"))
      .catch(() => setEstado("fuera"));
  }, []);

  const entrar = useCallback(async (id: Identificador, password: string) => {
    setPaso(aPaso(await entrarApi(id, password)));
  }, []);

  const confirmar = useCallback(
    async (codigo: string) => {
      if (!paso) throw new Error("sin paso pendiente");
      const r = await confirmarCodigo(paso.token, codigo);
      if (!r.token) throw new Error("el servidor no devolvió el token de la app");
      await guardarToken(r.token);
      setPaso(null);
      setEstado("dentro");
      void activarPush();
    },
    [paso],
  );

  const reenviar = useCallback(
    async (canal?: Canal) => {
      if (!paso) throw new Error("sin paso pendiente");
      // El reenvío abre otra sesión pendiente: el token anterior deja de valer.
      setPaso(aPaso(await reenviarCodigo(paso.token, canal)));
    },
    [paso],
  );

  const salir = useCallback(async () => {
    await desactivarPush();
    await salirApi().catch(() => {});
    await borrarToken();
    // La clave también: en un móvil compartido, salir tiene que cerrar la bandeja.
    await borrarClave();
    setEstado("fuera");
  }, []);

  const valor = useMemo(
    () => ({ estado, paso, entrar, confirmar, reenviar, salir }),
    [estado, paso, entrar, confirmar, reenviar, salir],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion(): Sesion {
  const s = useContext(Contexto);
  if (!s) throw new Error("useSesion fuera de ProveedorSesion");
  return s;
}
