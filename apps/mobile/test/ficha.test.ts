/* La ficha de salud del móvil contra el núcleo de la web.

   Lo que el móvil guarda lo tiene que abrir el portal, y al revés; la placa
   que publica el móvil la tiene que abrir la web del veterinario con la clave
   del QR. Si se separan en un byte, esto falla. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ad, cargarCripto, claveDeFragmento, claveFicha, clavePasaporte } from "@barkandmeow/crypto";
import { FICHA_VACIA, fichaDueno, pasaporteDueno } from "@barkandmeow/schema";
import { aBase64, deBase64 } from "../lib/cripto.ts";
import {
  abrirFicha,
  cerrarFicha,
  enlacePlaca,
  notasDeBandeja,
  nuevaPlaca,
  registrosDePasaporte,
  sobreHistorial,
  sobrePlaca,
} from "../lib/ficha.ts";

const wasm = await cargarCripto(
  readFileSync(new URL("../../../packages/crypto/wasm/bm_crypto.wasm", import.meta.url)),
);
const enc = new TextEncoder();
const dec = new TextDecoder();
const azar = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const PET = "04a62bb2-41fc-4caf-a6ec-ef3683eacfb0";
const HOY = new Date("2026-10-01T12:00:00");

const ficha = fichaDueno.parse({
  version: 1,
  sexo: "hembra",
  raza: "Mestiza",
  nacimiento: "2021-05-14",
  pesoKg: "12,4",
  alergias: [{ id: "a", sustancia: "Amoxicilina", reaccion: "hinchazon-cara", gravedad: "alta" }],
  medicacion: [{ id: "m", principio: "Omeprazol", dosis: "10 mg", cadaHoras: 24 }],
  rabiaHasta: "2027-03-14",
});

test("la ficha que guarda el móvil la abre el portal, y la del portal la abre el móvil", () => {
  const secreta = azar(32);

  const delMovil = deBase64(cerrarFicha(secreta, PET, ficha, azar(24)))!;
  const enLaWeb = JSON.parse(dec.decode(wasm.abrir(claveFicha(wasm, secreta, PET), ad.ficha(PET), delMovil)));
  assert.deepEqual(fichaDueno.parse(enLaWeb), ficha);

  const delPortal = wasm.cerrar(claveFicha(wasm, secreta, PET), ad.ficha(PET), enc.encode(JSON.stringify(ficha)));
  assert.deepEqual(abrirFicha(secreta, PET, aBase64(delPortal)), ficha);

  // Sin ficha todavía, la vacía; con la de otra mascota o con otra clave, error y no una ficha vacía.
  assert.deepEqual(abrirFicha(secreta, PET, null), FICHA_VACIA);
  assert.throws(() => abrirFicha(secreta, "otra-mascota", aBase64(delPortal)));
  assert.throws(() => abrirFicha(azar(32), PET, aBase64(delPortal)));
});

test("la placa que publica el móvil la abre la web del veterinario con la clave del QR", () => {
  const placa = nuevaPlaca("4156f24a-7067-40ae-849a-bb29f58f1808", azar(32), " +34 600 000 000 ", HOY);
  assert.match(placa.clave, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(placa.telefono, "+34 600 000 000");
  const url = enlacePlaca("https://barkandmeow.app", placa);
  assert.equal(url, `https://barkandmeow.app/e/${placa.id}#${placa.clave}`);

  const sobre = sobrePlaca({ ...ficha, placa }, "Kira", azar(24), HOY)!;
  // Lo que hace la web del veterinario: la clave del fragmento y el id de la ruta.
  const k = claveDeFragmento(url.split("#")[1])!;
  const resumen = JSON.parse(dec.decode(wasm.abrir(k, ad.emergencia(placa.id), deBase64(sobre)!)));
  assert.equal(resumen.animal.nombre, "Kira");
  assert.equal(resumen.animal.edad, "5 años");
  assert.equal(resumen.alergias[0].sustancia, "Amoxicilina");
  assert.equal(resumen.alergias[0].reaccion.fr, "Gonflement de la face");
  assert.equal(resumen.telefono, "+34 600 000 000");
  assert.equal(resumen.rabiaHasta, "2027-03-14");

  // Sin placa, o sin el sexo del animal, no hay nada que publicar.
  assert.equal(sobrePlaca(ficha, "Kira", azar(24), HOY), null);
  assert.equal(sobrePlaca({ ...ficha, sexo: null, placa }, "Kira", azar(24), HOY), null);
});

test("el historial lleva la ficha, lo del pasaporte y las notas, y lo abre la web del veterinario", () => {
  const secreta = azar(32);
  const publica = wasm.publica(secreta);

  const pasaporte = pasaporteDueno.parse({
    version: 1,
    declarados: [
      {
        id: "d1",
        registro: {
          version: 1,
          tipo: "vacuna",
          fecha: "2026-03-14",
          enfermedad: "rabia",
          producto: "Rabisin",
          lote: "L2231",
          validaHasta: "2027-03-14",
        },
      },
    ],
  });
  const sobrePasaporte = aBase64(
    wasm.cerrar(clavePasaporte(wasm, secreta), ad.pasaporte(PET), enc.encode(JSON.stringify(pasaporte))),
  );
  const delPasaporte = registrosDePasaporte(secreta, PET, sobrePasaporte);
  assert.equal(delPasaporte.length, 1);
  assert.equal(delPasaporte[0].procedencia, "dueno");
  assert.deepEqual(delPasaporte[0].vacuna, { lote: "L2231", validezMeses: 12 });
  // Un pasaporte que no abre no rompe nada: simplemente no aporta registros.
  assert.deepEqual(registrosDePasaporte(azar(32), PET, sobrePasaporte), []);
  assert.deepEqual(registrosDePasaporte(secreta, PET, null), []);

  const sellar = (j: object) => aBase64(wasm.sellar(publica, enc.encode(JSON.stringify(j))));
  const mensaje = (id: string, petId: string, j: object, origen: null | object = null) =>
    ({ id, petId, sellado: sellar(j), llegada: "2026-09-30T10:00:00.000Z", adjuntos: [], origen }) as never;
  const notas = notasDeBandeja(secreta, PET, [
    mensaje("n1", PET, { tipo: "nota", version: 1, clinica: "Clínica del Puerto", motivo: "Cojera", diagnostico: "Esguince" }),
    mensaje("n2", "otra-mascota", { tipo: "nota", version: 1, motivo: "No es suya" }),
    mensaje("n3", PET, { tipo: "aviso", version: 1, motivo: "La he encontrado" }),
    mensaje("n4", PET, { tipo: "nota", version: 1, motivo: "Con clave de API" }, { clinica: "X", pais: "ES", dominio: null, firma: null }),
  ]);
  assert.deepEqual(notas.map((n) => n.id), ["n1"]);
  assert.equal(notas[0].procedencia, "veterinario");
  assert.equal(notas[0].fecha, "2026-09-30");
  assert.equal(notas[0].texto, "Motivo: Cojera\nDiagnóstico: Esguince");

  const id = "9b1f0c1e-4b7a-4d55-9d0e-2f7c7b3a1a10";
  const h = sobreHistorial(
    "https://barkandmeow.app",
    ficha,
    { nombre: "Kira", telefono: "", hoy: HOY },
    [...delPasaporte, ...notas],
    { id, clave: azar(32), nonce: azar(24) },
  );
  assert.equal(h.registros, 2);
  assert.ok(h.url.startsWith(`https://barkandmeow.app/s/${id}#`));
  const k = claveDeFragmento(h.url.split("#")[1])!;
  const abierto = JSON.parse(dec.decode(wasm.abrir(k, ad.historial(id), deBase64(h.sobre)!)));
  assert.equal(abierto.resumen.animal.nombre, "Kira");
  assert.deepEqual(abierto.peso, { kg: "12,4", fecha: "2026-10-01" });
  // Lo más reciente, primero.
  assert.deepEqual(
    abierto.registros.map((r: { id: string }) => r.id),
    ["n1", "d1"],
  );
});
