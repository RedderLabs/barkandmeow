import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { api, type Ruta, type YoClinica } from "@barkandmeow/schema/api";
import { crearCliente, ErrorApi, type Respuesta } from "@barkandmeow/schema/cliente";

/* Llamadas al API desde el servidor de Next, con la cookie de sesión de quien
   pide la página. La cookie es httpOnly y nunca pasa por el JavaScript del
   navegador. */

const API_INTERNA = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4601";
const COOKIE = "bam_clinic";

/** Rutas GET sin parámetros: lo único que piden las páginas. */
type Lectura = Ruta & { metodo: "GET"; cuerpo?: undefined };

async function pedir<R extends Lectura>(r: R): Promise<Respuesta<R> | null> {
  const c = (await cookies()).get(COOKIE);
  if (!c) return null;
  const cliente = crearCliente({ base: API_INTERNA, cabeceras: () => ({ cookie: `${COOKIE}=${c.value}` }) });
  try {
    return await cliente.llamar(r as Lectura, { cache: "no-store" } as never);
  } catch (e) {
    if (e instanceof ErrorApi && e.estado === 401) return null;
    throw e;
  }
}

export type Yo = YoClinica;

/** Quién está dentro. Sin sesión, a la página de entrar. */
export async function exigirSesion(): Promise<Yo> {
  const yo = await pedir(api.clinicas.yoClinica);
  if (!yo) redirect("/entrar");
  return yo;
}

export async function apiServidor<R extends Lectura>(r: R): Promise<Respuesta<R>> {
  const res = await pedir(r);
  if (!res) redirect("/entrar");
  return res;
}
