/* La bandeja del móvil con mensajes sellados por el .wasm real, como los
   que dejan la web del veterinario y el software de gestión. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { aBase64, cargarCripto, firmarRegistro } from "@barkandmeow/crypto";
import { abrirTodos, resumenRegistro } from "../lib/bandeja.ts";

const wasm = await cargarCripto(
  readFileSync(new URL("../../../packages/crypto/wasm/bm_crypto.wasm", import.meta.url)),
);
const enc = new TextEncoder();
const secreta = crypto.getRandomValues(new Uint8Array(32));
const pub = wasm.publica(secreta);
const sellar = (o: unknown) => aBase64(wasm.sellar(pub, enc.encode(JSON.stringify(o))));
const mensaje = (id: string, o: unknown, origen: { firma: string | null } | null = null) => ({
  id,
  petId: "p",
  llegada: "2026-09-30T10:00:00.000Z",
  sellado: typeof o === "string" ? o : sellar(o),
  origen: origen && { clinica: "Clínica Sur", pais: "ES", dominio: "sur.vet", ...origen },
});

test("notas, avisos, informes y certificados firmados", () => {
  const firma = crypto.getRandomValues(new Uint8Array(32));
  const clave = aBase64(wasm.publicaFirma(firma));
  const vacuna = firmarRegistro(wasm, firma, {
    version: 1,
    tipo: "vacuna",
    chip: "724098100001234",
    fecha: "2026-03-14",
    enfermedad: "rabia",
    producto: "Nobivac",
    lote: "A1",
    validaHasta: "2027-03-14",
  });
  const [nota, aviso, informe, cert, mala, sinOrigen, basura] = abrirTodos(secreta, [
    mensaje("1", { version: 1, tipo: "nota", clinica: "Sur", motivo: "Revisión", diagnostico: "Sano" }),
    mensaje("2", { version: 1, tipo: "aviso", clinica: "Norte", telefono: "+34 600", motivo: "" }),
    mensaje("3", { version: 1, tipo: "informe", fecha: "2026-09-01", motivo: "Cojera" }, { firma: clave }),
    mensaje("4", vacuna, { firma: clave }),
    // Firmado bien, pero no por la clave de la conexión que lo envió.
    mensaje("5", vacuna, { firma: aBase64(wasm.publicaFirma(crypto.getRandomValues(new Uint8Array(32)))) }),
    mensaje("6", { version: 1, tipo: "informe", motivo: "x" }),
    mensaje("7", "AAAA"),
  ]);
  assert.deepEqual(nota.contenido, { tipo: "nota", clinica: "Sur", motivo: "Revisión", diagnostico: "Sano", tratamiento: "", observaciones: "" });
  assert.equal(aviso.contenido.tipo, "aviso");
  assert.equal(informe.contenido.tipo, "informe");
  assert.equal(cert.contenido.tipo, "certificado");
  assert.deepEqual(cert.contenido.tipo === "certificado" && resumenRegistro(cert.contenido.registro), {
    titulo: "Vacuna de la rabia",
    detalle: "14/03/2026 · Nobivac · lote A1 · válida hasta 14/03/2027",
  });
  assert.equal(mala.contenido.tipo, "firma-mala");
  assert.equal(sinOrigen.contenido.tipo, "nota");
  assert.equal(basura.contenido.tipo, "ilegible");
});

test("sellado para otra clave: ilegible, no un error", () => {
  const otra = wasm.publica(crypto.getRandomValues(new Uint8Array(32)));
  const [m] = abrirTodos(secreta, [
    mensaje("1", aBase64(wasm.sellar(otra, enc.encode('{"version":1,"tipo":"nota"}')))),
  ]);
  assert.equal(m.contenido.tipo, "ilegible");
});
