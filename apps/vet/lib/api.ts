/* Llamadas de la web del veterinario a apps/api.
   Solo nivel 0: la web no tiene sesión, y el servidor responde lo mismo en
   forma, tamaño y tiempo exista o no la ficha. */

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4601";

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

export type PerfilPublico = {
  nombre?: string;
  bio: string;
  telefonos: { etiqueta: string; numero: string }[];
  /** URL absoluta de la foto, o null. */
  foto: string | null;
};

export type Consulta = {
  existe: boolean;
  /** Token para avisar al dueño; si no hay ficha es un señuelo. */
  aviso: string;
  /** Clave pública X25519 del dueño, para sellar el aviso (señuelo si no hay ficha). */
  ownerPubKey: string;
  /** Lo que el dueño publicó para quien encuentre al animal, si lo hizo. */
  perfil: PerfilPublico | null;
};

export async function consultarChip(id: Identificador, signal?: AbortSignal): Promise<Consulta> {
  const r = await fetch(`${API_URL}/chip/v1/lookup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identificador: id }),
    signal,
  });
  if (!r.ok) throw new Error(`lookup ${r.status}`);
  const { existe, aviso, ownerPubKey, perfil } = (await r.json()) as Consulta;
  return {
    existe,
    aviso,
    ownerPubKey,
    perfil: perfil && { ...perfil, foto: perfil.foto ? `${API_URL}${perfil.foto}` : null },
  };
}

export type Aviso = {
  clinica: string;
  telefono: string;
  motivo: string;
  idioma: string;
};

/* El aviso se sella en este navegador para la clave pública del dueño: el
   servidor lo guarda en su bandeja sin poder leer la clínica ni el teléfono.
   PENDIENTE en apps/api: el envío push al móvil del dueño (APNs/FCM). Hasta
   entonces el aviso espera en la bandeja y el dueño lo ve al abrir la app. */
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

  const r = await fetch(`${API_URL}/chip/v1/notify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ aviso: consulta.aviso, sellado: btoa(b) }),
  });
  if (!r.ok) throw new Error(`notify ${r.status}`);
}
