import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/* Llamadas al API desde el servidor de Next, con la cookie de sesión del
   dueño. La cookie es httpOnly y nunca pasa por el JavaScript del navegador. */

const API_INTERNA = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4601";
const COOKIE = "bam_owner";

export type Estado = "pendiente" | "activa" | "congelada" | "retirada";

export type Mascota = {
  petId: string;
  estado: Estado;
  chipPista: string | null;
  activada: string | null;
  /** Mensajes esperando en la bandeja. Solo el número: el contenido va sellado. */
  mensajes: number;
  perfil: {
    nombre: string;
    bio: string;
    telefonos: { etiqueta: string; numero: string }[];
    publicado: boolean;
    /** Ruta relativa a la API, o null. */
    foto: string | null;
  };
  reclamacion: {
    id: string;
    plazo: string;
    estado: "abierta" | "impugnada";
    rol: "titular" | "reclamante";
  } | null;
};

export type Yo = { correo: string; pubKey: string; mascotas: Mascota[] };

/** El dueño con sesión abierta. Sin ella, a entrar. */
export async function exigirSesion(): Promise<Yo> {
  const c = (await cookies()).get(COOKIE);
  if (!c) redirect("/entrar");
  const r = await fetch(`${API_INTERNA}/owners/v1/me`, {
    headers: { cookie: `${COOKIE}=${c.value}` },
    cache: "no-store",
  });
  if (r.status === 401) redirect("/entrar");
  if (!r.ok) throw new Error(`/owners/v1/me: ${r.status}`);
  return (await r.json()) as Yo;
}

/** La URL de la foto vista desde el navegador: por el proxy del portal. */
export const urlFoto = (foto: string | null) => (foto ? `/mi-mascota/api${foto}` : null);
