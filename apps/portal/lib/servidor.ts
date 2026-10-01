import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { api, type Yo } from "@barkandmeow/schema/api";
import { crearCliente, ErrorApi } from "@barkandmeow/schema/cliente";

/* Llamadas al API desde el servidor de Next, con la cookie de sesión del
   dueño. La cookie es httpOnly y nunca pasa por el JavaScript del navegador. */

const API_INTERNA = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4601";
const COOKIE = "bam_owner";

export type { EstadoMascota as Estado, Mascota, Yo } from "@barkandmeow/schema/api";

/** Cliente del API interno que reenvía la cookie del dueño. */
export const clienteServidor = (valor: string) =>
  crearCliente({ base: API_INTERNA, cabeceras: () => ({ cookie: `${COOKIE}=${valor}` }) });

/** El dueño con sesión abierta. Sin ella, a entrar. El marco de una mascota y
    su página la piden los dos: `cache` hace que sea una sola llamada. */
export const exigirSesion = cache(async function exigirSesion(): Promise<Yo> {
  const c = (await cookies()).get(COOKIE);
  if (!c) redirect("/entrar");
  try {
    return await clienteServidor(c.value).llamar(api.duenos.yo, { cache: "no-store" });
  } catch (e) {
    if (e instanceof ErrorApi && e.estado === 401) redirect("/entrar");
    throw new Error(`/owners/v1/me: ${e instanceof ErrorApi ? e.estado : (e as Error).message}`);
  }
});

/** La URL de la foto vista desde el navegador: por el proxy del portal. */
export const urlFoto = (foto: string | null) => (foto ? `/mi-mascota/api${foto}` : null);
