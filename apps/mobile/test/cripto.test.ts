/* lib/cripto.ts contra el .wasm real de packages/crypto.

   Cada vector sale del núcleo en Rust en el momento: código de recuperación,
   clave derivada, sellado y firma. Si el JS del móvil y el Rust de la web se
   separan en un solo byte, esto falla. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  aBase64 as aBase64Wasm,
  cargarCripto,
  claveDeDueno as claveDeDuenoWasm,
  claveDeRecuperacion as claveDeRecuperacionWasm,
  claveFicha as claveFichaWasm,
  firmarRegistro,
  nuevoCodigo,
} from "@barkandmeow/crypto";
import {
  aBase64,
  abrirSellado,
  claveDeDueno,
  claveDeRecuperacion,
  claveFicha,
  deBase64,
  derivar,
  ErrorCripto,
  firmaValida,
  leerCodigo,
  publica,
  sellar,
  verificar,
} from "../lib/cripto.ts";

const wasm = await cargarCripto(
  readFileSync(new URL("../../../packages/crypto/wasm/bm_crypto.wasm", import.meta.url)),
);
const enc = new TextEncoder();
const dec = new TextDecoder();
const azar = (n: number) => crypto.getRandomValues(new Uint8Array(n));

test("el código en papel da la misma clave que en la web", async () => {
  for (let i = 0; i < 25; i++) {
    const { bloques, semilla } = await nuevoCodigo();
    const leida = leerCodigo(bloques.join(" ").toLowerCase());
    assert.deepEqual(leida, semilla);
    const web = claveDeDuenoWasm(wasm, semilla);
    const movil = claveDeDueno(leida!);
    assert.deepEqual(movil.secreta, web.secreta);
    assert.deepEqual(movil.publica, web.publica);
  }
});

test("una errata en el código se detecta", async () => {
  const { bloques } = await nuevoCodigo();
  const c = bloques.join("").split("");
  c[5] = c[5] === "7" ? "8" : "7";
  const r = leerCodigo(c.join(""));
  // 10 bits de comprobación: 1 de cada 1024 erratas pasaría. Esta no.
  if (r) assert.notDeepEqual(r, leerCodigo(bloques.join("")));
  assert.equal(leerCodigo("corto"), null);
});

test("HKDF y X25519 coinciden con el núcleo en Rust", () => {
  for (const n of [0, 1, 19, 32, 100]) {
    const s = azar(n);
    assert.deepEqual(derivar(s, "bm:dueno:pasaporte:v1"), wasm.derivar(s, "bm:dueno:pasaporte:v1"));
  }
  const k = azar(32);
  assert.deepEqual(publica(k), wasm.publica(k));
});

test("lo que sella la web (crypto_box_seal) se abre en el móvil", () => {
  const dueno = azar(32);
  for (const texto of ["", "nota", "ñandú 🐾 ".repeat(500)]) {
    const s = wasm.sellar(wasm.publica(dueno), enc.encode(texto));
    assert.equal(dec.decode(abrirSellado(dueno, s)), texto);
  }
});

test("lo que sella el móvil lo abre la web, y la clave de la ficha es la misma", () => {
  const clinica = azar(32);
  const dueno = azar(32);
  const petId = "7b0f6a52-0c1e-4b7a-9a57-3f1f4f0f9a11";
  const k = claveFicha(dueno, petId);
  assert.deepEqual(k, claveFichaWasm(wasm, dueno, petId));
  assert.notDeepEqual(k, claveFicha(dueno, "7b0f6a52-0c1e-4b7a-9a57-3f1f4f0f9a12"));

  const s = sellar(wasm.publica(clinica), azar(32), k);
  assert.equal(s.length, 32 + 16 + 32);
  assert.deepEqual(wasm.abrirSellado(clinica, s), k);
  assert.deepEqual(abrirSellado(clinica, s), k);
  assert.throws(() => wasm.abrirSellado(azar(32), s));
});

test("sellado para otra clave o manipulado no se abre", () => {
  const dueno = azar(32);
  const s = wasm.sellar(wasm.publica(dueno), enc.encode("nota"));
  assert.throws(() => abrirSellado(azar(32), s), (e) => e instanceof ErrorCripto && e.fallo === "autenticacion");
  const roto = s.slice();
  roto[roto.length - 1] ^= 1;
  assert.throws(() => abrirSellado(dueno, roto), ErrorCripto);
  assert.throws(() => abrirSellado(dueno, s.subarray(0, 40)), (e) => e instanceof ErrorCripto && e.fallo === "formato");
});

test("las firmas de la clínica se comprueban igual que en la web", () => {
  const semilla = azar(32);
  const f = firmarRegistro(wasm, semilla, { version: 1, tipo: "vacuna", chip: "724098100001234", validaHasta: "2027-03-14" });
  assert.equal(firmaValida(f), true);
  assert.equal(firmaValida({ ...f, registro: f.registro.replace("2027", "2028") }), false);
  const otra = firmarRegistro(wasm, azar(32), {});
  assert.equal(firmaValida({ ...f, clave: otra.clave }), false);
  assert.equal(firmaValida({ ...f, firma: "corta" }), false);
  // RFC 8032, 7.1, TEST 1.
  const h = (s: string) => Uint8Array.from(s.match(/../g)!.map((x) => parseInt(x, 16)));
  assert.equal(
    verificar(
      h("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a"),
      new Uint8Array(),
      h("e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b"),
    ),
    true,
  );
});

test("base64 propio igual que el de la web, y acepta base64url", () => {
  for (const n of [0, 1, 2, 3, 31, 32, 33, 64]) {
    const b = azar(n);
    assert.equal(aBase64(b), aBase64Wasm(b));
    assert.deepEqual(deBase64(aBase64(b)), b);
    assert.deepEqual(deBase64(aBase64(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")), b);
  }
  assert.equal(deBase64("no es base64!"), null);
});

test("la clave de recuperación del móvil es la misma que la de la web", () => {
  for (let i = 0; i < 25; i++) {
    const secreta = azar(32);
    const web = claveDeRecuperacionWasm(wasm, secreta);
    const movil = claveDeRecuperacion(secreta);
    assert.deepEqual(movil.semilla, web.semilla);
    assert.deepEqual(movil.publica, web.publica);
    // Y lo que firma el móvil lo verifica el núcleo de la web.
    const m = enc.encode("bm:dueno:recuperacion:v1\nid\nreto");
    assert.ok(verificar(movil.publica, m, wasm.firmar(web.semilla, m)));
  }
});
