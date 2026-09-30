import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { api } from "@barkandmeow/schema/api";
import { crearCliente, type Respuesta } from "@barkandmeow/schema/cliente";

/* El panel habla con el API solo desde su servidor. El token del operador
   lo teclea la persona al entrar y queda en una cookie httpOnly de este
   origen: el JavaScript del navegador no lo ve y no sale hacia el API desde
   el navegador. Rutas y respuestas salen del catálogo de @barkandmeow/schema/api. */

const API_INTERNA = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4601";
export const COOKIE = "bam_ops";

export const rutas = api.publicas;

export type Reclamacion = Respuesta<typeof api.publicas.colaReclamaciones>["reclamaciones"][number];
export type Motivo = Reclamacion["motivo"];

/** Cliente con el token del operador. */
export const clienteOps = (token: string) =>
  crearCliente({ base: API_INTERNA, cabeceras: () => ({ authorization: `Bearer ${token}` }) });

/** El token de la cookie; sin él, a entrar. */
export async function exigirToken(): Promise<string> {
  const c = (await cookies()).get(COOKIE);
  if (!c) redirect("/entrar");
  return c.value;
}

/** La cola de reclamaciones. Un token que ya no vale (404, como una ruta desconocida) manda a salir. */
export async function leerCola(): Promise<Reclamacion[]> {
  const cliente = clienteOps(await exigirToken());
  try {
    return (await cliente.llamar(rutas.colaReclamaciones, { cache: "no-store" })).reclamaciones;
  } catch (e) {
    const estado = (e as { estado?: number }).estado;
    if (estado === 404 || estado === 401) redirect("/salir");
    throw e;
  }
}
