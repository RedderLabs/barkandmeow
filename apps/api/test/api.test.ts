import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { crearCliente } from "@barkandmeow/db";
import { crearApp } from "../src/index.js";
import { cerrarDb, indexar, usarCartero, type Carta } from "../src/core.js";
import { almacenEnMemoria, usarAlmacen } from "../src/almacen.js";
import { resolverReclamaciones } from "../src/routes/mascotas.js";

/* Correo sin red: el cartero de los tests guarda las cartas en memoria. */
// Los tests del portal hacen más peticiones por minuto que un dueño real.
process.env.LIMITE_DUENOS = "1000";
const buzon: Carta[] = [];
usarCartero(async (c) => {
  buzon.push(c);
});
/* Almacén de objetos sin red: los tests no suben nada al bucket de B2. */
const almacen = almacenEnMemoria();
usarAlmacen(almacen);
const tokenInvitacion = (para: string) => {
  const carta = [...buzon].reverse().find((c) => c.para === para);
  return decodeURIComponent(carta?.texto.match(/\/aceptar\?t=(\S+)/)?.[1] ?? "");
};
const ultimoCodigo = (para: string) => {
  const carta = [...buzon].reverse().find((c) => c.para === para);
  return carta?.texto.match(/\b([2-9A-Z]{4}-[2-9A-Z]{4})\b/)?.[1] ?? "";
};

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
  await sql`TRUNCATE pets, clinics, owners, access_log RESTART IDENTITY CASCADE`;

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
    // El dominio sale del correo; no se pregunta.
    assert.equal(body.dominio, "prueba.example");
    assert.equal(body.correoVerificado, false);
    assert.match(ultimoCodigo("admin@prueba.example"), /^[2-9A-Z]{4}-[2-9A-Z]{4}$/);
    cookie = r.cookies[0].name + "=" + r.cookies[0].value;
  });

  it("sin verificar el correo, la clínica no puede invitar ni pedir accesos", async () => {
    const me = await app.inject({ method: "GET", url: "/clinics/v1/me", headers: { cookie } });
    assert.equal(me.json().correoVerificado, false);
    assert.equal(me.json().clinica.verificada, false);
    assert.equal(me.json().clinica.dominio, null);

    const inv = await app.inject({
      method: "POST",
      url: "/clinics/v1/members",
      headers: { cookie },
      payload: { nombre: "Aux", email: "aux@prueba.example", rol: "assistant" },
    });
    assert.equal(inv.statusCode, 403);
    assert.equal(inv.json().motivo, "correo-sin-verificar");
  });

  it("un código incorrecto no verifica y cuenta el intento", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/clinics/v1/email/verify",
      headers: { cookie },
      payload: { codigo: "AAAA-AAAA" },
    });
    assert.equal(r.statusCode, 400);
    assert.equal(r.json().intentosRestantes, 4);
  });

  it("no se puede pedir otro código antes de un minuto", async () => {
    const r = await app.inject({ method: "POST", url: "/clinics/v1/email/resend", headers: { cookie } });
    assert.equal(r.statusCode, 429);
    assert.ok(r.json().segundos > 0);
  });

  it("el código del correo verifica el correo y, con dominio propio, la clínica", async () => {
    const codigo = ultimoCodigo("admin@prueba.example").toLowerCase();
    const r = await app.inject({
      method: "POST",
      url: "/clinics/v1/email/verify",
      headers: { cookie },
      payload: { codigo },
    });
    assert.equal(r.statusCode, 200);
    assert.deepEqual(r.json(), { verificado: true, dominio: "prueba.example", clinicaVerificada: true });

    const me = await app.inject({ method: "GET", url: "/clinics/v1/me", headers: { cookie } });
    assert.equal(me.json().correoVerificado, true);
    assert.equal(me.json().clinica.dominio, "prueba.example");
  });

  it("con correo gratuito se verifica el correo, pero no la clínica", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/clinics/v1/register",
      payload: {
        nombre: "Clínica con Gmail",
        pais: "ES",
        pubKey: b64(),
        admin: {
          nombre: "Otra admin",
          email: "clinica.de.prueba@gmail.com",
          password: "una-clave-bastante-larga",
          devicePubKey: b64(),
        },
      },
    });
    assert.equal(r.json().dominio, null);
    const c2 = r.cookies[0].name + "=" + r.cookies[0].value;
    const v = await app.inject({
      method: "POST",
      url: "/clinics/v1/email/verify",
      headers: { cookie: c2 },
      payload: { codigo: ultimoCodigo("clinica.de.prueba@gmail.com") },
    });
    assert.deepEqual(v.json(), { verificado: true, dominio: null, clinicaVerificada: false });
  });

  it("un registro sin verificar no reserva el dominio de otra clínica", async () => {
    const registrar = (email: string) =>
      app.inject({
        method: "POST",
        url: "/clinics/v1/register",
        payload: {
          nombre: "Sede",
          pais: "ES",
          pubKey: b64(),
          admin: { nombre: "Admin", email, password: "una-clave-bastante-larga", devicePubKey: b64() },
        },
      });
    // Alguien se registra con un correo de vet-real.example y nunca lo confirma.
    assert.equal((await registrar("impostor@vet-real.example")).statusCode, 201);
    // La clínica de verdad puede registrarse y verificarse igualmente.
    const real = await registrar("admin@vet-real.example");
    assert.equal(real.statusCode, 201);
    const v = await app.inject({
      method: "POST",
      url: "/clinics/v1/email/verify",
      headers: { cookie: real.cookies[0].name + "=" + real.cookies[0].value },
      payload: { codigo: ultimoCodigo("admin@vet-real.example") },
    });
    assert.equal(v.json().clinicaVerificada, true);
  });

  it("cinco fallos bloquean el código", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/clinics/v1/register",
      payload: {
        nombre: "Clínica que se equivoca",
        pais: "PT",
        pubKey: b64(),
        admin: { nombre: "Admin", email: "admin@equivoca.example", password: "una-clave-bastante-larga", devicePubKey: b64() },
      },
    });
    const c3 = r.cookies[0].name + "=" + r.cookies[0].value;
    const probar = (codigo: string) =>
      app.inject({ method: "POST", url: "/clinics/v1/email/verify", headers: { cookie: c3 }, payload: { codigo } });
    for (let i = 0; i < 5; i++) assert.equal((await probar("ZZZZZZZZ")).statusCode, 400);
    // Ni el código bueno entra ya: hay que pedir otro.
    assert.equal((await probar(ultimoCodigo("admin@equivoca.example"))).statusCode, 429);
  });

  it("un auxiliar no puede invitar", async () => {
    const inv = await app.inject({
      method: "POST",
      url: "/clinics/v1/members",
      headers: { cookie },
      payload: { nombre: "Aux", email: "aux@prueba.example", rol: "assistant" },
    });
    assert.equal(inv.statusCode, 201);
    // El token no vuelve al administrador: viaja en el enlace del correo.
    assert.equal(inv.json().inviteToken, undefined);
    const token = tokenInvitacion("aux@prueba.example");

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

  it("un segundo administrador recibe la clave sellada para su dispositivo", async () => {
    const inv = await app.inject({
      method: "POST",
      url: "/clinics/v1/members",
      headers: { cookie },
      payload: { nombre: "Segunda admin", email: "admin2@prueba.example", rol: "admin" },
    });
    assert.equal(inv.statusCode, 201);
    const memberId = inv.json().memberId;

    // Antes de aceptar no se le puede entregar nada.
    const pronto = await app.inject({
      method: "POST",
      url: `/clinics/v1/members/${memberId}/clinic-key`,
      headers: { cookie },
      payload: { wrappedClinicKey: b64(80) },
    });
    assert.equal(pronto.json().motivo, "sin-aceptar");

    const dispositivo = randomBytes(32);
    const acc = await app.inject({
      method: "POST",
      url: "/clinics/v1/members/accept",
      payload: {
        token: tokenInvitacion("admin2@prueba.example"),
        password: "otra-clave-bastante-larga",
        devicePubKey: dispositivo.toString("base64"),
      },
    });
    assert.equal(acc.statusCode, 200);
    const cookie2 = acc.cookies[0].name + "=" + acc.cookies[0].value;

    const lista = (await app.inject({ method: "GET", url: "/clinics/v1/members", headers: { cookie } })).json().miembros;
    const ella = lista.find((m: { id: string }) => m.id === memberId);
    assert.equal(ella.custodia, "pendiente");
    assert.deepEqual(Buffer.from(ella.devicePubKey, "base64"), dispositivo);
    assert.equal(lista.find((m: { yo: boolean }) => m.yo).custodia, "codigo");

    const sellada = randomBytes(80);
    const entrega = await app.inject({
      method: "POST",
      url: `/clinics/v1/members/${memberId}/clinic-key`,
      headers: { cookie },
      payload: { wrappedClinicKey: sellada.toString("base64") },
    });
    assert.equal(entrega.statusCode, 200);

    const me2 = await app.inject({ method: "GET", url: "/clinics/v1/me", headers: { cookie: cookie2 } });
    assert.deepEqual(Buffer.from(me2.json().claveEnvuelta, "base64"), sellada);
    // Aceptar la invitación del correo confirma su correo.
    assert.equal(me2.json().correoVerificado, true);
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

  /* Dueño con sesión abierta; devuelve la cookie y el id del dueño. */
  const abrirDueno = async (email: string, chip: string) => {
    const r = await app.inject({
      method: "POST",
      url: "/owners/v1/register",
      payload: { email, password: "clave-del-dueno-larga", pubKey: b64(), mascota: { identificador: { tipo: "iso", valor: chip }, nombre: "" } },
    });
    assert.equal(r.statusCode, 201);
    const pendiente = r.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const v = await app.inject({
      method: "POST",
      url: "/owners/v1/login/verify",
      headers: { cookie: pendiente },
      payload: { codigo: ultimoCodigo(email) },
    });
    assert.equal(v.statusCode, 200);
    const [p] = await sql`SELECT owner_id FROM pets WHERE id = ${r.json().mascota.petId}`;
    return { cookie: v.cookies.map((c) => `${c.name}=${c.value}`).join("; "), ownerId: p.owner_id as string };
  };
  let cookieDueno = "";
  let cookieAjeno = "";

  it("sin sesión de dueño nadie aprueba, tampoco la clínica que pidió", async () => {
    const dueno = await abrirDueno("dueno-permisos@correo.example", "724098100007001");
    await sql`UPDATE pets SET owner_id = ${dueno.ownerId} WHERE id = ${petId}`;
    cookieDueno = dueno.cookie;
    cookieAjeno = (await abrirDueno("ajeno-permisos@correo.example", "724098100007002")).cookie;

    const anonimo = await app.inject({
      method: "POST",
      url: "/grants/v1/approve",
      payload: { requestId, wrappedKey: b64(48) },
    });
    assert.equal(anonimo.statusCode, 401);

    const clinica = await app.inject({
      method: "POST",
      url: "/grants/v1/approve",
      headers: { cookie },
      payload: { requestId, wrappedKey: b64(48) },
    });
    assert.equal(clinica.statusCode, 401);

    const ajeno = await app.inject({
      method: "POST",
      url: "/grants/v1/approve",
      headers: { cookie: cookieAjeno },
      payload: { requestId, wrappedKey: b64(48) },
    });
    assert.equal(ajeno.statusCode, 410);
  });

  it("el dueño aprueba y nace el permiso de nivel 3", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/grants/v1/approve",
      headers: { cookie: cookieDueno },
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
      headers: { cookie: cookieDueno },
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

    // Ni sin sesión, ni la clínica, ni otro dueño.
    const sinSesion = await app.inject({ method: "POST", url: "/grants/v1/revoke", payload: { grantId } });
    assert.equal(sinSesion.statusCode, 401);
    const clinica = await app.inject({ method: "POST", url: "/grants/v1/revoke", headers: { cookie }, payload: { grantId } });
    assert.equal(clinica.statusCode, 401);
    const ajeno = await app.inject({
      method: "POST",
      url: "/grants/v1/revoke",
      headers: { cookie: cookieAjeno },
      payload: { grantId },
    });
    assert.equal(ajeno.statusCode, 404);

    const r = await app.inject({
      method: "POST",
      url: "/grants/v1/revoke",
      headers: { cookie: cookieDueno },
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
    // Los tests siguientes esperan la ficha de prueba sin dueño en el portal.
    await sql`UPDATE pets SET owner_id = NULL WHERE id = ${petId}`;
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

describe("web del veterinario: placa, copia temporal, notas y avisos", () => {
  const uuidAlAzar = "5d0c9a7e-2f1b-4c3a-9e8d-7b6a5f4e3d2c";
  let placaId = "";
  let copiaId = "";
  let caducadaId = "";
  let docId = "";
  let fotoId = "";

  before(async () => {
    const hora = 60 * 60 * 1000;
    [{ id: placaId }] = await sql`
      INSERT INTO blobs (pet_id, kind, sealed, version)
      VALUES (${petId}, 'emergency', ${randomBytes(120)}, 3) RETURNING id`;
    [{ id: copiaId }] = await sql`
      INSERT INTO blobs (pet_id, kind, sealed, expires_at)
      VALUES (${petId}, 'share', ${randomBytes(400)}, ${new Date(Date.now() + 72 * hora)}) RETURNING id`;
    [{ id: caducadaId }] = await sql`
      INSERT INTO blobs (pet_id, kind, sealed, expires_at)
      VALUES (${petId}, 'share', ${randomBytes(400)}, ${new Date(Date.now() - hora)}) RETURNING id`;
    [{ id: docId }] = await sql`
      INSERT INTO blobs (pet_id, kind, sealed, expires_at)
      VALUES (${petId}, 'document', ${randomBytes(900)}, ${new Date(Date.now() + 72 * hora)}) RETURNING id`;
    [{ foto_id: fotoId }] = await sql`
      INSERT INTO pet_profiles (pet_id, publicado, bio, telefonos, foto_id, foto, foto_tipo)
      VALUES (${petId}, false, 'Tímida con desconocidos.',
              ${sql.json([{ etiqueta: "Casa", numero: "+351 000 000 000" }])},
              gen_random_uuid(), ${randomBytes(64)}, 'image/jpeg')
      RETURNING foto_id`;
  });

  it("la placa entrega el sobre tal cual, sin el perfil si no está publicado", async () => {
    const r = await app.inject({ method: "GET", url: `/e/v1/${placaId}` });
    assert.equal(r.statusCode, 200);
    assert.equal(Buffer.from(r.json().sobre, "base64").length, 120);
    assert.equal(r.json().version, 3);
    assert.equal(r.json().perfil, null);
    assert.equal(r.headers["cache-control"], "no-store");
  });

  it("una placa que no existe, o un id que no es uuid, da 404", async () => {
    assert.equal((await app.inject({ method: "GET", url: `/e/v1/${uuidAlAzar}` })).statusCode, 404);
    assert.equal((await app.inject({ method: "GET", url: "/e/v1/../../etc" })).statusCode, 404);
  });

  it("la foto no se sirve hasta que el dueño publica el perfil", async () => {
    assert.equal((await app.inject({ method: "GET", url: `/perfil/v1/foto/${fotoId}` })).statusCode, 404);
    await sql`UPDATE pet_profiles SET publicado = true WHERE pet_id = ${petId}`;
    const f = await app.inject({ method: "GET", url: `/perfil/v1/foto/${fotoId}` });
    assert.equal(f.statusCode, 200);
    assert.equal(f.headers["content-type"], "image/jpeg");
  });

  it("publicado, el perfil sale en la placa y en el nivel 0", async () => {
    const e = await app.inject({ method: "GET", url: `/e/v1/${placaId}` });
    assert.equal(e.json().perfil.bio, "Tímida con desconocidos.");
    assert.equal(e.json().perfil.foto, `/perfil/v1/foto/${fotoId}`);

    const l = await app.inject({
      method: "POST",
      url: "/chip/v1/lookup",
      payload: { identificador: { tipo: "iso", valor: CHIP } },
    });
    assert.equal(l.json().perfil.telefonos[0].numero, "+351 000 000 000");
  });

  it("con perfil o sin ficha, el nivel 0 pesa lo mismo y trae aviso y clave", async () => {
    const pedir = (valor: string) =>
      app.inject({
        method: "POST",
        url: "/chip/v1/lookup",
        payload: { identificador: { tipo: "iso", valor } },
      });
    const [si, no] = await Promise.all([pedir(CHIP), pedir(CHIP_INEXISTENTE)]);
    // Lo que ve un observador de red son bytes, no caracteres.
    assert.equal(si.rawPayload.length, no.rawPayload.length);
    assert.equal(si.json().aviso.length, no.json().aviso.length);
    assert.equal(Buffer.from(no.json().ownerPubKey, "base64").length, 32);
    assert.equal(no.json().perfil, null);
  });

  it("el aviso responde igual con token real o señuelo, y solo guarda el real", async () => {
    const pedir = (valor: string) =>
      app.inject({
        method: "POST",
        url: "/chip/v1/lookup",
        payload: { identificador: { tipo: "iso", valor } },
      });
    const real = (await pedir(CHIP)).json().aviso;
    const senuelo = (await pedir(CHIP_INEXISTENTE)).json().aviso;
    const antes = (await sql`SELECT count(*)::int AS n FROM inbox WHERE pet_id = ${petId}`)[0].n;

    for (const aviso of [real, senuelo]) {
      const r = await app.inject({
        method: "POST",
        url: "/chip/v1/notify",
        payload: { aviso, sellado: b64(200) },
      });
      assert.equal(r.statusCode, 202);
      assert.deepEqual(r.json(), { recibido: true });
    }
    const despues = (await sql`SELECT count(*)::int AS n FROM inbox WHERE pet_id = ${petId}`)[0].n;
    assert.equal(despues, antes + 1);
  });

  it("la copia temporal viva entrega sobre, caducidad y la clave pública del dueño", async () => {
    const r = await app.inject({ method: "GET", url: `/s/v1/${copiaId}` });
    assert.equal(r.statusCode, 200);
    assert.deepEqual(Buffer.from(r.json().ownerPubKey, "base64"), ownerPubKey);
    assert.ok(new Date(r.json().caduca) > new Date());
  });

  it("caducada, la copia da 410 y no admite notas", async () => {
    assert.equal((await app.inject({ method: "GET", url: `/s/v1/${caducadaId}` })).statusCode, 410);
    const n = await app.inject({
      method: "POST",
      url: `/s/v1/${caducadaId}/nota`,
      payload: { sellado: b64(300) },
    });
    assert.equal(n.statusCode, 410);
  });

  it("la nota sellada se guarda en la bandeja del dueño sin abrirla", async () => {
    const sellado = randomBytes(300);
    const r = await app.inject({
      method: "POST",
      url: `/s/v1/${copiaId}/nota`,
      payload: { sellado: sellado.toString("base64") },
    });
    assert.equal(r.statusCode, 201);
    const [fila] = await sql`SELECT sealed FROM inbox ORDER BY created_at DESC LIMIT 1`;
    assert.deepEqual(fila.sealed, sellado);
  });

  it("el documento solo sale por una copia viva de la misma mascota", async () => {
    const ok = await app.inject({ method: "GET", url: `/s/v1/${copiaId}/doc/${docId}` });
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.rawPayload.length, 900);
    assert.equal((await app.inject({ method: "GET", url: `/s/v1/${caducadaId}/doc/${docId}` })).statusCode, 410);
    assert.equal((await app.inject({ method: "GET", url: `/s/v1/${copiaId}/doc/${uuidAlAzar}` })).statusCode, 404);
  });
});

describe("registro de chips: nadie se queda el chip de una mascota ajena", () => {
  const CHIP_NUEVO = "724098100007777";
  const id = { tipo: "iso", valor: CHIP_NUEVO };
  const clavePublica = randomBytes(32);
  let codigoDueno = "";
  let codigoImpostor = "";
  let petDueno = "";
  let petImpostor = "";

  const registrar = (ownerPubKey: Buffer) =>
    app.inject({ method: "POST", url: "/pets/v1/register", payload: { identificador: id, ownerPubKey: ownerPubKey.toString("base64") } });
  const consultar = () =>
    app.inject({ method: "POST", url: "/chip/v1/lookup", payload: { identificador: id } });
  const enClinica = (url: string, codigo: string) =>
    app.inject({ method: "POST", url, headers: { cookie }, payload: { identificador: id, codigo } });

  it("registrar el chip lo deja pendiente y no responde al nivel 0", async () => {
    const imp = await registrar(randomBytes(32));
    assert.equal(imp.statusCode, 201);
    assert.equal(imp.json().estado, "pendiente");
    codigoImpostor = imp.json().codigoActivacion;
    petImpostor = imp.json().petId;
    assert.equal((await consultar()).json().existe, false);
  });

  it("un pendiente no reserva el chip: el dueño real también puede registrarlo", async () => {
    const r = await registrar(clavePublica);
    assert.equal(r.statusCode, 201);
    codigoDueno = r.json().codigoActivacion;
    petDueno = r.json().petId;
  });

  it("sin el código del dueño, la clínica no activa nada", async () => {
    const r = await enClinica("/pets/v1/activate", "ZZZZ-ZZZZ");
    assert.equal(r.statusCode, 400);
    assert.equal(r.json().motivo, "codigo-incorrecto");
  });

  it("sin sesión de clínica no se activa", async () => {
    const r = await app.inject({ method: "POST", url: "/pets/v1/activate", payload: { identificador: id, codigo: codigoDueno } });
    assert.equal(r.statusCode, 401);
  });

  it("el impostor se adelanta y activa en una clínica (p. ej. con un chip leído de una factura)", async () => {
    const r = await enClinica("/pets/v1/activate", codigoImpostor);
    assert.equal(r.statusCode, 200);
    assert.equal((await consultar()).json().existe, true);
  });

  it("el dueño real ya no puede activar: el chip está activo", async () => {
    const r = await enClinica("/pets/v1/activate", codigoDueno);
    assert.equal(r.statusCode, 409);
    assert.equal(r.json().motivo, "ya-activo");
  });

  it("una clínica sin el dominio verificado no puede reclamar", async () => {
    const [c] = await sql`SELECT c.id, c.domain_verified_at FROM clinics c
      JOIN clinic_members m ON m.clinic_id = c.id WHERE m.email = 'admin@prueba.example'`;
    await sql`UPDATE clinics SET domain_verified_at = NULL WHERE id = ${c.id}`;
    const r = await enClinica("/pets/v1/claims", codigoDueno);
    await sql`UPDATE clinics SET domain_verified_at = ${c.domain_verified_at} WHERE id = ${c.id}`;
    assert.equal(r.statusCode, 403);
    assert.equal(r.json().motivo, "dominio-sin-verificar");
    const [p] = await sql`SELECT estado FROM pets WHERE id = ${petImpostor}`;
    assert.equal(p.estado, "activa");
  });

  it("con el animal en la clínica, el dueño abre una reclamación de 14 días", async () => {
    const r = await enClinica("/pets/v1/claims", codigoDueno);
    assert.equal(r.statusCode, 201);
    const dias = (new Date(r.json().plazo).getTime() - Date.now()) / 864e5;
    assert.ok(dias > 13.9 && dias <= 14);
    const [p] = await sql`SELECT estado FROM pets WHERE id = ${petImpostor}`;
    assert.equal(p.estado, "congelada");
    // Una segunda reclamación sobre el mismo chip no se acumula.
    assert.equal((await enClinica("/pets/v1/claims", codigoDueno)).json().motivo, "ya-reclamado");
  });

  it("antes del plazo no se resuelve nada", async () => {
    assert.equal(await resolverReclamaciones(), 0);
  });

  it("si el titular no tiene cuenta, no se entera: el plazo no traspasa el chip", async () => {
    await sql`UPDATE reclamaciones SET plazo = now() - interval '1 minute' WHERE reclamante_pet_id = ${petDueno}`;
    assert.equal(await resolverReclamaciones(), 0);
    const [imp] = await sql`SELECT estado FROM pets WHERE id = ${petImpostor}`;
    assert.equal(imp.estado, "congelada");
  });

  it("vencido el plazo sin impugnar un titular avisado, el chip pasa al dueño real", async () => {
    // El titular tiene cuenta en el portal, así que recibió el aviso.
    const cuenta = await app.inject({
      method: "POST",
      url: "/owners/v1/register",
      payload: {
        email: "impostor@correo.example",
        password: "clave-del-impostor-larga",
        pubKey: b64(),
        mascota: { identificador: { tipo: "iso", valor: "724098100007003" }, nombre: "" },
      },
    });
    const [o] = await sql`SELECT owner_id FROM pets WHERE id = ${cuenta.json().mascota.petId}`;
    await sql`UPDATE pets SET owner_id = ${o.owner_id} WHERE id = ${petImpostor}`;
    // Lo que el titular compartió no debe sobrevivir al traspaso.
    const [cl] = await sql`SELECT id FROM clinics LIMIT 1`;
    await sql`INSERT INTO grants (pet_id, clinic_id, level, wrapped_key)
      VALUES (${petImpostor}, ${cl.id}, 3, ${randomBytes(48)})`;
    const [copia] = await sql`INSERT INTO blobs (pet_id, kind, sealed, expires_at)
      VALUES (${petImpostor}, 'share', ${randomBytes(400)}, ${new Date(Date.now() + 864e5)}) RETURNING id`;

    assert.equal(await resolverReclamaciones(), 1);
    const vivos = await sql`SELECT id FROM grants WHERE pet_id = ${petImpostor} AND revoked_at IS NULL`;
    assert.equal(vivos.length, 0);
    assert.equal((await app.inject({ method: "GET", url: `/s/v1/${copia.id}` })).statusCode, 410);

    const l = await consultar();
    assert.equal(l.json().existe, true);
    assert.deepEqual(Buffer.from(l.json().ownerPubKey, "base64"), clavePublica);
    const [imp] = await sql`SELECT estado FROM pets WHERE id = ${petImpostor}`;
    assert.equal(imp.estado, "retirada");
  });
});

describe("portal del dueño", () => {
  const CHIP_LUNA = "724098100005555";
  const idLuna = { tipo: "iso", valor: CHIP_LUNA };
  const correo = "duena@correo.example";
  let cookieDueno = "";
  let petLuna = "";
  let codigoLuna = "";

  const galleta = (r: { cookies: { name: string; value: string }[] }) =>
    r.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const yo = (c = cookieDueno) => app.inject({ method: "GET", url: "/owners/v1/me", headers: { cookie: c } });

  it("el alta deja la mascota pendiente y no abre sesión sin el código del correo", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/owners/v1/register",
      payload: { email: correo, password: "clave-de-la-duena-larga", pubKey: b64(), mascota: { identificador: idLuna, nombre: "Luna" } },
    });
    assert.equal(r.statusCode, 201);
    assert.match(r.json().correo, /^du•+@correo\.example$/);
    codigoLuna = r.json().mascota.codigoActivacion;
    petLuna = r.json().mascota.petId;
    const pendiente = galleta(r);
    // Con la sesión a medias no se ve nada.
    assert.equal((await yo(pendiente)).statusCode, 401);

    const v = await app.inject({
      method: "POST",
      url: "/owners/v1/login/verify",
      headers: { cookie: pendiente },
      payload: { codigo: ultimoCodigo(correo) },
    });
    assert.equal(v.statusCode, 200);
    cookieDueno = galleta(v);
    const m = (await yo()).json().mascotas;
    assert.equal(m.length, 1);
    assert.equal(m[0].estado, "pendiente");
    assert.equal(m[0].perfil.nombre, "Luna");
    assert.equal(m[0].chipPista, "5555");
  });

  it("un correo ya usado no abre otra cuenta", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/owners/v1/register",
      payload: { email: correo, password: "otra-clave-muy-larga", pubKey: b64(), mascota: { identificador: idLuna, nombre: "" } },
    });
    assert.equal(r.statusCode, 409);
  });

  it("entrar exige chip, contraseña y el código del correo", async () => {
    const mal = await app.inject({
      method: "POST",
      url: "/owners/v1/login",
      payload: { identificador: idLuna, password: "no-es-esta-clave" },
    });
    assert.equal(mal.statusCode, 401);

    const bien = await app.inject({
      method: "POST",
      url: "/owners/v1/login",
      payload: { identificador: idLuna, password: "clave-de-la-duena-larga" },
    });
    assert.equal(bien.statusCode, 200);
    const pendiente = galleta(bien);
    const fallo = await app.inject({
      method: "POST",
      url: "/owners/v1/login/verify",
      headers: { cookie: pendiente },
      payload: { codigo: "ZZZZ-ZZZZ" },
    });
    assert.equal(fallo.json().intentosRestantes, 4);
    const v = await app.inject({
      method: "POST",
      url: "/owners/v1/login/verify",
      headers: { cookie: pendiente },
      payload: { codigo: ultimoCodigo(correo) },
    });
    assert.equal(v.statusCode, 200);
    assert.equal((await yo(galleta(v))).statusCode, 200);
  });

  it("el perfil público valida teléfonos y guarda nombre, bio y foto", async () => {
    const malo = await app.inject({
      method: "PUT",
      url: `/owners/v1/pets/${petLuna}/profile`,
      headers: { cookie: cookieDueno },
      payload: { nombre: "Luna", bio: "", telefonos: [{ etiqueta: "Casa", numero: "llámame" }], publicado: true },
    });
    assert.equal(malo.statusCode, 400);

    const bien = await app.inject({
      method: "PUT",
      url: `/owners/v1/pets/${petLuna}/profile`,
      headers: { cookie: cookieDueno },
      payload: {
        nombre: "Luna",
        bio: "Asustadiza. Responde a su nombre.",
        telefonos: [{ etiqueta: "Móvil", numero: "+34 600 000 000" }],
        publicado: true,
      },
    });
    assert.equal(bien.statusCode, 200);

    const noImagen = await app.inject({
      method: "PUT",
      url: `/owners/v1/pets/${petLuna}/photo`,
      headers: { cookie: cookieDueno, "content-type": "image/png" },
      payload: Buffer.from("esto no es un png"),
    });
    assert.equal(noImagen.statusCode, 415);

    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(64)]);
    const foto = await app.inject({
      method: "PUT",
      url: `/owners/v1/pets/${petLuna}/photo`,
      headers: { cookie: cookieDueno, "content-type": "image/png" },
      payload: png,
    });
    assert.equal(foto.statusCode, 200);
    // El dueño la ve por su ruta privada aunque el perfil no esté activo todavía.
    const propia = await app.inject({ method: "GET", url: foto.json().foto, headers: { cookie: cookieDueno } });
    assert.equal(propia.statusCode, 200);
    assert.equal(propia.headers["content-type"], "image/png");
    assert.deepEqual(propia.rawPayload, png);
    // Y nadie más.
    assert.equal((await app.inject({ method: "GET", url: foto.json().foto })).statusCode, 401);

    // Vive en el almacén de objetos, no en Postgres.
    const [fila] = await sql`SELECT foto, foto_key FROM pet_profiles WHERE pet_id = ${petLuna}`;
    assert.equal(fila.foto, null);
    assert.deepEqual(almacen.objetos.get(fila.foto_key), png);
    // Una foto nueva sustituye a la anterior, también en el almacén.
    const otraPng = Buffer.concat([png.subarray(0, 8), randomBytes(64)]);
    const cambio = await app.inject({
      method: "PUT",
      url: `/owners/v1/pets/${petLuna}/photo`,
      headers: { cookie: cookieDueno, "content-type": "image/png" },
      payload: otraPng,
    });
    assert.equal(cambio.statusCode, 200);
    assert.equal(almacen.objetos.has(fila.foto_key), false);
    assert.equal(almacen.objetos.size, 1);
  });

  it("pendiente, el perfil no sale al nivel 0; activada en clínica, sí", async () => {
    const consultar = () =>
      app.inject({ method: "POST", url: "/chip/v1/lookup", payload: { identificador: idLuna } });
    assert.equal((await consultar()).json().existe, false);

    const act = await app.inject({
      method: "POST",
      url: "/pets/v1/activate",
      headers: { cookie },
      payload: { identificador: idLuna, codigo: codigoLuna },
    });
    assert.equal(act.statusCode, 200);
    const l = (await consultar()).json();
    assert.equal(l.perfil.nombre, "Luna");
    assert.equal(l.perfil.telefonos[0].numero, "+34 600 000 000");
  });

  it("otro dueño no puede tocar la mascota de nadie", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/owners/v1/register",
      payload: {
        email: "otro@correo.example",
        password: "clave-del-otro-larga",
        pubKey: b64(),
        mascota: { identificador: { tipo: "iso", valor: "724098100006666" }, nombre: "Kira" },
      },
    });
    const v = await app.inject({
      method: "POST",
      url: "/owners/v1/login/verify",
      headers: { cookie: galleta(r) },
      payload: { codigo: ultimoCodigo("otro@correo.example") },
    });
    const intento = await app.inject({
      method: "PUT",
      url: `/owners/v1/pets/${petLuna}/profile`,
      headers: { cookie: galleta(v) },
      payload: { nombre: "Robada", bio: "", telefonos: [], publicado: true },
    });
    assert.equal(intento.statusCode, 404);
  });

  it("la bandeja entrega sus mensajes sellados tal cual, y solo a su dueña", async () => {
    const nota = randomBytes(200);
    const aviso = randomBytes(120);
    await sql`INSERT INTO inbox (pet_id, sealed, created_at) VALUES
      (${petLuna}, ${nota}, now() - interval '1 hour'), (${petLuna}, ${aviso}, now())`;

    assert.equal((await app.inject({ method: "GET", url: "/owners/v1/inbox" })).statusCode, 401);
    const r = await app.inject({ method: "GET", url: "/owners/v1/inbox", headers: { cookie: cookieDueno } });
    const mensajes = r.json().mensajes;
    assert.equal(mensajes.length, 2);
    // Lo más reciente primero, y los bytes sin tocar.
    assert.deepEqual(Buffer.from(mensajes[0].sellado, "base64"), aviso);
    assert.deepEqual(Buffer.from(mensajes[1].sellado, "base64"), nota);
    assert.equal(mensajes[0].petId, petLuna);
    // El panel solo sabe cuántos hay, no qué son.
    const luna = (await yo()).json().mascotas.find((m: { petId: string }) => m.petId === petLuna);
    assert.equal(luna.mensajes, 2);

    const otra = await app.inject({
      method: "POST",
      url: "/owners/v1/register",
      payload: {
        email: "tercera@correo.example",
        password: "clave-de-la-tercera",
        pubKey: b64(),
        mascota: { identificador: { tipo: "iso", valor: "724098100007777" }, nombre: "Nube" },
      },
    });
    const v = await app.inject({
      method: "POST",
      url: "/owners/v1/login/verify",
      headers: { cookie: galleta(otra) },
      payload: { codigo: ultimoCodigo("tercera@correo.example") },
    });
    const ajena = galleta(v);
    const suya = await app.inject({ method: "GET", url: "/owners/v1/inbox", headers: { cookie: ajena } });
    assert.equal(suya.json().mensajes.length, 0);
    const borrarAjeno = await app.inject({
      method: "DELETE",
      url: `/owners/v1/inbox/${mensajes[0].id}`,
      headers: { cookie: ajena },
    });
    assert.equal(borrarAjeno.statusCode, 404);

    const borrar = await app.inject({
      method: "DELETE",
      url: `/owners/v1/inbox/${mensajes[0].id}`,
      headers: { cookie: cookieDueno },
    });
    assert.equal(borrar.statusCode, 200);
    const queda = await app.inject({ method: "GET", url: "/owners/v1/inbox", headers: { cookie: cookieDueno } });
    assert.equal(queda.json().mensajes.length, 1);
  });

  it("si reclaman su chip, a la dueña le llega un correo y puede impugnar", async () => {
    // Alguien registra el chip de Luna y va a una clínica con un animal que lo lleva.
    const ajeno = await app.inject({
      method: "POST",
      url: "/pets/v1/register",
      payload: { identificador: idLuna, ownerPubKey: b64() },
    });
    const rec = await app.inject({
      method: "POST",
      url: "/pets/v1/claims",
      headers: { cookie },
      payload: { identificador: idLuna, codigo: ajeno.json().codigoActivacion },
    });
    assert.equal(rec.statusCode, 201);

    const aviso = [...buzon].reverse().find((c) => c.para === correo);
    assert.match(aviso!.asunto, /Han reclamado el chip de Luna/);
    assert.match(aviso!.texto, /terminado en 5555/);

    const m = (await yo()).json().mascotas[0];
    assert.equal(m.estado, "congelada");
    assert.equal(m.reclamacion.rol, "titular");

    const imp = await app.inject({
      method: "POST",
      url: `/owners/v1/claims/${m.reclamacion.id}/contest`,
      headers: { cookie: cookieDueno },
    });
    assert.deepEqual(imp.json(), { estado: "impugnada" });

    // Impugnada, el plazo ya no traspasa el chip.
    await sql`UPDATE reclamaciones SET plazo = now() - interval '1 minute' WHERE id = ${m.reclamacion.id}`;
    assert.equal(await resolverReclamaciones(), 0);
  });
});

describe("login de clínica", () => {
  it("frena la fuerza bruta por cuenta sin bloquear las demás", async () => {
    const intento = (email: string) =>
      app.inject({ method: "POST", url: "/clinics/v1/login", payload: { email, password: "no-es-la-clave-buena" } });
    const codigos = [];
    for (let i = 0; i < 11; i++) codigos.push((await intento("victima@prueba.example")).statusCode);
    assert.deepEqual(codigos.slice(0, 10), Array(10).fill(401));
    assert.equal(codigos[10], 429);
    // Otra cuenta desde la misma IP sigue pudiendo intentarlo.
    assert.equal((await intento("otra@prueba.example")).statusCode, 401);
  });
});

describe("barridos", () => {
  it("no se pueden lanzar desde fuera: los hace el cron interno", async () => {
    for (const url of ["/grants/v1/sweep", "/pets/v1/claims/sweep"])
      assert.equal((await app.inject({ method: "POST", url })).statusCode, 404);
  });
});

describe("alta de clínicas", () => {
  it("tiene límite por IP: cada alta hace scrypt y envía un correo", async () => {
    const codigos = [];
    for (let i = 0; i < 6; i++)
      codigos.push((await app.inject({ method: "POST", url: "/clinics/v1/register", payload: {} })).statusCode);
    assert.ok(codigos.includes(429), `sin 429 en ${codigos}`);
  });
});

describe("invitaciones", () => {
  it("invitar a un correo que ya tiene cuenta da 409, no 500", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/clinics/v1/members",
      headers: { cookie },
      payload: { nombre: "Otra vez", email: "admin@prueba.example", rol: "vet" },
    });
    assert.equal(r.statusCode, 409);
    assert.equal(r.json().motivo, "correo-en-uso");
  });
});

describe("correos ocupados sin verificar", () => {
  it("una cuenta de dueño sin verificar libera el correo pasadas 24 h", async () => {
    const alta = (pubKey = b64()) =>
      app.inject({
        method: "POST",
        url: "/owners/v1/register",
        payload: { email: "ocupado@correo.example", password: "clave-del-okupa-larga", pubKey, mascota: { identificador: { tipo: "iso", valor: "724098100007004" }, nombre: "" } },
      });
    assert.equal((await alta()).statusCode, 201);
    assert.equal((await alta()).statusCode, 409);
    await sql`UPDATE owners SET created_at = now() - interval '25 hours' WHERE email = 'ocupado@correo.example'`;
    assert.equal((await alta()).statusCode, 201);
  });

  it("una invitación caducada no se acepta y deja libre el correo", async () => {
    const invitar = () =>
      app.inject({
        method: "POST",
        url: "/clinics/v1/members",
        headers: { cookie },
        payload: { nombre: "Invitada", email: "invitada@prueba.example", rol: "vet" },
      });
    assert.equal((await invitar()).statusCode, 201);
    const token = tokenInvitacion("invitada@prueba.example");
    await sql`UPDATE clinic_members SET invite_expires_at = now() - interval '1 minute' WHERE email = 'invitada@prueba.example'`;
    const acepta = await app.inject({
      method: "POST",
      url: "/clinics/v1/members/accept",
      payload: { token, password: "clave-de-la-invitada", devicePubKey: b64() },
    });
    assert.equal(acepta.statusCode, 400);
    assert.equal((await invitar()).statusCode, 201);
  });
});
