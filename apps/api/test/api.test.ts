import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { crearCliente } from "@barkandmeow/db";
import { crearApp } from "../src/index.js";
import { cerrarDb, indexar } from "../src/core.js";

const URL_DB =
  process.env.DATABASE_URL ?? "postgres://barkandmeow:barkandmeow_dev@127.0.0.1:5443/barkandmeow";

const b64 = (n = 32) => randomBytes(n).toString("base64");
const CHIP = "724098100001234";
const CHIP_INEXISTENTE = "724098100009999";

let app: Awaited<ReturnType<typeof crearApp>>;
let sql: ReturnType<typeof crearCliente>;
let cookie = "";
let petId = "";
let ownerPubKey = Buffer.alloc(0);

before(async () => {
  sql = crearCliente(URL_DB);
  await sql`TRUNCATE pets, clinics, access_log RESTART IDENTITY CASCADE`;

  ownerPubKey = randomBytes(32);
  const [pet] = await sql`
    INSERT INTO pets (owner_pub_key) VALUES (${ownerPubKey}) RETURNING id`;
  petId = pet.id;
  const [idx] = await indexar([CHIP]);
  await sql`
    INSERT INTO pet_identifiers (pet_id, kind, id_index)
    VALUES (${petId}, 'iso', ${idx})`;

  app = await crearApp();
  await app.ready();
});

after(async () => {
  await app.close();
  await sql.end();
  await cerrarDb();
});

describe("alta de la clínica y equipo", () => {
  it("registra la clínica y abre sesión", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/clinics/v1/register",
      payload: {
        nombre: "Clínica de prueba",
        pais: "PT",
        dominio: "prueba.example",
        pubKey: b64(),
        admin: {
          nombre: "Admin de prueba",
          email: "admin@prueba.example",
          password: "una-clave-bastante-larga",
          devicePubKey: b64(),
        },
      },
    });
    assert.equal(r.statusCode, 201);
    const body = r.json();
    assert.match(body.dnsTxt, /^barkandmeow-verify=/);
    assert.equal(body.domainVerified, false);
    cookie = r.cookies[0].name + "=" + r.cookies[0].value;
  });

  it("no queda verificada hasta comprobar el DNS", async () => {
    const r = await app.inject({ method: "GET", url: "/clinics/v1/me", headers: { cookie } });
    assert.equal(r.statusCode, 200);
    assert.equal(r.json().clinica.verificada, false);
  });

  it("un auxiliar no puede invitar", async () => {
    const inv = await app.inject({
      method: "POST",
      url: "/clinics/v1/members",
      headers: { cookie },
      payload: { nombre: "Aux", email: "aux@prueba.example", rol: "assistant" },
    });
    assert.equal(inv.statusCode, 201);
    const token = inv.json().inviteToken;

    const acc = await app.inject({
      method: "POST",
      url: "/clinics/v1/members/accept",
      payload: { token, password: "otra-clave-bastante-larga", devicePubKey: b64() },
    });
    assert.equal(acc.statusCode, 200);
    const cookieAux = acc.cookies[0].name + "=" + acc.cookies[0].value;

    const intento = await app.inject({
      method: "POST",
      url: "/clinics/v1/members",
      headers: { cookie: cookieAux },
      payload: { nombre: "X", email: "x@prueba.example", rol: "vet" },
    });
    assert.equal(intento.statusCode, 403);
  });

  it("sin sesión no se ve nada", async () => {
    const r = await app.inject({ method: "GET", url: "/clinics/v1/members" });
    assert.equal(r.statusCode, 401);
  });
});

describe("nivel 0 y número de comparación", () => {
  let requestId = "";
  let sas = "";
  const vetPubKey = randomBytes(32);

  it("encuentra la ficha y devuelve seis dígitos", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/chip/v1/lookup",
      headers: { cookie },
      payload: {
        identificador: { tipo: "iso", valor: CHIP },
        vetPubKey: vetPubKey.toString("base64"),
      },
    });
    assert.equal(r.statusCode, 200);
    const b = r.json();
    assert.equal(b.existe, true);
    assert.equal(b.origen.iso2, "ES");
    assert.match(b.sas, /^\d{6}$/);
    requestId = b.requestId;
    sas = b.sas;
  });

  it("la respuesta pesa lo mismo exista o no la ficha", async () => {
    const pide = (valor: string) =>
      app.inject({
        method: "POST",
        url: "/chip/v1/lookup",
        headers: { cookie },
        payload: {
          identificador: { tipo: "iso", valor },
          vetPubKey: vetPubKey.toString("base64"),
        },
      });

    const [si, no] = await Promise.all([pide(CHIP), pide(CHIP_INEXISTENTE)]);
    assert.equal(si.json().existe, true);
    assert.equal(no.json().existe, false);
    assert.equal(
      Buffer.byteLength(si.body),
      Buffer.byteLength(no.body),
      "el tamaño de la respuesta delata si el chip existe",
    );
  });

  it("sin ficha devuelve señuelos, no nulos", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/chip/v1/lookup",
      headers: { cookie },
      payload: {
        identificador: { tipo: "iso", valor: CHIP_INEXISTENTE },
        vetPubKey: vetPubKey.toString("base64"),
      },
    });
    const b = r.json();
    assert.equal(b.existe, false);
    assert.match(b.sas, /^\d{6}$/);
    assert.match(b.requestId, /^[0-9a-f-]{36}$/);

    // El señuelo no existe en la base: consultarlo da 404.
    const est = await app.inject({
      method: "GET",
      url: `/grants/v1/request/${b.requestId}`,
      headers: { cookie },
    });
    assert.equal(est.statusCode, 404);
  });

  it("el número lo derivan las dos partes por igual", async () => {
    const { numeroComparacion } = await import("../src/core.js");
    assert.equal(numeroComparacion(vetPubKey, ownerPubKey, requestId), sas);
  });

  it("un intermediario con otra clave produce otro número", async () => {
    const { numeroComparacion } = await import("../src/core.js");
    const atacante = randomBytes(32);
    assert.notEqual(numeroComparacion(atacante, ownerPubKey, requestId), sas);
  });

  it("el dueño aprueba y nace el permiso de nivel 3", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/grants/v1/approve",
      payload: { requestId, wrappedKey: b64(48) },
    });
    assert.equal(r.statusCode, 201);
    assert.equal(r.json().level, 3);

    const mios = await app.inject({
      method: "GET",
      url: "/grants/v1/mine",
      headers: { cookie },
    });
    assert.equal(mios.json().total, 1);
  });

  it("aprobar dos veces la misma petición no cuela", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/grants/v1/approve",
      payload: { requestId, wrappedKey: b64(48) },
    });
    assert.equal(r.statusCode, 410);
  });

  it("revocar avisa de que lo descargado no vuelve", async () => {
    const mios = await app.inject({
      method: "GET",
      url: "/grants/v1/mine",
      headers: { cookie },
    });
    const grantId = mios.json().permisos[0].id;

    const r = await app.inject({
      method: "POST",
      url: "/grants/v1/revoke",
      payload: { grantId },
    });
    assert.equal(r.statusCode, 200);
    assert.equal(r.json().descargadoNoVuelve, true);

    const despues = await app.inject({
      method: "GET",
      url: "/grants/v1/mine",
      headers: { cookie },
    });
    assert.equal(despues.json().total, 0);
  });
});

describe("borradores sin dueño", () => {
  it("se crean cifrados y caducan a 90 días", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/clinics/v1/drafts",
      headers: { cookie },
      payload: { especie: "bird", identificadores: [], sealed: b64(64) },
    });
    assert.equal(r.statusCode, 201);
    const dias = Math.round(
      (new Date(r.json().caduca).getTime() - Date.now()) / 864e5,
    );
    assert.equal(dias, 90);
  });

  it("un borrador no responde a búsquedas de nivel 0", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/chip/v1/lookup",
      headers: { cookie },
      payload: { identificador: { tipo: "iso", valor: CHIP_INEXISTENTE } },
    });
    assert.equal(r.json().existe, false);
  });
});

describe("el servidor no puede leer", () => {
  it("apps/api no depende de packages/crypto", async () => {
    const pkg = await import("../package.json", { with: { type: "json" } });
    const deps = Object.keys(pkg.default.dependencies ?? {});
    assert.ok(
      !deps.some((d) => d.includes("crypto")),
      "api no puede depender de crypto: el servidor no descifra",
    );
  });

  it("la clave envuelta se guarda tal cual, sin abrirla", async () => {
    const filas = await sql`SELECT wrapped_key FROM grants LIMIT 1`;
    assert.ok(Buffer.isBuffer(filas[0].wrapped_key));
    assert.ok(filas[0].wrapped_key.length > 0);
  });

  it("no hay nombres ni diagnósticos en claro en las tablas", async () => {
    const cols = await sql<{ column_name: string }[]>`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('pets','blobs','inbox','drafts','pet_identifiers')`;
    const prohibidas = ["name", "diagnosis", "chip", "owner_name"];
    const malas = cols.filter((c) => prohibidas.includes(c.column_name));
    assert.deepEqual(malas, []);
  });
});
