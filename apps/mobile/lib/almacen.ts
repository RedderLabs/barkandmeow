/* Lo que la app guarda en el teléfono, todo en el llavero del sistema
   (Keychain en iOS, Keystore en Android) y solo para este dispositivo: no
   viaja en las copias de seguridad ni a otro móvil.

   - El token de sesión.
   - La clave secreta X25519 del dueño, derivada de su código en papel. Al
     servidor solo va la pública; si se pierde el móvil, el papel la rehace.
   - El token de push registrado, para retirarlo al salir. */

import * as SecureStore from "expo-secure-store";
import { aBase64, deBase64 } from "./cripto";

const OPCIONES: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const SESION = "bm.sesion";
const CLAVE = "bm.clave-dueno";
const PUSH = "bm.push";

export const leerToken = () => SecureStore.getItemAsync(SESION, OPCIONES);
export const guardarToken = (t: string) => SecureStore.setItemAsync(SESION, t, OPCIONES);
export const borrarToken = () => SecureStore.deleteItemAsync(SESION, OPCIONES);

export async function leerClave(): Promise<Uint8Array | null> {
  const s = await SecureStore.getItemAsync(CLAVE, OPCIONES);
  const b = s ? deBase64(s) : null;
  return b && b.length === 32 ? b : null;
}
export const guardarClave = (secreta: Uint8Array) => SecureStore.setItemAsync(CLAVE, aBase64(secreta), OPCIONES);
export const borrarClave = () => SecureStore.deleteItemAsync(CLAVE, OPCIONES);

export const leerPush = () => SecureStore.getItemAsync(PUSH, OPCIONES);
export const guardarPush = (t: string) => SecureStore.setItemAsync(PUSH, t, OPCIONES);
export const borrarPush = () => SecureStore.deleteItemAsync(PUSH, OPCIONES);
