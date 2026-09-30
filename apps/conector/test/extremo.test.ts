/* De extremo a extremo contra una API de Bark & Meow falsa (HTTP de verdad).

   El servidor falso hace lo que hace el de verdad con una clave de API:
   exige Bearer bmk_, responde 404 a los chips sin nivel 3 y guarda lo sellado
   sin abrirlo. El test hace de dueño: abre el sellado con su secreta y
   comprueba que la firma es de la clave de la conexión. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { aBase64, firmaValida } from "@barkandmeow/crypto";
import { informeBody, registroClinico, sobreFirmado } from "@barkandmeow/schema";
import { comprobarAlojado } from "../src/alojado.ts";
import { cargarCriptoLocal, crearClienteBM } from "../src/barkandmeow.ts";
import { leerEstado } from "../src/estado.ts";
import { sincronizar, type Fuente, type Lectura } from "../src/sincronizar.ts";
import type { Hallazgo } from "../src/registros.ts";

const cripto = await cargarCriptoLocal();
const CLAVE = "bmk_" + "A".repeat(43);
const semilla = crypto.getRandomValues(new Uint8Array(32));
const FIRMA = "bmf_" + aBase64(semilla);
const secretaDueno = crypto.getRandomValues(new Uint8Array(32));
const CHIP_CON_PERMISO = "724098060143113";
const CHIP_SIN_PERMISO = "941000024680135";
const PET = "0b8d7d4e-3c1a-4f57-9e9a-2f1d7a6b5c4d";

type Recibido = { petId: string; sellado: string };

async function apiFalsa(o: { fallarEnvio?: () => boolean } = {}) {
  const recibidos: Recibido[] = [];
  const busquedas: string[] = [];
  const srv = createServer(async (req, res) => {
    let cuerpo = "";
    for await (const c of req) cuerpo += c;
    const responder = (estado: number, j: unknown) => {
      res.writeHead(estado, { "content-type": "application/json" });
      res.end(JSON.stringify(j));
    };
    if (req.headers.authorization !== `Bearer ${CLAVE}`) return responder(401, { error: "clave de API no válida o retirada" });
    if (req.method === "GET" && req.url === "/clinics/v1/api/me")
      return responder(200, { clave: "Conector", clinica: { nombre: "Clínica Demo", dominio: "demo.es", verificada: true } });
    if (req.method === "POST" && req.url === "/clinics/v1/api/patients/search") {
      const { identificador } = JSON.parse(cuerpo);
      busquedas.push(identificador.valor);
      if (identificador.valor !== CHIP_CON_PERMISO) return responder(404, { error: "sin permiso de nivel 3 para ese chip" });
      return responder(200, { petId: PET, ownerPubKey: aBase64(cripto.publica(secretaDueno)), chipPista: "3113" });
    }
    if (req.method === "POST" && req.url === "/clinics/v1/reports") {
      if (o.fallarEnvio?.()) return responder(503, { error: "mantenimiento" });
      const b = informeBody.safeParse(JSON.parse(cuerpo));
      if (!b.success) return responder(400, { error: "cuerpo inválido" });
      recibidos.push(b.data);
      return responder(201, { envioId: `e${recibidos.length}`, fecha: new Date().toISOString(), adjuntos: b.data.adjuntos.length });
    }
    responder(404, { error: "no encontrada" });
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  return { url, recibidos, busquedas, cerrar: () => new Promise((r) => srv.close(r)) };
}

class FuenteFija implements Fuente {
  readonly nombre = "fija";
  confirmada = 0;
  constructor(private hallazgos: Hallazgo[]) {}
  async leer(cursor: unknown): Promise<Lectura> {
    return { hallazgos: this.hallazgos, cursor: ((cursor as number) ?? 0) + 1, confirmar: () => void this.confirmada++ };
  }
}

const vacuna: Hallazgo = {
  ref: "prueba:1",
  registro: {
    version: 1, tipo: "vacuna", chip: CHIP_CON_PERMISO, fecha: "2026-09-29", veterinario: "Dra. Demo",
    enfermedad: "rabia", producto: "Rabisin", lote: "L2231", validaHasta: "2029-09-29",
  },
};
const informe: Hallazgo = {
  ref: "prueba:2",
  registro: { version: 1, tipo: "informe", chip: CHIP_CON_PERMISO, fecha: "2026-09-28", motivo: "Otitis",
    diagnostico: "d".repeat(4000), tratamiento: "t".repeat(4000), observaciones: "x".repeat(8000) },
};
const ajeno: Hallazgo = { ref: "prueba:3", registro: { ...vacuna.registro, chip: CHIP_SIN_PERMISO } };
const roto: Hallazgo = { ref: "prueba:4", registro: { ...vacuna.registro, validaHasta: "mañana" } as Hallazgo["registro"] };

const silencio = () => {};

test("firma, sella y envía; el dueño lo abre y la firma es de la conexión", async () => {
  const api = await apiFalsa();
  const rutaEstado = join(mkdtempSync(join(tmpdir(), "conector-")), "estado.json");
  const bm = crearClienteBM({ url: api.url, clave: CLAVE, firma: FIRMA, cripto });
  const fuente = new FuenteFija([vacuna, informe, ajeno, roto]);
  try {
    const [r] = await sincronizar({ fuentes: [fuente], bm, estado: leerEstado(rutaEstado), rutaEstado, clinica: "Clínica Demo", log: silencio });
    assert.deepEqual({ ...r, fallo: r.fallo }, { fuente: "fija", leidos: 4, enviados: 2, repetidos: 0, sinPermiso: 1, invalidos: 1, fallo: null });
    assert.equal(api.recibidos.length, 2);
    assert.ok(api.recibidos.every((x) => x.petId === PET));

    // Lado del dueño: abre con su secreta; nadie más puede.
    const abiertos = api.recibidos.map((x) => {
      const claro = cripto.abrirSellado(secretaDueno, Buffer.from(x.sellado, "base64"));
      return sobreFirmado.parse(JSON.parse(new TextDecoder().decode(claro)));
    });
    for (const s of abiertos) {
      assert.ok(firmaValida(cripto, s));
      assert.equal(s.clave, aBase64(cripto.publicaFirma(semilla)));
    }
    const reg0 = registroClinico.parse(JSON.parse(abiertos[0].registro));
    assert.equal(reg0.tipo, "vacuna");
    assert.equal(reg0.clinica, "Clínica Demo", "la clínica sale de /api/me si la fuente no la trae");
    // El informe demasiado largo se recorta para caber en 16 KiB.
    const reg1 = registroClinico.parse(JSON.parse(abiertos[1].registro));
    assert.ok(abiertos[1].registro.length <= 16 * 1024);
    assert.ok(reg1.tipo === "informe" && reg1.observaciones.endsWith("…"));
    // Una firma manipulada no vale.
    assert.equal(firmaValida(cripto, { ...abiertos[0], registro: abiertos[0].registro.replace("L2231", "L9999") }), false);

    // El estado no guarda contenido: huellas y cursor.
    const estado = JSON.parse(readFileSync(rutaEstado, "utf8"));
    assert.equal(Object.keys(estado.enviados).length, 2);
    assert.equal(estado.cursores.fija, 1);
    assert.ok(!readFileSync(rutaEstado, "utf8").includes("Rabisin"));
    assert.equal(fuente.confirmada, 1);

    // Segunda vuelta con lo mismo: nada se repite.
    const [r2] = await sincronizar({ fuentes: [fuente], bm, estado: leerEstado(rutaEstado), rutaEstado, clinica: "Clínica Demo", log: silencio });
    assert.equal(r2.enviados, 0);
    assert.equal(r2.repetidos, 2);
    assert.equal(api.recibidos.length, 2);
  } finally {
    await api.cerrar();
  }
});

test("si la API falla, el cursor no avanza y lo enviado no se repite", async () => {
  let envios = 0;
  const api = await apiFalsa({ fallarEnvio: () => ++envios === 2 });
  const rutaEstado = join(mkdtempSync(join(tmpdir(), "conector-")), "estado.json");
  const bm = crearClienteBM({ url: api.url, clave: CLAVE, firma: FIRMA, cripto });
  const fuente = new FuenteFija([vacuna, informe]);
  try {
    const [r] = await sincronizar({ fuentes: [fuente], bm, estado: leerEstado(rutaEstado), rutaEstado, clinica: "X", log: silencio });
    assert.match(r.fallo ?? "", /503/);
    assert.equal(r.enviados, 1);
    assert.equal(leerEstado(rutaEstado).cursores.fija, undefined);
    assert.equal(fuente.confirmada, 0);

    const [r2] = await sincronizar({ fuentes: [fuente], bm, estado: leerEstado(rutaEstado), rutaEstado, clinica: "X", log: silencio });
    assert.equal(r2.fallo, null);
    assert.equal(r2.repetidos, 1);
    assert.equal(r2.enviados, 1);
    assert.equal(api.recibidos.length, 2);
    assert.equal(leerEstado(rutaEstado).cursores.fija, 1);
  } finally {
    await api.cerrar();
  }
});

test("claves mal formadas no arrancan", () => {
  assert.throws(() => crearClienteBM({ url: "http://x", clave: "otra", firma: FIRMA, cripto }), /bmk_/);
  assert.throws(() => crearClienteBM({ url: "http://x", clave: CLAVE, firma: "bmf_corta", cripto }), /bmf_/);
});

test("MODO_ALOJADO: apagado por defecto; pedido sin consentimiento, no arranca", () => {
  assert.deepEqual(comprobarAlojado({}), { alojado: false });
  assert.deepEqual(comprobarAlojado({ MODO_ALOJADO: "no" }), { alojado: false });
  assert.throws(() => comprobarAlojado({ MODO_ALOJADO: "si" }), /rompe el cifrado de extremo a extremo/);
  assert.throws(
    () => comprobarAlojado({ MODO_ALOJADO: "si", MODO_ALOJADO_ROMPE_E2E: "entendido", CONSENTIMIENTO_ALOJADO: "/no/existe.pdf" }),
    /CONSENTIMIENTO_ALOJADO/,
  );
  const doc = join(mkdtempSync(join(tmpdir(), "consentimiento-")), "firmado.pdf");
  writeFileSync(doc, "%PDF-1.4");
  assert.deepEqual(comprobarAlojado({ MODO_ALOJADO: "si", MODO_ALOJADO_ROMPE_E2E: "entendido", CONSENTIMIENTO_ALOJADO: doc }), {
    alojado: true,
    consentimiento: doc,
  });
});
