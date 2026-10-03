/* Estado de la sesión del dueño en la app.

   Entrar son dos pasos, como en el portal: chip y contraseña, y después el
   código que llega por correo o SMS. El alta acaba en el mismo paso del
   código. El token pendiente vive solo en memoria; el de la sesión abierta, en
   el llavero. */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  alCaducarSesion,
  confirmarCodigo,
  darDeAlta as darDeAltaApi,
  entrar as entrarApi,
  reenviarCodigo,
  salir as salirApi,
  type Canal,
  type Identificador,
  type Pendiente,
} from "./api";
import { borrarClave, borrarPush, borrarToken, guardarClave, guardarToken, leerToken } from "./almacen";
import { aBase64, claveDeRecuperacion, publica } from "./cripto";
import { activarPush, desactivarPush } from "./push";

type Paso = { token: string; destino: string; canal: Canal; otroCanal: Canal | null };

/** El código de activación de la mascota del alta: se enseña una vez, ya dentro. */
export type Bienvenida = { codigoActivacion: string; caduca: string; nombre: string };

export type DatosAlta = { email: string; password: string; identificador: Identificador; nombre: string };

type Sesion = {
  estado: "cargando" | "fuera" | "dentro";
  paso: Paso | null;
  bienvenida: Bienvenida | null;
  entrar(id: Identificador, password: string): Promise<void>;
  /** Crea la cuenta con la clave del papel y deja el paso del código como `entrar`.
      false si la cuenta se creó pero el código no salió: hay que entrar con chip y contraseña. */
  darDeAlta(datos: DatosAlta, secreta: Uint8Array): Promise<boolean>;
  /** Ya enseñado el código de activación del alta. */
  olvidarBienvenida(): void;
  confirmar(codigo: string): Promise<void>;
  reenviar(canal?: Canal): Promise<void>;
  salir(): Promise<void>;
  /** Tras borrar la cuenta: el servidor ya no tiene nada; aquí se olvida lo del móvil. */
  olvidar(): Promise<void>;
};

const Contexto = createContext<Sesion | null>(null);

function aPaso(p: Pendiente): Paso {
  if (!p.token) throw new Error("el servidor no devolvió el token de la app");
  return { token: p.token, destino: p.correo, canal: p.canal ?? "correo", otroCanal: p.otroCanal ?? null };
}

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Sesion["estado"]>("cargando");
  const [paso, setPaso] = useState<Paso | null>(null);
  const [bienvenida, setBienvenida] = useState<Bienvenida | null>(null);

  useEffect(() => {
    alCaducarSesion(() => setEstado("fuera"));
    void leerToken()
      .then((t) => setEstado(t ? "dentro" : "fuera"))
      .catch(() => setEstado("fuera"));
  }, []);

  const entrar = useCallback(async (id: Identificador, password: string) => {
    setPaso(aPaso(await entrarApi(id, password)));
  }, []);

  const darDeAlta = useCallback(async (datos: DatosAlta, secreta: Uint8Array) => {
    // Al servidor solo van las públicas: la X25519 del dueño y la Ed25519 de recuperación.
    const r = await darDeAltaApi({
      email: datos.email,
      password: datos.password,
      pubKey: aBase64(publica(secreta)),
      recuperacionPub: aBase64(claveDeRecuperacion(secreta).publica),
      mascota: { identificador: datos.identificador, nombre: datos.nombre },
    });
    // La cuenta ya existe: la clave se queda en el llavero, y la bandeja se abre sin volver al papel.
    await guardarClave(secreta).catch(() => {});
    setBienvenida({ codigoActivacion: r.mascota.codigoActivacion, caduca: r.mascota.caduca, nombre: datos.nombre });
    if (!r.token) return false;
    // Una cuenta recién creada solo tiene el correo.
    setPaso({ token: r.token, destino: r.correo, canal: "correo", otroCanal: null });
    return true;
  }, []);

  const olvidarBienvenida = useCallback(() => setBienvenida(null), []);

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
    setBienvenida(null);
    setEstado("fuera");
  }, []);

  const olvidar = useCallback(async () => {
    await Promise.all([borrarPush(), borrarToken(), borrarClave()]);
    setBienvenida(null);
    setEstado("fuera");
  }, []);

  const valor = useMemo(
    () => ({ estado, paso, bienvenida, entrar, darDeAlta, olvidarBienvenida, confirmar, reenviar, salir, olvidar }),
    [estado, paso, bienvenida, entrar, darDeAlta, olvidarBienvenida, confirmar, reenviar, salir, olvidar],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion(): Sesion {
  const s = useContext(Contexto);
  if (!s) throw new Error("useSesion fuera de ProveedorSesion");
  return s;
}
