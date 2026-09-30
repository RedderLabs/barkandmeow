/* Llamadas de la web del veterinario a apps/api.
   La web no tiene sesión: habla con la API por CORS, sin credenciales. En el
   nivel 0 el servidor responde lo mismo en forma, tamaño y tiempo exista o no
   la ficha. */

import type { api, Ruta } from "@barkandmeow/schema/api";
import { crearCliente, type Respuesta } from "@barkandmeow/schema/cliente";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4601";

type P = typeof api.publicas;

/* La ficha de emergencia es estática y ligera: el catálogo trae zod y todos
   los contratos, así que aquí solo se importan sus tipos. Cada ruta se repite
   sin sus esquemas, tipada contra la del catálogo: un cambio de método o de
   ruta allí no compila aquí. `cuerpo: JSON_` solo marca que la ruta lleva
   cuerpo JSON (el cliente no valida, solo serializa). */
const JSON_ = {} as never;
const soloRuta = <R extends Ruta>(r: Pick<R, "metodo" | "ruta" | "acceso"> & { cuerpo?: never }) =>
  r as unknown as R;

export const rutas = {
  consultarChip: soloRuta<P["consultarChip"]>({
    metodo: "POST",
    ruta: "/chip/v1/lookup",
    acceso: "web-vet",
    cuerpo: JSON_,
  }),
  avisarDueno: soloRuta<P["avisarDueno"]>({
    metodo: "POST",
    ruta: "/chip/v1/notify",
    acceso: "web-vet",
    cuerpo: JSON_,
  }),
  leerPlaca: soloRuta<P["leerPlaca"]>({ metodo: "GET", ruta: "/e/v1/:id", acceso: "web-vet" }),
  leerCopia: soloRuta<P["leerCopia"]>({ metodo: "GET", ruta: "/s/v1/:id", acceso: "web-vet" }),
  leerDocumentoCopia: soloRuta<P["leerDocumentoCopia"]>({
    metodo: "GET",
    ruta: "/s/v1/:id/doc/:docId",
    acceso: "web-vet",
  }),
  dejarNota: soloRuta<P["dejarNota"]>({ metodo: "POST", ruta: "/s/v1/:id/nota", acceso: "web-vet", cuerpo: JSON_ }),
  firmante: soloRuta<P["firmante"]>({ metodo: "GET", ruta: "/firmas/v1/:clave", acceso: "web-vet" }),
};

/** Cliente sin credenciales; con `signal` si la llamada se puede cancelar. */
export const clienteApi = (signal?: AbortSignal) =>
  crearCliente({ base: API_URL, fetch: signal ? (u, i) => fetch(u, { ...i, signal }) : undefined });

export const cliente = clienteApi();

export type Identificador =
  | { tipo: "iso"; valor: string }
  | { tipo: "nonISO"; valor: string };

/** Quita espacios, puntos y guiones, como normalizarChip en packages/schema. */
export function normalizar(entrada: string): string {
  const limpio = entrada.trim().replace(/[\s.-]/g, "");
  if (/^nonISO:/i.test(limpio)) return "nonISO:" + limpio.slice(7).toUpperCase();
  return limpio;
}

export function identificar(valor: string): Identificador | null {
  if (/^\d{15}$/.test(valor)) return { tipo: "iso", valor };
  if (/^nonISO:[0-9A-F]{9,10}$/.test(valor)) return { tipo: "nonISO", valor };
  return null;
}

/** El perfil público tal como llega, con la foto ya como URL absoluta. */
export type PerfilPublico = NonNullable<Respuesta<P["consultarChip"]>["perfil"]>;

/** Lo que la interfaz usa de la consulta de nivel 0. */
export type Consulta = Pick<Respuesta<P["consultarChip"]>, "existe" | "aviso" | "ownerPubKey" | "perfil">;

/** La foto del perfil viene como ruta de la API: aquí se hace absoluta. */
export const perfilAbsoluto = <T extends { foto: string | null }>(p: T | null): T | null =>
  p && { ...p, foto: p.foto ? `${API_URL}${p.foto}` : null };

export async function consultarChip(id: Identificador, signal?: AbortSignal): Promise<Consulta> {
  const { existe, aviso, ownerPubKey, perfil } = await clienteApi(signal).llamar(rutas.consultarChip, {
    cuerpo: { identificador: id },
  });
  return { existe, aviso, ownerPubKey, perfil: perfilAbsoluto(perfil) };
}

export type Aviso = {
  clinica: string;
  telefono: string;
  motivo: string;
  idioma: string;
};

/* El aviso se sella en este navegador para la clave pública del dueño: el
   servidor lo guarda en su bandeja sin poder leer la clínica ni el teléfono. */
export async function enviarAviso(consulta: Consulta, aviso: Aviso): Promise<void> {
  const [{ cargarCripto, deBase64 }, { CRYPTO_WASM_URL }] = await Promise.all([
    import("@barkandmeow/crypto"),
    import("./crypto-url"),
  ]);
  const cripto = await cargarCripto(fetch(CRYPTO_WASM_URL));
  const destino = deBase64(consulta.ownerPubKey);
  if (!destino || destino.length !== 32) throw new Error("clave del dueño inválida");
  const claro = JSON.stringify({ tipo: "aviso", version: 1, fecha: new Date().toISOString(), ...aviso });
  const sellado = cripto.sellar(destino, new TextEncoder().encode(claro));
  let b = "";
  for (const x of sellado) b += String.fromCharCode(x);

  await cliente.llamar(rutas.avisarDueno, { cuerpo: { aviso: consulta.aviso, sellado: btoa(b) } });
}
