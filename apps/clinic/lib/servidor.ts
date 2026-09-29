import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/* Llamadas al API desde el servidor de Next, con la cookie de sesión de quien
   pide la página. La cookie es httpOnly y nunca pasa por el JavaScript del
   navegador. */

const API_INTERNA = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4601";
const COOKIE = "bam_clinic";

async function pedir<T>(ruta: string): Promise<T | null> {
  const c = (await cookies()).get(COOKIE);
  if (!c) return null;
  const r = await fetch(`${API_INTERNA}${ruta}`, {
    headers: { cookie: `${COOKIE}=${c.value}` },
    cache: "no-store",
  });
  if (r.status === 401) return null;
  if (!r.ok) throw new Error(`${ruta}: ${r.status}`);
  return (await r.json()) as T;
}

export type Yo = {
  memberId: string;
  clinicId: string;
  role: "admin" | "vet" | "assistant";
  clinicaActiva: boolean;
  nombre: string;
  correo: string;
  correoVerificado: boolean;
  claveEnvuelta: string | null;
  clinica: {
    nombre: string;
    pais: string;
    dominio: string | null;
    verificada: boolean;
    direccion: string | null;
    pubKey: string;
  };
};

/** Quién está dentro. Sin sesión, a la página de entrar. */
export async function exigirSesion(): Promise<Yo> {
  const yo = await pedir<Yo>("/clinics/v1/me");
  if (!yo) redirect("/entrar");
  return yo;
}

export async function apiServidor<T>(ruta: string): Promise<T> {
  const r = await pedir<T>(ruta);
  if (!r) redirect("/entrar");
  return r;
}

/** Lo que muestra la cabecera: nombre y país. */
export const organizacion = (yo: Yo) => ({
  nombre: yo.clinica.nombre,
  ciudad: yo.clinica.direccion?.split(",").pop()?.trim() ?? "",
  pais: yo.clinica.pais,
});
