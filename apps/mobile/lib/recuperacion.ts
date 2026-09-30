import { ErrorApi, guardarClaveRecuperacion, type Yo } from "./api";
import { aBase64, claveDeRecuperacion, deBase64, iguales, publica } from "./cripto";

/* Cuentas de antes de la recuperación de contraseña: el servidor aún no
   guarda su clave pública de recuperación. Si este móvil tiene la clave del
   papel (y es la de esta cuenta), la sube una vez. Sin ella, esa cuenta no
   podría recuperar la contraseña con el papel. Nunca bloquea la pantalla. */

let hecho = false;

export function rellenarRecuperacion(y: Pick<Yo, "pubKey" | "recuperacion">, clave: Uint8Array | null) {
  if (hecho || y.recuperacion || !clave) return;
  if (!iguales(publica(clave), deBase64(y.pubKey))) return;
  hecho = true;
  void guardarClaveRecuperacion(aBase64(claveDeRecuperacion(clave).publica)).catch((e: unknown) => {
    // 409: ya estaba guardada. Otro fallo: se reintenta en la próxima carga.
    if (!(e instanceof ErrorApi && e.estado === 409)) hecho = false;
  });
}
