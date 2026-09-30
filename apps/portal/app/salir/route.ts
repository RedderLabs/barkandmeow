import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { api } from "@barkandmeow/schema/api";
import { clienteServidor } from "@/lib/servidor";

/* Cierra la sesión en el API y borra la cookie. Después, a entrar. */
export async function GET(req: NextRequest) {
  const c = (await cookies()).get("bam_owner");
  if (c) await clienteServidor(c.value).llamar(api.duenos.salir).catch(() => {});
  const r = NextResponse.redirect(new URL("/mi-mascota/entrar", req.url));
  r.cookies.delete("bam_owner");
  return r;
}
