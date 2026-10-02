/* El envoltorio contra el .wasm real: lo que cierra se abre, lo manipulado no. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ad, aBase64Url, cargarCripto, claveDeClinica, claveDeDueno, claveDeFragmento, claveDeRecuperacion, ErrorCripto, firmaValida, firmarRegistro, leerCodigo, nuevoCodigo } from "./index.ts";

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

test("un registro firmado se comprueba, y cambiado en un byte ya no", () => {
  const semilla = crypto.getRandomValues(new Uint8Array(32));
  const f = firmarRegistro(cripto, semilla, { version: 1, tipo: "vacuna", chip: "724098100001234", validaHasta: "2027-03-14" });
  assert.equal(firmaValida(cripto, f), true);
  // El dueño adelanta la validez: la firma ya no vale.
  assert.equal(firmaValida(cripto, { ...f, registro: f.registro.replace("2027", "2028") }), false);
  // Otra clave: tampoco.
  const otra = firmarRegistro(cripto, crypto.getRandomValues(new Uint8Array(32)), {});
  assert.equal(firmaValida(cripto, { ...f, clave: otra.clave }), false);
  assert.equal(firmaValida(cripto, { ...f, firma: "corta" }), false);
});

test("la clave de recuperación del dueño: fija para su papel, distinta de la X25519 y firma", async () => {
  const { semilla } = await nuevoCodigo();
  const dueno = claveDeDueno(cripto, semilla);
  const a = claveDeRecuperacion(cripto, dueno.secreta);
  const b = claveDeRecuperacion(cripto, claveDeDueno(cripto, semilla).secreta);
  assert.deepEqual(a.publica, b.publica);
  assert.notDeepEqual(a.publica, dueno.publica);
  assert.notDeepEqual(a.semilla, dueno.secreta);
  const m = enc.encode("bm:dueno:recuperacion:v1\nid\nreto");
  const f = cripto.firmar(a.semilla, m);
  assert.ok(cripto.verificar(a.publica, m, f));
  assert.ok(!cripto.verificar(a.publica, enc.encode("otro reto"), f));
  // Otro papel, otra clave.
  const otro = claveDeRecuperacion(cripto, claveDeDueno(cripto, (await nuevoCodigo()).semilla).secreta);
  assert.notDeepEqual(otro.publica, a.publica);
});

test("la etiqueta de un paciente: solo la abre su clínica, atada al paciente y sin delatar su largo", async () => {
  const { abrirEtiqueta, cerrarEtiqueta, claveEtiquetas, ETIQUETA_MAX } = await import("./index.ts");
  const clinica = claveDeClinica(cripto, (await nuevoCodigo()).semilla);
  const k = claveEtiquetas(cripto, clinica.secreta);
  // Otra clave que la de la clínica: tener la de las etiquetas no da la de las fichas.
  assert.notDeepEqual(k, clinica.secreta);

  const corta = cerrarEtiqueta(cripto, k, "clinica-1", "pet-1", "  Kira,   de Ana ");
  const larga = cerrarEtiqueta(cripto, k, "clinica-1", "pet-1", "Ñ".repeat(200));
  assert.equal(abrirEtiqueta(cripto, k, "clinica-1", "pet-1", corta), "Kira, de Ana");
  assert.equal(abrirEtiqueta(cripto, k, "clinica-1", "pet-1", larga), "Ñ".repeat(ETIQUETA_MAX));
  assert.equal(corta.length, larga.length);
  assert.ok(corta.length <= 512);

  // Movida a otro paciente o a otra clínica, o con otra clave, no se abre.
  assert.equal(abrirEtiqueta(cripto, k, "clinica-1", "pet-2", corta), null);
  assert.equal(abrirEtiqueta(cripto, k, "clinica-2", "pet-1", corta), null);
  const ajena = claveEtiquetas(cripto, claveDeClinica(cripto, (await nuevoCodigo()).semilla).secreta);
  assert.equal(abrirEtiqueta(cripto, ajena, "clinica-1", "pet-1", corta), null);
});

test("la clave de las etiquetas llega a un navegador del equipo solo si viene de su clínica", async () => {
  const { claveEtiquetas, entregarClaveEtiquetas, recibirClaveEtiquetas } = await import("./index.ts");
  const clinica = claveDeClinica(cripto, (await nuevoCodigo()).semilla);
  const dispositivo = crypto.getRandomValues(new Uint8Array(32));
  const publicaDispositivo = cripto.publica(dispositivo);

  const sellada = entregarClaveEtiquetas(cripto, clinica.secreta, publicaDispositivo);
  assert.equal(sellada.length, 80);
  // Los primeros 32 bytes son la pública de la clínica: de ahí sabe el navegador quién se la da.
  assert.deepEqual(sellada.subarray(0, 32), clinica.publica);
  assert.deepEqual(
    recibirClaveEtiquetas(cripto, dispositivo, clinica.publica, sellada),
    claveEtiquetas(cripto, clinica.secreta),
  );

  // Otro navegador no la abre.
  const otro = crypto.getRandomValues(new Uint8Array(32));
  assert.equal(recibirClaveEtiquetas(cripto, otro, clinica.publica, sellada), null);

  // Alguien sin la secreta de la clínica (el servidor, por ejemplo) le sella otra clave.
  const falsa = cripto.sellar(publicaDispositivo, crypto.getRandomValues(new Uint8Array(32)));
  assert.equal(falsa.length, 80);
  assert.equal(recibirClaveEtiquetas(cripto, dispositivo, clinica.publica, falsa), null);
  // Y si además le pega delante la pública de la clínica, el sello no cuadra.
  const pegada = new Uint8Array(falsa);
  pegada.set(clinica.publica);
  assert.equal(recibirClaveEtiquetas(cripto, dispositivo, clinica.publica, pegada), null);

  // La de otra clínica tampoco vale para esta.
  const ajena = claveDeClinica(cripto, (await nuevoCodigo()).semilla);
  const deOtra = entregarClaveEtiquetas(cripto, ajena.secreta, publicaDispositivo);
  assert.equal(recibirClaveEtiquetas(cripto, dispositivo, clinica.publica, deOtra), null);
});

test("la clave de una ficha cerrada para el equipo: la abre quien tiene la de las etiquetas, atada a clínica y paciente", async () => {
  const { abrirClaveDeEquipo, cerrarClaveParaEquipo, claveEtiquetas, claveFicha } = await import("./index.ts");
  const clinica = claveDeClinica(cripto, (await nuevoCodigo()).semilla);
  const dueno = claveDeDueno(cripto, (await nuevoCodigo()).semilla);
  const k = claveFicha(cripto, dueno.secreta, "mascota-1");

  // El administrador abre lo que selló el dueño y lo vuelve a cerrar para el equipo.
  const delDueno = cripto.sellar(clinica.publica, k);
  const equipo = claveEtiquetas(cripto, clinica.secreta);
  const cerrada = cerrarClaveParaEquipo(cripto, equipo, "clinica-1", "mascota-1", cripto.abrirSellado(clinica.secreta, delDueno));
  assert.equal(cerrada.length, 73);

  // Un veterinario, con la clave de las etiquetas y sin la de la clínica, abre la ficha.
  const recibida = abrirClaveDeEquipo(cripto, equipo, "clinica-1", "mascota-1", cerrada);
  assert.deepEqual(recibida, k);
  const ficha = cripto.cerrar(k, ad.ficha("mascota-1"), enc.encode("alergia a la penicilina"));
  assert.deepEqual(cripto.abrir(recibida!, ad.ficha("mascota-1"), ficha), enc.encode("alergia a la penicilina"));

  // No sirve para otro paciente ni para otra clínica, y la clave de las etiquetas a secas no la abre.
  assert.equal(abrirClaveDeEquipo(cripto, equipo, "clinica-1", "mascota-2", cerrada), null);
  assert.equal(abrirClaveDeEquipo(cripto, equipo, "clinica-2", "mascota-1", cerrada), null);
  const ajena = claveEtiquetas(cripto, claveDeClinica(cripto, (await nuevoCodigo()).semilla).secreta);
  assert.equal(abrirClaveDeEquipo(cripto, ajena, "clinica-1", "mascota-1", cerrada), null);
  assert.throws(() => cripto.abrir(equipo, ad.claveEquipo("clinica-1", "mascota-1"), cerrada), ErrorCripto);
});
