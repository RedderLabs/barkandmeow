"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ErrorApi } from "@barkandmeow/schema/cliente";
import { clienteOps, COOKIE, exigirToken, rutas } from "@/lib/api";

export type Resultado = { error: string } | { ok: true } | null;

/** Entrar: el token se comprueba contra el API antes de guardarlo. */
export async function entrar(_prev: Resultado, datos: FormData): Promise<Resultado> {
  const token = String(datos.get("token") ?? "").trim();
  if (token.length < 32) return { error: "El token tiene al menos 32 caracteres." };
  try {
    await clienteOps(token).llamar(rutas.colaReclamaciones, { cache: "no-store" });
  } catch (e) {
    const estado = e instanceof ErrorApi ? e.estado : 0;
    if (estado === 0) return { error: "No hay conexión con el API." };
    if (estado === 429) return { error: "Demasiados intentos. Espera un minuto." };
    return { error: "Ese token no vale, o el API no tiene OPS_TOKEN configurado." };
  }
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/operador",
    maxAge: 12 * 3600,
  });
  redirect("/");
}

/** Resolver una reclamación a favor de una de las partes, con la nota del porqué. */
export async function resolver(_prev: Resultado, datos: FormData): Promise<Resultado> {
  const id = String(datos.get("id") ?? "");
  const aFavor = String(datos.get("aFavor") ?? "");
  const nota = String(datos.get("nota") ?? "").trim();
  if (aFavor !== "reclamante" && aFavor !== "titular") return { error: "Elige a favor de quién." };
  if (nota.length < 5) return { error: "Explica en la nota por qué: queda guardada con la resolución." };
  try {
    await clienteOps(await exigirToken()).llamar(rutas.resolverReclamacion, {
      params: { id },
      cuerpo: { aFavor, nota },
    });
  } catch (e) {
    if (!(e instanceof ErrorApi) || e.estado === 0) return { error: "No hay conexión con el API." };
    return { error: e.message };
  }
  revalidatePath("/");
  return { ok: true };
}
