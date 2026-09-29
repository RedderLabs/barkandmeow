/* El envoltorio contra el .wasm real: lo que cierra se abre, lo manipulado no. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ad, aBase64Url, cargarCripto, claveDeClinica, claveDeFragmento, ErrorCripto, leerCodigo, nuevoCodigo } from "./index.ts";

const cripto = await cargarCripto(readFileSync(new URL("../wasm/bm_crypto.wasm", import.meta.url)));
const enc = new TextEncoder();

test("sobre: ida y vuelta, y atado a su id", () => {
  const k = crypto.getRandomValues(new Uint8Array(32));
  const s = cripto.cerrar(k, ad.emergencia("placa-1"), enc.encode("ficha"));
  assert.equal(new TextDecoder().decode(cripto.abrir(k, ad.emergencia("placa-1"), s)), "ficha");
  assert.throws(() => cripto.abrir(k, ad.emergencia("placa-2"), s), (e) => e instanceof ErrorCripto && e.fallo === "autenticacion");
});

test("la clave viaja en el fragmento como base64url de 43 caracteres", () => {
  const k = crypto.getRandomValues(new Uint8Array(32));
  const f = aBase64Url(k);
  assert.equal(f.length, 43);
  assert.deepEqual(claveDeFragmento("#" + f), k);
  assert.equal(claveDeFragmento("#corto"), null);
});

test("lo sellado solo lo abre el dueño", () => {
  const dueno = crypto.getRandomValues(new Uint8Array(32));
  const s = cripto.sellar(cripto.publica(dueno), enc.encode("nota"));
  assert.equal(s.length, 32 + 16 + 4);
  assert.equal(new TextDecoder().decode(cripto.abrirSellado(dueno, s)), "nota");
  assert.throws(() => cripto.abrirSellado(crypto.getRandomValues(new Uint8Array(32)), s), ErrorCripto);
});

test("documento de varios bloques, atado a su id", () => {
  const k = crypto.getRandomValues(new Uint8Array(32));
  const pdf = crypto.getRandomValues(new Uint8Array(65536)).map((x, i) => (i < 2_000_000 ? x : 0));
  const grande = new Uint8Array(2 * 1024 * 1024 + 11);
  for (let i = 0; i < grande.length; i += pdf.length) grande.set(pdf.subarray(0, Math.min(pdf.length, grande.length - i)), i);
  const d = cripto.cerrarDocumento(k, ad.documento("doc-1"), grande);
  assert.deepEqual(cripto.abrirDocumento(k, ad.documento("doc-1"), d), grande);
  assert.throws(() => cripto.abrirDocumento(k, ad.documento("doc-2"), d), ErrorCripto);
});

test("código de recuperación: 8 bloques que devuelven la misma clave", async () => {
  const { bloques, semilla } = await nuevoCodigo();
  assert.equal(bloques.length, 8);
  assert.ok(bloques.every((b) => /^[0-9A-HJKMNP-TV-Z]{4}$/.test(b)));
  const leida = await leerCodigo(bloques.join(" ").toLowerCase());
  assert.deepEqual(leida, semilla);
  assert.deepEqual(claveDeClinica(cripto, leida!).publica, claveDeClinica(cripto, semilla).publica);
});

test("una errata en el código se detecta", async () => {
  const { bloques } = await nuevoCodigo();
  let fallos = 0;
  for (let i = 0; i < 32; i++) {
    const c = bloques.join("").split("");
    c[i] = c[i] === "7" ? "8" : "7";
    if ((await leerCodigo(c.join(""))) === null) fallos++;
  }
  // 10 bits de comprobación: casi todas las erratas de un carácter se detectan.
  assert.ok(fallos >= 30, `solo se detectaron ${fallos} de 32`);
  assert.equal(await leerCodigo("corto"), null);
});

test("O, I y L tecleadas por error se leen como 0 y 1", async () => {
  const { bloques, semilla } = await nuevoCodigo();
  const tecleado = bloques.join("-").replace(/0/g, "O").replace(/1/g, "l");
  assert.deepEqual(await leerCodigo(tecleado), semilla);
});
