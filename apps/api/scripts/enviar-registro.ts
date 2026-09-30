/* Hace de software de gestión: firma un registro y lo envía al dueño.

     BM_API_KEY=bmk_… BM_FIRMA=bmf_… pnpm --filter @barkandmeow/api registro <registro.json> [informe.pdf …]

   El JSON es una vacuna, una desparasitación, un análisis de anticuerpos o un
   informe (ver packages/schema/src/pasaporte.ts), con el chip del animal:

     { "version": 1, "tipo": "vacuna", "chip": "724098060143113",
       "fecha": "2026-09-29", "clinica": "Clínica Demo", "veterinario": "Dra. Demo",
       "enfermedad": "rabia", "producto": "Rabisin", "lote": "L2231",
       "validaHasta": "2027-09-29" }

   Es la referencia para quien integre un software de gestión: habla con la
   API solo por HTTP y usa primitivas estándar que cualquier libsodium tiene:
   Ed25519 (crypto_sign_detached) para firmar y crypto_box_seal para sellar.
   BM_API_URL cambia la dirección de la API.

   Un informe o un análisis de anticuerpos admiten hasta tres PDF detrás del
   JSON: cada uno va sellado aparte y el registro firmado lleva su SHA-256. */
import { createHash } from "node:crypto";
import { basename } from "node:path";
import { readFileSync } from "node:fs";
import { registroClinico } from "@barkandmeow/schema";

type Cripto = {
  sellar(destino: Uint8Array, t: Uint8Array): Uint8Array;
  firmar(semilla: Uint8Array, m: Uint8Array): Uint8Array;
  publicaFirma(semilla: Uint8Array): Uint8Array;
};
const RUTA_CRIPTO = "../../../packages/crypto/js/index.ts";
const { cargarCripto, deBase64, firmarRegistro } = (await import(RUTA_CRIPTO)) as {
  cargarCripto(bytes: Uint8Array): Promise<Cripto>;
  deBase64(s: string): Uint8Array | null;
  firmarRegistro(c: Cripto, semilla: Uint8Array, registro: object): object;
};

const API = process.env.BM_API_URL ?? `http://127.0.0.1:${process.env.PORT ?? 4601}`;
const CLAVE = process.env.BM_API_KEY ?? "";
const FIRMA = process.env.BM_FIRMA ?? "";
const archivo = process.argv[2];
const pdfs = process.argv.slice(3).map((ruta) => ({ nombre: basename(ruta), bytes: readFileSync(ruta) }));

if (!CLAVE || !FIRMA || !archivo) {
  console.error("Uso: BM_API_KEY=bmk_… BM_FIRMA=bmf_… pnpm --filter @barkandmeow/api registro <registro.json>");
  process.exit(1);
}

const semilla = deBase64(FIRMA.replace(/^bmf_/, ""));
if (!semilla || semilla.length !== 32) throw new Error("BM_FIRMA no es una clave de firma (bmf_…)");

// El registro se valida aquí, antes de firmar: lo firmado ya no se corrige.
const crudo = JSON.parse(readFileSync(archivo, "utf8"));
if (pdfs.length) {
  if (pdfs.some((p) => p.bytes.subarray(0, 4).toString() !== "%PDF")) throw new Error("los adjuntos tienen que ser PDF");
  crudo.adjuntos = pdfs.map((p) => ({
    nombre: p.nombre,
    tipo: "application/pdf",
    bytes: p.bytes.length,
    sha256: createHash("sha256").update(p.bytes).digest("hex"),
  }));
}
const leido = registroClinico.safeParse(crudo);
if (!leido.success) {
  console.error("El registro no es válido:", leido.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  process.exit(1);
}
const registro = leido.data;
if (!registro.chip) throw new Error("el registro necesita el chip del animal");

async function api<T>(ruta: string, cuerpo?: unknown): Promise<T> {
  const r = await fetch(`${API}${ruta}`, {
    method: cuerpo ? "POST" : "GET",
    headers: {
      authorization: `Bearer ${CLAVE}`,
      ...(cuerpo ? { "content-type": "application/json" } : {}),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(`${ruta}: ${r.status} ${j.error ?? ""}`);
  return j;
}

// 1. La clave vale y es de esta clínica.
const yo = await api<{ clinica: { nombre: string } }>("/clinics/v1/api/me");

// 2. El paciente de ese chip, entre los que dieron nivel 3 a la clínica.
const tipo = /^\d{15}$/.test(registro.chip) ? "iso" : "nonISO";
const paciente = await api<{ petId: string; ownerPubKey: string }>("/clinics/v1/api/patients/search", {
  identificador: { tipo, valor: registro.chip },
});

// 3. Firmado con la clave de la clínica y sellado para el dueño.
const cripto = await cargarCripto(
  readFileSync(new URL("../../../packages/crypto/wasm/bm_crypto.wasm", import.meta.url)),
);
const firmado = firmarRegistro(cripto, semilla, registro);
const destino = deBase64(paciente.ownerPubKey);
if (!destino) throw new Error("clave pública del dueño mal formada");
const sellado = cripto.sellar(destino, new TextEncoder().encode(JSON.stringify(firmado)));

// 4. Enviar. El servidor lo deja en la bandeja del dueño sin poder abrirlo.
const envio = await api<{ envioId: string }>("/clinics/v1/reports", {
  petId: paciente.petId,
  sellado: Buffer.from(sellado).toString("base64"),
  adjuntos: pdfs.map((p) => Buffer.from(cripto.sellar(destino, p.bytes)).toString("base64")),
});
console.log(`${registro.tipo} firmado y enviado desde ${yo.clinica.nombre}: envío ${envio.envioId}`);
