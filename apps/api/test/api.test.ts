import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes, randomUUID, sign } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { crearCliente } from "@barkandmeow/db";
import { crearApp } from "../src/index.js";
import { cerrarDb, hashToken, indexar, usarCartero, type Carta } from "../src/core.js";
import { almacenEnMemoria, usarAlmacen } from "../src/almacen.js";
import { usarPushero } from "../src/push.js";
import { usarSmsista, type Sms } from "../src/sms.js";
import { resolverReclamaciones } from "../src/routes/mascotas.js";

/* Correo sin red: el cartero de los tests guarda las cartas en memoria. */
// Los tests del portal hacen más peticiones por minuto que un dueño real.
process.env.LIMITE_DUENOS = "1000";
process.env.LIMITE_RECUPERACION = "1000";
const buzon: Carta[] = [];
usarCartero(async (c) => {
  buzon.push(c);
});
/* SMS y push sin red: se guardan en memoria. */
const smsEnviados: Sms[] = [];
usarSmsista(async (m) => {
  smsEnviados.push(m);
});
const pushes: { to: string; data: { tipo: string; petId: string } }[] = [];
const tokensCaducados = new Set<string>();
usarPushero(async (mensajes) => {
  pushes.push(...mensajes);
  return mensajes.map((m) => ({ token: m.to, caducado: tokensCaducados.has(m.to) }));
});
const ultimoSms = (para: string) =>
  [...smsEnviados].reverse().find((m) => m.para === para)?.texto.match(/\b([2-9A-Z]{4}-[2-9A-Z]{4})\b/)?.[1] ?? "";
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

  const permisosDe = (c?: string) =>
    app.inject({ method: "GET", url: "/grants/v1/owner", headers: c ? { cookie: c } : {} });

  it("el dueño ve la petición con el mismo número; otro dueño, nada", async () => {
    assert.equal((await permisosDe()).statusCode, 401);
    assert.equal((await permisosDe(cookie)).statusCode, 401);

    const r = await permisosDe(cookieDueno);
    assert.equal(r.statusCode, 200);
    const p = r.json().peticiones.find((x: { requestId: string }) => x.requestId === requestId);
    assert.ok(p, "la petición no aparece en la lista del dueño");
    assert.equal(p.sas, sas);
    assert.equal(p.petId, petId);
    assert.equal(p.vetPubKey, vetPubKey.toString("base64"));
    assert.equal(typeof p.clinica.nombre, "string");
    assert.equal(r.json().permisos.length, 0);

    const ajeno = (await permisosDe(cookieAjeno)).json();
    assert.deepEqual(ajeno, { peticiones: [], permisos: [] });
  });

  it("el dueño rechaza una petición y ya no se puede aprobar", async () => {
    const movil = "ExponentPushToken[movil-permisos-nivel3]";
    const reg = await app.inject({
      method: "POST",
      url: "/owners/v1/devices",
      headers: { cookie: cookieDueno },
      payload: { plataforma: "expo", token: movil },
    });
    assert.equal(reg.statusCode, 201);
    pushes.length = 0;

    const nueva =await app.inject({
      method: "POST",
      url: "/grants/v1/request",
      headers: { cookie },
      payload: { identificador: { tipo: "iso", valor: CHIP }, vetPubKey: vetPubKey.toString("base64") },
    });
    assert.equal(nueva.statusCode, 201);
    // Al móvil del dueño le llega un aviso sin contenido: ni la clínica ni el número.
    assert.deepEqual(
      pushes.map((m) => [m.to, m.data.tipo, m.data.petId]),
      [[movil, "permiso", petId]],
    );
    assert.ok(!JSON.stringify(pushes).includes(nueva.json().sas));
    await sql`DELETE FROM owner_devices WHERE token = ${movil}`;
    const id = nueva.json().requestId;
    const rechazar = (c?: string) =>
      app.inject({ method: "POST", url: "/grants/v1/reject", headers: c ? { cookie: c } : {}, payload: { requestId: id } });

    assert.equal((await rechazar()).statusCode, 401);
    assert.equal((await rechazar(cookieAjeno)).statusCode, 410);
    assert.equal((await rechazar(cookieDueno)).statusCode, 200);
    assert.equal((await rechazar(cookieDueno)).statusCode, 410);

    const estado = await app.inject({ method: "GET", url: `/grants/v1/request/${id}`, headers: { cookie } });
    assert.equal(estado.json().estado, "rejected");
    const aprobar = await app.inject({
      method: "POST",
      url: "/grants/v1/approve",
      headers: { cookie: cookieDueno },
      payload: { requestId: id, wrappedKey: b64(48) },
    });
    assert.equal(aprobar.statusCode, 410);
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

    const dueno = (await permisosDe(cookieDueno)).json();
    assert.equal(dueno.permisos.length, 1);
    assert.equal(dueno.permisos[0].grantId, r.json().grantId);
    assert.ok(!dueno.peticiones.some((x: { requestId: string }) => x.requestId === requestId));
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
    assert.equal((await permisosDe(cookieDueno)).json().permisos.length, 0);
    // Retirar lo ya retirado no cuela.
    const otraVez = await app.inject({
      method: "POST",
      url: "/grants/v1/revoke",
      headers: { cookie: cookieDueno },
      payload: { grantId },
    });
    assert.equal(otraVez.statusCode, 404);
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

describe("portada de la consola: el chip dice qué toca y los pacientes se reconocen", () => {
  const CHIP_PACIENTE = "724098100008801";
  const id = { tipo: "iso", valor: CHIP_PACIENTE };
  const correoDueno = "dueno-paciente@correo.example";
  let pet = "";
  let cookieDueno = "";
  let grantId = "";

  const queToca = (valor = CHIP_PACIENTE, c: string | null = cookie) =>
    app.inject({
      method: "POST",
      url: "/clinics/v1/chip",
      headers: c ? { cookie: c } : {},
      payload: { identificador: { tipo: "iso", valor } },
    });
  const pacientes = (c: string | null = cookie) =>
    app.inject({ method: "GET", url: "/clinics/v1/patients", headers: c ? { cookie: c } : {} });
  const etiquetar = (petId: string, etiqueta: string, c: string | null = cookie) =>
    app.inject({
      method: "PUT",
      url: `/clinics/v1/patients/${petId}/label`,
      headers: c ? { cookie: c } : {},
      payload: { etiqueta },
    });
  const quitar = (petId: string, c: string | null = cookie) =>
    app.inject({ method: "DELETE", url: `/clinics/v1/patients/${petId}/label`, headers: c ? { cookie: c } : {} });

  it("sin sesión de clínica no responde nada", async () => {
    assert.equal((await queToca(CHIP_PACIENTE, null)).statusCode, 401);
    assert.equal((await pacientes(null)).statusCode, 401);
    assert.equal((await etiquetar(randomUUID(), b64(64), null)).statusCode, 401);
    assert.equal((await quitar(randomUUID(), null)).statusCode, 401);
  });

  it("un chip que nadie ha registrado: sin registro", async () => {
    const r = await queToca();
    assert.equal(r.statusCode, 200);
    assert.deepEqual(r.json(), { situacion: "sin-registro", petId: null });
  });

  it("registrado por el dueño y sin activar: toca activarlo con su código", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/owners/v1/register",
      payload: { email: correoDueno, password: "clave-del-dueno-larga", pubKey: b64(), mascota: { identificador: id, nombre: "" } },
    });
    assert.equal(r.statusCode, 201);
    pet = r.json().mascota.petId;
    const pendiente = r.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const v = await app.inject({
      method: "POST",
      url: "/owners/v1/login/verify",
      headers: { cookie: pendiente },
      payload: { codigo: ultimoCodigo(correoDueno) },
    });
    assert.equal(v.statusCode, 200);
    cookieDueno = v.cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    assert.deepEqual((await queToca()).json(), { situacion: "pendiente", petId: null });
  });

  it("activo y sin permiso: toca pedir el alta de nivel 3", async () => {
    const [idx] = await indexar([CHIP_PACIENTE]);
    await sql`UPDATE pet_identifiers SET activo = true WHERE pet_id = ${pet} AND id_index = ${idx}`;
    await sql`UPDATE pets SET estado = 'activa', activated_at = now() WHERE id = ${pet}`;
    assert.deepEqual((await queToca()).json(), { situacion: "activa", petId: null });
    assert.deepEqual((await pacientes()).json().pacientes.filter((p: { petId: string }) => p.petId === pet), []);
  });

  it("con una reclamación abierta no se puede hacer nada", async () => {
    await sql`UPDATE pets SET estado = 'congelada' WHERE id = ${pet}`;
    assert.deepEqual((await queToca()).json(), { situacion: "reclamada", petId: null });
    await sql`UPDATE pets SET estado = 'activa' WHERE id = ${pet}`;
  });

  it("no se etiqueta a quien no es paciente", async () => {
    assert.equal((await etiquetar(pet, b64(64))).statusCode, 404);
    assert.equal((await etiquetar(randomUUID(), b64(64))).statusCode, 404);
    assert.equal((await etiquetar("no-es-un-id", b64(64))).statusCode, 404);
  });

  it("con el nivel 3 concedido ya es paciente y sale en la lista una sola vez", async () => {
    const pedir = await app.inject({
      method: "POST",
      url: "/grants/v1/request",
      headers: { cookie },
      payload: { identificador: id, vetPubKey: b64() },
    });
    assert.equal(pedir.statusCode, 201);
    const aprobar = await app.inject({
      method: "POST",
      url: "/grants/v1/approve",
      headers: { cookie: cookieDueno },
      payload: { requestId: pedir.json().requestId, wrappedKey: b64(48) },
    });
    assert.equal(aprobar.statusCode, 201);
    grantId = aprobar.json().grantId;
    // Un segundo permiso vivo sobre la misma mascota no la duplica en la lista.
    const [c] = await sql`SELECT clinic_id FROM grants WHERE id = ${grantId}`;
    const [doble] = await sql`INSERT INTO grants (pet_id, clinic_id, level, wrapped_key)
      VALUES (${pet}, ${c.clinic_id}, 3, ${randomBytes(48)}) RETURNING id`;

    assert.deepEqual((await queToca()).json(), { situacion: "paciente", petId: pet });
    const lista = (await pacientes()).json().pacientes.filter((p: { petId: string }) => p.petId === pet);
    assert.equal(lista.length, 1);
    assert.equal(lista[0].chipPista, "8801");
    assert.equal(lista[0].etiqueta, null);
    assert.equal(lista[0].ultimoEnvio, null);
    assert.equal(lista[0].caduca, null);
    await sql`DELETE FROM grants WHERE id = ${doble.id}`;
  });

  it("la clínica recibe la ficha del paciente y su clave, las dos cerradas", async () => {
    const leer = (petId: string, c: string | null = cookie) =>
      app.inject({ method: "GET", url: `/clinics/v1/patients/${petId}/record`, headers: c ? { cookie: c } : {} });
    assert.equal((await leer(pet, null)).statusCode, 401);
    assert.equal((await leer(randomUUID())).statusCode, 404);
    assert.equal((await leer("no-es-un-id")).statusCode, 404);
    // Con sesión de dueño no se entra por la puerta de la clínica.
    assert.equal((await leer(pet, cookieDueno)).statusCode, 401);

    // El dueño aún no ha escrito la ficha: la clave llega, la ficha no.
    const vacia = await leer(pet);
    assert.equal(vacia.statusCode, 200);
    assert.equal(vacia.json().sobre, null);
    assert.equal(vacia.json().version, 0);
    assert.equal(vacia.json().chipPista, "8801");
    const [g] = await sql`SELECT wrapped_key FROM grants WHERE id = ${grantId}`;
    assert.equal(vacia.json().claveEnvuelta, (g.wrapped_key as Buffer).toString("base64"));

    const ficha = b64(700);
    const guardada = await app.inject({
      method: "PUT",
      url: `/owners/v1/pets/${pet}/record`,
      headers: { cookie: cookieDueno },
      payload: { sobre: ficha, version: 0 },
    });
    assert.equal(guardada.statusCode, 200);
    const llena = (await leer(pet)).json();
    assert.equal(llena.sobre, ficha);
    assert.equal(llena.version, 1);

    // Queda apuntado que la clínica la abrió.
    const [n] = await sql`SELECT count(*)::int AS n FROM access_log WHERE action = 'ficha_nivel3'`;
    assert.equal(n.n, 2);
  });

  it("un administrador deja la clave de la ficha cerrada para todo el equipo", async () => {
    const pendientes = (c: string | null = cookie) =>
      app.inject({ method: "GET", url: "/clinics/v1/team-keys/pending", headers: c ? { cookie: c } : {} });
    const entregar = (entregas: { permisoId: string; cerrada: string }[], c: string | null = cookie) =>
      app.inject({ method: "POST", url: "/clinics/v1/team-keys", headers: c ? { cookie: c } : {}, payload: { entregas } });
    const leer = async () =>
      (await app.inject({ method: "GET", url: `/clinics/v1/patients/${pet}/record`, headers: { cookie } })).json();
    const cerrada = b64(73);

    assert.equal((await pendientes(null)).statusCode, 401);
    assert.equal((await entregar([{ permisoId: grantId, cerrada }], null)).statusCode, 401);
    // Con sesión de dueño no se entra por la puerta de la clínica.
    assert.equal((await pendientes(cookieDueno)).statusCode, 401);

    assert.equal((await leer()).claveEquipo, null);
    // Un permiso antiguo no lleva una clave sellada (80 bytes): no hay nada que preparar.
    assert.deepEqual((await pendientes()).json().permisos.filter((p: { id: string }) => p.id === grantId), []);
    const [g] = await sql`UPDATE grants SET wrapped_key = ${randomBytes(80)} WHERE id = ${grantId} RETURNING wrapped_key`;
    assert.deepEqual(
      (await pendientes()).json().permisos.filter((p: { id: string }) => p.id === grantId),
      [{ id: grantId, petId: pet, claveEnvuelta: (g.wrapped_key as Buffer).toString("base64") }],
    );

    assert.equal((await entregar([{ permisoId: grantId, cerrada: "corta" }])).statusCode, 400);
    // El permiso de otra clínica, o uno que no existe, no se toca.
    assert.deepEqual((await entregar([{ permisoId: randomUUID(), cerrada }])).json(), { entregadas: 0 });
    assert.deepEqual((await entregar([{ permisoId: grantId, cerrada }])).json(), { entregadas: 1 });
    assert.equal((await leer()).claveEquipo, cerrada);

    // Lo entregado no se pisa, y deja de estar pendiente.
    assert.deepEqual((await entregar([{ permisoId: grantId, cerrada: b64(73) }])).json(), { entregadas: 0 });
    assert.equal((await leer()).claveEquipo, cerrada);
    assert.deepEqual((await pendientes()).json().permisos.filter((p: { id: string }) => p.id === grantId), []);
  });

  it("la etiqueta entra y sale tal cual: el servidor no la toca", async () => {
    const primera = b64(297);
    assert.equal((await etiquetar(pet, primera)).statusCode, 200);
    const leer = async () =>
      (await pacientes()).json().pacientes.find((p: { petId: string }) => p.petId === pet).etiqueta;
    assert.equal(await leer(), primera);

    const segunda = b64(297);
    assert.equal((await etiquetar(pet, segunda)).statusCode, 200);
    assert.equal(await leer(), segunda);
    const [n] = await sql`SELECT count(*)::int AS n FROM etiquetas_paciente WHERE pet_id = ${pet}`;
    assert.equal(n.n, 1);

    // Más de 512 bytes no es una etiqueta.
    assert.equal((await etiquetar(pet, b64(600))).statusCode, 400);
    assert.equal(await leer(), segunda);
  });

  it("se puede quitar, y quitar lo que no hay no cuela", async () => {
    assert.equal((await quitar(pet)).statusCode, 200);
    assert.equal((await quitar(pet)).statusCode, 404);
    assert.equal((await quitar("no-es-un-id")).statusCode, 404);
    assert.equal((await etiquetar(pet, b64(297))).statusCode, 200);
  });

  it("si el dueño retira el permiso, deja de ser paciente y su etiqueta se borra", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/grants/v1/revoke",
      headers: { cookie: cookieDueno },
      payload: { grantId },
    });
    assert.equal(r.statusCode, 200);
    assert.deepEqual((await queToca()).json(), { situacion: "activa", petId: null });
    assert.deepEqual((await pacientes()).json().pacientes.filter((p: { petId: string }) => p.petId === pet), []);
    const quedan = await sql`SELECT 1 FROM etiquetas_paciente WHERE pet_id = ${pet}`;
    assert.equal(quedan.length, 0);
    assert.equal((await etiquetar(pet, b64(297))).statusCode, 404);
    // Y la ficha deja de salir por la puerta de la clínica.
    const ficha = await app.inject({ method: "GET", url: `/clinics/v1/patients/${pet}/record`, headers: { cookie } });
    assert.equal(ficha.statusCode, 404);
  });
});

describe("los nombres de los pacientes los lee todo el equipo", () => {
  const correo = "mostrador@prueba.example";
  const navegador = b64();
  let cookieVet = "";
  let vetId = "";
  let dispositivoId = "";
  const sellada = b64(80);

  const presentar = (devicePubKey: string, c: string | null) =>
    app.inject({ method: "POST", url: "/clinics/v1/me/devices", headers: c ? { cookie: c } : {}, payload: { devicePubKey } });
  const pendientes = (c: string | null) =>
    app.inject({ method: "GET", url: "/clinics/v1/label-keys/pending", headers: c ? { cookie: c } : {} });
  const entregar = (entregas: { dispositivoId: string; sellada: string }[], c: string | null) =>
    app.inject({ method: "POST", url: "/clinics/v1/label-keys", headers: c ? { cookie: c } : {}, payload: { entregas } });

  it("se añade a alguien al equipo y elige su contraseña desde el correo", async () => {
    const alta = await app.inject({
      method: "POST",
      url: "/clinics/v1/members",
      headers: { cookie },
      payload: { nombre: "Vet del mostrador", email: correo, rol: "vet" },
    });
    assert.equal(alta.statusCode, 201);
    vetId = alta.json().memberId;
    const carta = [...buzon].reverse().find((c) => c.para === correo)!;
    assert.match(carta.asunto, /añadido/);
    assert.ok(!/invit/i.test(carta.asunto + carta.texto), "el correo sigue hablando de invitaciones");

    const acc = await app.inject({
      method: "POST",
      url: "/clinics/v1/members/accept",
      payload: { token: tokenInvitacion(correo), password: "clave-del-mostrador-larga", devicePubKey: b64() },
    });
    assert.equal(acc.statusCode, 200);
    cookieVet = acc.cookies[0].name + "=" + acc.cookies[0].value;
  });

  it("sin sesión no hay nada que presentar ni que repartir", async () => {
    assert.equal((await presentar(navegador, null)).statusCode, 401);
    assert.equal((await pendientes(null)).statusCode, 401);
    assert.equal((await entregar([{ dispositivoId: randomUUID(), sellada }], null)).statusCode, 401);
  });

  it("el navegador de un miembro se presenta y espera; presentarse dos veces no duplica", async () => {
    assert.equal((await presentar("corta", cookieVet)).statusCode, 400);
    const r = await presentar(navegador, cookieVet);
    assert.equal(r.statusCode, 200);
    assert.deepEqual(r.json(), { claveEtiquetas: null });
    assert.deepEqual((await presentar(navegador, cookieVet)).json(), { claveEtiquetas: null });
    const filas = await sql`SELECT id FROM dispositivos_miembro WHERE member_id = ${vetId}`;
    assert.equal(filas.length, 1);
    dispositivoId = filas[0].id;
  });

  it("solo un administrador ve quién espera y reparte la clave", async () => {
    assert.equal((await pendientes(cookieVet)).statusCode, 403);
    assert.equal((await entregar([{ dispositivoId, sellada }], cookieVet)).statusCode, 403);
    // Lo mismo con las claves de las fichas: el resto del equipo las lee, no las reparte.
    const fichas = { cookie: cookieVet };
    assert.equal((await app.inject({ method: "GET", url: "/clinics/v1/team-keys/pending", headers: fichas })).statusCode, 403);
    const reparto = await app.inject({
      method: "POST",
      url: "/clinics/v1/team-keys",
      headers: fichas,
      payload: { entregas: [{ permisoId: randomUUID(), cerrada: b64(73) }] },
    });
    assert.equal(reparto.statusCode, 403);

    const lista = (await pendientes(cookie)).json().dispositivos;
    assert.deepEqual(
      lista.filter((d: { id: string }) => d.id === dispositivoId),
      [{ id: dispositivoId, devicePubKey: navegador }],
    );
  });

  it("el administrador de otra clínica no puede dejarle una clave a este navegador", async () => {
    const [otra] = await sql`INSERT INTO clinics (name, country, pub_key) VALUES ('Otra clínica', 'ES', ${randomBytes(32)}) RETURNING id`;
    const [intruso] = await sql`INSERT INTO clinic_members (clinic_id, name, email, role, accepted_at, email_verified_at)
      VALUES (${otra.id}, 'Admin ajeno', 'admin@otra-etiquetas.example', 'admin', now(), now()) RETURNING id`;
    const token = b64(32);
    await sql`INSERT INTO clinic_sessions (member_id, token_hash, expires_at)
      VALUES (${intruso.id}, ${hashToken(token)}, ${new Date(Date.now() + 864e5)})`;
    const cookieAjena = `bam_clinic=${token}`;

    assert.deepEqual((await pendientes(cookieAjena)).json(), { dispositivos: [] });
    const r = await entregar([{ dispositivoId, sellada: b64(80) }], cookieAjena);
    assert.equal(r.statusCode, 200);
    assert.equal(r.json().entregadas, 0);
    assert.deepEqual((await presentar(navegador, cookieVet)).json(), { claveEtiquetas: null });
    await sql`DELETE FROM clinics WHERE id = ${otra.id}`;
  });

  it("entregada la clave, el navegador se la lleva tal cual y nadie la pisa después", async () => {
    // 80 bytes justos: la pública de la clínica, la clave y su sello.
    assert.equal((await entregar([{ dispositivoId, sellada: b64(48) }], cookie)).statusCode, 400);
    const r = await entregar([{ dispositivoId, sellada }], cookie);
    assert.equal(r.statusCode, 200);
    assert.equal(r.json().entregadas, 1);

    assert.deepEqual((await presentar(navegador, cookieVet)).json(), { claveEtiquetas: sellada });
    assert.equal((await entregar([{ dispositivoId, sellada: b64(80) }], cookie)).json().entregadas, 0);
    assert.deepEqual((await presentar(navegador, cookieVet)).json(), { claveEtiquetas: sellada });
    const quedan = (await pendientes(cookie)).json().dispositivos;
    assert.ok(!quedan.some((d: { id: string }) => d.id === dispositivoId));
  });

  it("un miembro tiene pocos navegadores: el más antiguo cede el sitio", async () => {
    await sql`UPDATE dispositivos_miembro SET created_at = now() - interval '1 day' WHERE id = ${dispositivoId}`;
    for (let i = 0; i < 5; i++) assert.equal((await presentar(b64(), cookieVet)).statusCode, 200);
    const filas = await sql`SELECT id FROM dispositivos_miembro WHERE member_id = ${vetId}`;
    assert.equal(filas.length, 5);
    assert.ok(!filas.some((f) => f.id === dispositivoId));
  });

  it("al dar de baja a alguien, sus navegadores dejan de contar", async () => {
    const r = await app.inject({ method: "DELETE", url: `/clinics/v1/members/${vetId}`, headers: { cookie } });
    assert.equal(r.statusCode, 200);
    const filas = await sql`SELECT id FROM dispositivos_miembro WHERE member_id = ${vetId}`;
    assert.equal(filas.length, 0);
    assert.equal((await presentar(b64(), cookieVet)).statusCode, 401);
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

    // Borrado en bloque: lo ajeno no se toca, lo suyo se va entero.
    const enBloqueAjeno = await app.inject({
      method: "DELETE",
      url: "/owners/v1/inbox",
      headers: { cookie: ajena },
      payload: { ids: [mensajes[1].id] },
    });
    assert.equal(enBloqueAjeno.json().borrados, 0);
    const vacio = await app.inject({ method: "DELETE", url: "/owners/v1/inbox", headers: { cookie: cookieDueno }, payload: { ids: [] } });
    assert.equal(vacio.statusCode, 400);
    await sql`INSERT INTO inbox (pet_id, sealed) VALUES (${petLuna}, ${randomBytes(50)})`;
    const todos = (await app.inject({ method: "GET", url: "/owners/v1/inbox", headers: { cookie: cookieDueno } })).json().mensajes;
    assert.equal(todos.length, 2);
    const enBloque = await app.inject({
      method: "DELETE",
      url: "/owners/v1/inbox",
      headers: { cookie: cookieDueno },
      payload: { ids: todos.map((m: { id: string }) => m.id) },
    });
    assert.equal(enBloque.json().borrados, 2);
    const nada = await app.inject({ method: "GET", url: "/owners/v1/inbox", headers: { cookie: cookieDueno } });
    assert.equal(nada.json().mensajes.length, 0);
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

describe("ficha de salud y placa del collar", () => {
  let cookieDuena = "";
  let cookieOtro = "";
  let pet = "";
  let petOtro = "";

  const abrir = async (email: string, chip: string) => {
    const r = await app.inject({
      method: "POST",
      url: "/owners/v1/register",
      payload: { email, password: "clave-de-la-ficha-larga", pubKey: b64(), mascota: { identificador: { tipo: "iso", valor: chip }, nombre: "Lía" } },
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
    return { cookie: v.cookies.map((c) => `${c.name}=${c.value}`).join("; "), petId: r.json().mascota.petId as string };
  };
  const ficha = (c: string | null, id = pet) =>
    app.inject({ method: "GET", url: `/owners/v1/pets/${id}/record`, headers: c ? { cookie: c } : {} });
  const guardar = (sobre: string, version: number, c: string | null = cookieDuena, id = pet) =>
    app.inject({ method: "PUT", url: `/owners/v1/pets/${id}/record`, headers: c ? { cookie: c } : {}, payload: { sobre, version } });
  const placa = (id: string, sobre: string, c: string | null = cookieDuena, mascota = pet) =>
    app.inject({ method: "PUT", url: `/owners/v1/pets/${mascota}/tag`, headers: c ? { cookie: c } : {}, payload: { id, sobre } });
  const quitarPlaca = (c: string | null = cookieDuena) =>
    app.inject({ method: "DELETE", url: `/owners/v1/pets/${pet}/tag`, headers: c ? { cookie: c } : {} });
  const escanear = (id: string) => app.inject({ method: "GET", url: `/e/v1/${id}` });
  const mia = async () =>
    (await app.inject({ method: "GET", url: "/owners/v1/me", headers: { cookie: cookieDuena } })).json().mascotas[0];

  it("la ficha empieza vacía y solo la ve su dueño", async () => {
    ({ cookie: cookieDuena, petId: pet } = await abrir("duena-ficha@correo.example", "724098100008811"));
    ({ cookie: cookieOtro, petId: petOtro } = await abrir("otro-ficha@correo.example", "724098100008812"));

    assert.equal((await ficha(null)).statusCode, 401);
    assert.equal((await ficha(cookieOtro)).statusCode, 404);
    const r = await ficha(cookieDuena);
    assert.equal(r.statusCode, 200);
    assert.deepEqual(r.json(), { sobre: null, version: 0 });
    const m = await mia();
    assert.equal(m.ficha, false);
    assert.equal(m.placa, false);
  });

  it("se guarda cifrada y con versión: dos sitios a la vez no se pisan", async () => {
    const primera = b64(900);
    assert.equal((await guardar(primera, 0, null)).statusCode, 401);
    assert.equal((await guardar(primera, 0, cookieOtro)).statusCode, 404);
    assert.equal((await guardar("no es base64 !!", 0)).statusCode, 400);
    assert.equal((await guardar(b64(70 * 1024), 0)).statusCode, 400);

    const r = await guardar(primera, 0);
    assert.equal(r.statusCode, 200);
    assert.equal(r.json().version, 1);
    assert.deepEqual((await ficha(cookieDuena)).json(), { sobre: primera, version: 1 });

    // El portal y la app leyeron la versión 1: gana el primero, el otro vuelve a leer.
    const segunda = b64(900);
    assert.equal((await guardar(segunda, 1)).json().version, 2);
    const tarde = await guardar(b64(900), 1);
    assert.equal(tarde.statusCode, 409);
    assert.equal(tarde.json().motivo, "version");
    assert.equal((await guardar(b64(900), 0)).statusCode, 409);
    assert.deepEqual((await ficha(cookieDuena)).json(), { sobre: segunda, version: 2 });
    assert.equal((await mia()).ficha, true);
  });

  it("la placa responde a quien la escanea y se actualiza sin cambiar de placa", async () => {
    const id = randomUUID();
    const resumen = b64(400);
    assert.equal((await placa(id, resumen, null)).statusCode, 401);
    assert.equal((await placa(id, resumen, cookieOtro)).statusCode, 404);
    assert.equal((await placa("no-es-un-id", resumen)).statusCode, 400);
    assert.equal((await escanear(id)).statusCode, 404);

    const r = await placa(id, resumen);
    assert.equal(r.statusCode, 200);
    assert.deepEqual(r.json(), { id, version: 1 });
    const leida = await escanear(id);
    assert.equal(leida.statusCode, 200);
    assert.equal(leida.json().sobre, resumen);
    assert.equal((await mia()).placa, true);

    // Cambia la ficha: mismo QR, resumen nuevo.
    const nuevo = b64(400);
    assert.deepEqual((await placa(id, nuevo)).json(), { id, version: 2 });
    assert.equal((await escanear(id)).json().sobre, nuevo);
    assert.equal((await escanear(id)).json().version, 2);
  });

  it("nadie pone su placa encima de la de otra mascota", async () => {
    const [mi] = await sql`SELECT id FROM blobs WHERE pet_id = ${pet} AND kind = 'emergency'`;
    const antes = (await escanear(mi.id)).json().sobre;
    const r = await placa(mi.id, b64(400), cookieOtro, petOtro);
    assert.equal(r.statusCode, 409);
    assert.equal(r.json().motivo, "id");
    assert.equal((await escanear(mi.id)).json().sobre, antes);
    const ajenas = await sql`SELECT id FROM blobs WHERE pet_id = ${petOtro} AND kind = 'emergency'`;
    assert.equal(ajenas.length, 0);
  });

  it("una placa perdida se sustituye: la vieja deja de responder", async () => {
    const [vieja] = await sql`SELECT id FROM blobs WHERE pet_id = ${pet} AND kind = 'emergency'`;
    const nueva = randomUUID();
    assert.deepEqual((await placa(nueva, b64(400))).json(), { id: nueva, version: 1 });
    assert.equal((await escanear(vieja.id)).statusCode, 404);
    assert.equal((await escanear(nueva)).statusCode, 200);
    const vivas = await sql`SELECT id FROM blobs WHERE pet_id = ${pet} AND kind = 'emergency'`;
    assert.equal(vivas.length, 1);
  });

  it("retirar la placa la apaga, y retirarla dos veces no cuela", async () => {
    const [viva] = await sql`SELECT id FROM blobs WHERE pet_id = ${pet} AND kind = 'emergency'`;
    assert.equal((await quitarPlaca(null)).statusCode, 401);
    assert.equal((await quitarPlaca()).statusCode, 200);
    assert.equal((await escanear(viva.id)).statusCode, 404);
    assert.equal((await quitarPlaca()).statusCode, 404);
    assert.equal((await mia()).placa, false);
    // La ficha sigue ahí: retirar la placa no la toca.
    assert.equal((await ficha(cookieDuena)).json().version, 2);
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

describe("software de gestión conectado por API", () => {
  const CHIP_API = "724098100007010";
  const correo = "dueno-api@correo.example";
  let cookieDueno = "";
  let petApi = "";
  let token = "";
  let claveId = "";
  const pubDueno = b64();
  const firmaPub = b64();

  const conClave = (url: string, t = token, payload?: object) =>
    app.inject({
      method: payload ? "POST" : "GET",
      url,
      headers: { authorization: `Bearer ${t}` },
      payload,
    });
  const idApi = { tipo: "iso", valor: CHIP_API };

  before(async () => {
    const r = await app.inject({
      method: "POST",
      url: "/owners/v1/register",
      payload: { email: correo, password: "clave-del-dueno-larga", pubKey: pubDueno, mascota: { identificador: idApi, nombre: "" } },
    });
    assert.equal(r.statusCode, 201);
    petApi = r.json().mascota.petId;
    const v = await app.inject({
      method: "POST",
      url: "/owners/v1/login/verify",
      headers: { cookie: r.cookies.map((c) => `${c.name}=${c.value}`).join("; ") },
      payload: { codigo: ultimoCodigo(correo) },
    });
    cookieDueno = v.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    // Activada en clínica, como la dejaría /pets/v1/activate.
    await sql`UPDATE pets SET estado = 'activa' WHERE id = ${petApi}`;
    await sql`UPDATE pet_identifiers SET activo = true WHERE pet_id = ${petApi}`;
  });

  it("solo un administrador crea claves, y el token sale una sola vez", async () => {
    const anonimo = await app.inject({ method: "POST", url: "/clinics/v1/api-keys", payload: { nombre: "Gestión", firmaPub } });
    assert.equal(anonimo.statusCode, 401);
    // Sin clave de firma no hay conexión: lo que envíe tiene que poder certificarse.
    const sinFirma = await app.inject({
      method: "POST",
      url: "/clinics/v1/api-keys",
      headers: { cookie },
      payload: { nombre: "Sin firma" },
    });
    assert.equal(sinFirma.statusCode, 400);

    const r = await app.inject({
      method: "POST",
      url: "/clinics/v1/api-keys",
      headers: { cookie },
      payload: { nombre: "Software de gestión", firmaPub },
    });
    assert.equal(r.statusCode, 201);
    token = r.json().token;
    claveId = r.json().id;
    assert.match(token, /^bmk_[A-Za-z0-9_-]{43}$/);
    assert.ok(token.startsWith(r.json().prefijo));

    const lista = await app.inject({ method: "GET", url: "/clinics/v1/api-keys", headers: { cookie } });
    assert.equal(lista.json().claves.length, 1);
    assert.equal(lista.json().claves[0].token, undefined);
    assert.ok(!lista.body.includes(token));
    // En la base solo está el hash.
    const [fila] = await sql`SELECT token_hash FROM clinic_api_keys WHERE id = ${claveId}`;
    assert.notEqual(fila.token_hash, token);
  });

  it("sin clave, o con una inventada, no responde nada", async () => {
    assert.equal((await app.inject({ method: "GET", url: "/clinics/v1/api/me" })).statusCode, 401);
    assert.equal((await conClave("/clinics/v1/api/me", `bmk_${"A".repeat(43)}`)).statusCode, 401);
    // La sesión de la consola no sirve como clave.
    const conCookie = await app.inject({ method: "GET", url: "/clinics/v1/api/me", headers: { cookie } });
    assert.equal(conCookie.statusCode, 401);

    const me = await conClave("/clinics/v1/api/me");
    assert.equal(me.statusCode, 200);
    assert.equal(me.json().clinica.nombre, "Clínica de prueba");
  });

  it("sin nivel 3 no encuentra al paciente ni le envía nada", async () => {
    const busca = await conClave("/clinics/v1/api/patients/search", token, { identificador: idApi });
    assert.equal(busca.statusCode, 404);
    const envia = await conClave("/clinics/v1/reports", token, { petId: petApi, sellado: b64(96) });
    assert.equal(envia.statusCode, 404);
    assert.equal((await conClave("/clinics/v1/api/patients")).json().pacientes.length, 0);
  });

  it("con nivel 3 busca, envía, y el dueño recibe el informe con la clínica como origen", async () => {
    const [{ clinic_id }] = await sql`SELECT clinic_id FROM clinic_api_keys WHERE id = ${claveId}`;
    await sql`INSERT INTO grants (pet_id, clinic_id, level, wrapped_key) VALUES (${petApi}, ${clinic_id}, 3, ${randomBytes(48)})`;

    const pacientes = (await conClave("/clinics/v1/api/patients")).json().pacientes;
    assert.deepEqual(
      pacientes.map((p: { petId: string }) => p.petId),
      [petApi],
    );
    const busca = await conClave("/clinics/v1/api/patients/search", token, { identificador: idApi });
    assert.equal(busca.statusCode, 200);
    assert.equal(busca.json().petId, petApi);
    assert.equal(busca.json().ownerPubKey, pubDueno);

    const sellado = b64(200);
    const envia = await conClave("/clinics/v1/reports", token, { petId: petApi, sellado });
    assert.equal(envia.statusCode, 201);

    const bandeja = await app.inject({ method: "GET", url: "/owners/v1/inbox", headers: { cookie: cookieDueno } });
    const [m] = bandeja.json().mensajes;
    assert.equal(m.sellado, sellado);
    assert.equal(m.origen.clinica, "Clínica de prueba");
    // La clave de firma de la conexión que lo envió: la que tiene que haberlo firmado.
    assert.equal(m.origen.firma, firmaPub);

    const registro = await app.inject({ method: "GET", url: "/clinics/v1/reports", headers: { cookie } });
    assert.equal(registro.json().envios.length, 1);
    assert.equal(registro.json().envios[0].clave, "Software de gestión");
    assert.equal(registro.json().envios[0].bytes, 200);
  });

  it("los PDF adjuntos van sellados al almacén y solo los descarga el dueño", async () => {
    const movil = "ExponentPushToken[movil-del-dueno-api]";
    const reg = await app.inject({
      method: "POST",
      url: "/owners/v1/devices",
      headers: { cookie: cookieDueno },
      payload: { plataforma: "expo", token: movil },
    });
    assert.equal(reg.statusCode, 201);
    pushes.length = 0;

    const pdf1 = randomBytes(3000);
    const pdf2 = randomBytes(5000);
    const envia = await conClave("/clinics/v1/reports", token, {
      petId: petApi,
      sellado: b64(300),
      adjuntos: [pdf1.toString("base64"), pdf2.toString("base64")],
    });
    assert.equal(envia.statusCode, 201);
    assert.equal(envia.json().adjuntos, 2);
    // Un push sin contenido: solo que hay algo nuevo.
    assert.deepEqual(
      pushes.map((m) => [m.to, m.data.tipo, m.data.petId]),
      [[movil, "bandeja", petApi]],
    );
    assert.ok(!JSON.stringify(pushes).includes("Clínica"));

    const bandeja = await app.inject({ method: "GET", url: "/owners/v1/inbox", headers: { cookie: cookieDueno } });
    const m = bandeja.json().mensajes.find((x: { adjuntos: unknown[] }) => x.adjuntos.length);
    assert.deepEqual(
      m.adjuntos.map((a: { orden: number; bytes: number }) => [a.orden, a.bytes]),
      [
        [0, 3000],
        [1, 5000],
      ],
    );
    const url = `/owners/v1/inbox/${m.id}/attachments/${m.adjuntos[1].id}`;
    const baja = await app.inject({ method: "GET", url, headers: { cookie: cookieDueno } });
    assert.equal(baja.statusCode, 200);
    assert.deepEqual(baja.rawPayload, pdf2);
    assert.equal((await app.inject({ method: "GET", url })).statusCode, 401);

    // Demasiados adjuntos: no entra nada.
    const muchos = await conClave("/clinics/v1/reports", token, {
      petId: petApi,
      sellado: b64(100),
      adjuntos: [b64(10), b64(10), b64(10), b64(10)],
    });
    assert.equal(muchos.statusCode, 400);

    // Al borrar el mensaje se van también del almacén.
    const [{ s3_key }] = await sql`SELECT s3_key FROM inbox_adjuntos WHERE id = ${m.adjuntos[0].id}`;
    assert.ok(almacen.objetos.has(s3_key));
    const borra = await app.inject({ method: "DELETE", url: `/owners/v1/inbox/${m.id}`, headers: { cookie: cookieDueno } });
    assert.equal(borra.statusCode, 200);
    assert.ok(!almacen.objetos.has(s3_key));
  });

  it("un token push caducado se borra al primer envío", async () => {
    const movil = "ExponentPushToken[movil-del-dueno-api]";
    tokensCaducados.add(movil);
    await conClave("/clinics/v1/reports", token, { petId: petApi, sellado: b64(96) });
    tokensCaducados.delete(movil);
    const filas = await sql`SELECT 1 FROM owner_devices WHERE token = ${movil}`;
    assert.equal(filas.length, 0);
  });

  it("si el dueño retira el permiso, deja de poder enviarle", async () => {
    await sql`UPDATE grants SET revoked_at = now() WHERE pet_id = ${petApi}`;
    const envia = await conClave("/clinics/v1/reports", token, { petId: petApi, sellado: b64(96) });
    assert.equal(envia.statusCode, 404);
  });

  it("el directorio público dice de qué clínica es una clave de firma", async () => {
    const url = `/firmas/v1/${Buffer.from(firmaPub, "base64").toString("base64url")}`;
    const r = await app.inject({ method: "GET", url });
    assert.equal(r.statusCode, 200);
    assert.equal(r.json().clinica, "Clínica de prueba");
    assert.equal(r.json().retirada, null);
    const otra = await app.inject({ method: "GET", url: `/firmas/v1/${randomBytes(32).toString("base64url")}` });
    assert.equal(otra.statusCode, 404);
  });

  it("una clave retirada deja de valer al momento", async () => {
    const r = await app.inject({ method: "DELETE", url: `/clinics/v1/api-keys/${claveId}`, headers: { cookie } });
    assert.equal(r.statusCode, 200);
    assert.equal((await conClave("/clinics/v1/api/me")).statusCode, 401);
    // Su clave de firma sigue en el directorio, con fecha: lo firmado antes sigue valiendo.
    const dir = await app.inject({ method: "GET", url: `/firmas/v1/${Buffer.from(firmaPub, "base64").toString("base64url")}` });
    assert.notEqual(dir.json().retirada, null);
    // Lo que ya se envió sigue en el registro de la clínica.
    const registro = await app.inject({ method: "GET", url: "/clinics/v1/reports", headers: { cookie } });
    assert.equal(registro.json().envios.length, 3);
  });
});

describe("pasaporte de viaje", () => {
  let cookieDueno = "";
  let cookieOtro = "";
  let petP = "";

  const abrir = async (email: string, chip: string) => {
    const r = await app.inject({
      method: "POST",
      url: "/owners/v1/register",
      payload: { email, password: "clave-del-dueno-larga", pubKey: b64(), mascota: { identificador: { tipo: "iso", valor: chip }, nombre: "" } },
    });
    const v = await app.inject({
      method: "POST",
      url: "/owners/v1/login/verify",
      headers: { cookie: r.cookies.map((c) => `${c.name}=${c.value}`).join("; ") },
      payload: { codigo: ultimoCodigo(email) },
    });
    return { cookie: v.cookies.map((c) => `${c.name}=${c.value}`).join("; "), petId: r.json().mascota.petId as string };
  };

  before(async () => {
    const a = await abrir("dueno-pasaporte@correo.example", "724098100007020");
    cookieDueno = a.cookie;
    petP = a.petId;
    cookieOtro = (await abrir("otro-pasaporte@correo.example", "724098100007021")).cookie;
  });

  const pasaporte = (payload?: object, c = cookieDueno) =>
    app.inject({ method: payload ? "PUT" : "GET", url: `/owners/v1/pets/${petP}/passport`, headers: { cookie: c }, payload });

  it("se guarda cifrado y con versión: un cambio de otro navegador no se pisa", async () => {
    assert.deepEqual((await pasaporte()).json(), { sobre: null, version: 0 });
    const r1 = await pasaporte({ sobre: b64(300), version: 0 });
    assert.equal(r1.statusCode, 200);
    assert.equal(r1.json().version, 1);
    // Otro navegador que leyó la versión 0 no puede crear otro encima.
    assert.equal((await pasaporte({ sobre: b64(300), version: 0 })).statusCode, 409);
    const r2 = await pasaporte({ sobre: b64(310), version: 1 });
    assert.equal(r2.json().version, 2);
    assert.equal((await pasaporte({ sobre: b64(310), version: 1 })).statusCode, 409);
    assert.equal((await pasaporte()).json().version, 2);
  });

  it("nadie más lo lee ni lo escribe", async () => {
    assert.equal((await app.inject({ method: "GET", url: `/owners/v1/pets/${petP}/passport` })).statusCode, 401);
    assert.equal((await pasaporte(undefined, cookieOtro)).statusCode, 404);
    assert.equal((await pasaporte({ sobre: b64(10), version: 2 }, cookieOtro)).statusCode, 404);
  });

  it("el enlace de viaje se abre por la web del veterinario hasta que se retira", async () => {
    const id = randomUUID();
    const sobre = b64(400);
    const crea = await app.inject({
      method: "POST",
      url: `/owners/v1/pets/${petP}/shares`,
      headers: { cookie: cookieDueno },
      payload: { id, sobre, horas: 72 },
    });
    assert.equal(crea.statusCode, 201);
    const horas = (new Date(crea.json().caduca).getTime() - Date.now()) / 3600_000;
    assert.ok(horas > 71 && horas <= 72);

    const abre = await app.inject({ method: "GET", url: `/s/v1/${id}` });
    assert.equal(abre.statusCode, 200);
    assert.equal(abre.json().sobre, sobre);

    // Ni se repite el id, ni otro dueño lo retira.
    const repetido = await app.inject({
      method: "POST",
      url: `/owners/v1/pets/${petP}/shares`,
      headers: { cookie: cookieDueno },
      payload: { id, sobre, horas: 24 },
    });
    assert.equal(repetido.statusCode, 409);
    const ajeno = await app.inject({ method: "DELETE", url: `/owners/v1/pets/${petP}/shares/${id}`, headers: { cookie: cookieOtro } });
    assert.equal(ajeno.statusCode, 404);

    const lista = await app.inject({ method: "GET", url: `/owners/v1/pets/${petP}/shares`, headers: { cookie: cookieDueno } });
    assert.equal(lista.json().enlaces.length, 1);

    const retira = await app.inject({ method: "DELETE", url: `/owners/v1/pets/${petP}/shares/${id}`, headers: { cookie: cookieDueno } });
    assert.equal(retira.statusCode, 200);
    assert.equal((await app.inject({ method: "GET", url: `/s/v1/${id}` })).statusCode, 404);
  });

  it("solo admite 24 h, 72 h o 7 días", async () => {
    const r = await app.inject({
      method: "POST",
      url: `/owners/v1/pets/${petP}/shares`,
      headers: { cookie: cookieDueno },
      payload: { id: randomUUID(), sobre: b64(40), horas: 24 * 365 },
    });
    assert.equal(r.statusCode, 400);
  });
});

describe("segundo factor por SMS y la app móvil", () => {
  const CHIP_SMS = "724098100008080";
  const idSms = { tipo: "iso", valor: CHIP_SMS };
  const correo = "sms@correo.example";
  const clave = "clave-del-dueno-sms-larga";
  const telefono = "+34612345678";
  let cookieDueno = "";

  const galleta = (r: { cookies: { name: string; value: string }[] }) =>
    r.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const entrar = (headers: Record<string, string> = {}) =>
    app.inject({ method: "POST", url: "/owners/v1/login", headers, payload: { identificador: idSms, password: clave } });

  before(async () => {
    const r = await app.inject({
      method: "POST",
      url: "/owners/v1/register",
      payload: { email: correo, password: clave, pubKey: b64(), mascota: { identificador: idSms, nombre: "Tor" } },
    });
    const v = await app.inject({
      method: "POST",
      url: "/owners/v1/login/verify",
      headers: { cookie: galleta(r) },
      payload: { codigo: ultimoCodigo(correo) },
    });
    cookieDueno = galleta(v);
  });

  it("solo admite teléfonos de los prefijos permitidos", async () => {
    const r = await app.inject({
      method: "PUT",
      url: "/owners/v1/phone",
      headers: { cookie: cookieDueno },
      payload: { telefono: "+1 555 010 9999" },
    });
    assert.equal(r.statusCode, 400);
    assert.equal(r.json().motivo, "telefono");
  });

  it("el teléfono no cuenta hasta confirmarlo con el código del SMS", async () => {
    const r = await app.inject({
      method: "PUT",
      url: "/owners/v1/phone",
      headers: { cookie: cookieDueno },
      payload: { telefono: "+34 612 34 56 78" },
    });
    assert.equal(r.statusCode, 202);
    assert.match(ultimoSms(telefono), /^[2-9A-Z]{4}-[2-9A-Z]{4}$/);
    let me = (await app.inject({ method: "GET", url: "/owners/v1/me", headers: { cookie: cookieDueno } })).json();
    assert.equal(me.segundoFactor, "correo");
    assert.equal(me.telefono.verificado, false);
    assert.ok(!JSON.stringify(me).includes(telefono));

    // Elegir SMS sin confirmar no se puede.
    const antes = await app.inject({
      method: "PUT",
      url: "/owners/v1/second-factor",
      headers: { cookie: cookieDueno },
      payload: { canal: "sms" },
    });
    assert.equal(antes.statusCode, 409);

    const mal = await app.inject({
      method: "POST",
      url: "/owners/v1/phone/verify",
      headers: { cookie: cookieDueno },
      payload: { codigo: "ZZZZ-ZZZZ" },
    });
    assert.equal(mal.json().intentosRestantes, 4);
    const bien = await app.inject({
      method: "POST",
      url: "/owners/v1/phone/verify",
      headers: { cookie: cookieDueno },
      payload: { codigo: ultimoSms(telefono) },
    });
    assert.equal(bien.statusCode, 200);
    me = (await app.inject({ method: "GET", url: "/owners/v1/me", headers: { cookie: cookieDueno } })).json();
    assert.equal(me.segundoFactor, "sms");
    assert.equal(me.telefono.verificado, true);
  });

  it("con SMS elegido, el código de entrada llega por SMS y no por correo", async () => {
    const cartas = buzon.length;
    const r = await entrar();
    assert.equal(r.statusCode, 200);
    assert.equal(r.json().canal, "sms");
    assert.equal(r.json().otroCanal, "correo");
    assert.equal(buzon.length, cartas);
    const v = await app.inject({
      method: "POST",
      url: "/owners/v1/login/verify",
      headers: { cookie: galleta(r) },
      payload: { codigo: ultimoSms(telefono) },
    });
    assert.equal(v.statusCode, 200);
  });

  it("sin el móvil a mano, el código se puede pedir por correo", async () => {
    const r = await entrar();
    const pendiente = galleta(r);
    await sql`UPDATE owners SET email_code_sent_at = now() - interval '2 minutes' WHERE email = ${correo}`;
    const otro = await app.inject({
      method: "POST",
      url: "/owners/v1/login/resend",
      headers: { cookie: pendiente },
      payload: { canal: "correo" },
    });
    assert.equal(otro.statusCode, 202);
    assert.equal(otro.json().canal, "correo");
    const v = await app.inject({
      method: "POST",
      url: "/owners/v1/login/verify",
      headers: { cookie: galleta(otro) },
      payload: { codigo: ultimoCodigo(correo) },
    });
    assert.equal(v.statusCode, 200);
    // El código anterior, el del SMS, ya no vale.
    const viejo = await app.inject({
      method: "POST",
      url: "/owners/v1/login/verify",
      headers: { cookie: pendiente },
      payload: { codigo: ultimoSms(telefono) },
    });
    assert.equal(viejo.statusCode, 410);
  });

  it("agotado el cupo diario de SMS, el código sale por correo", async () => {
    const hoy = new Date().toISOString().slice(0, 10);
    await sql`UPDATE owners SET sms_dia = ${hoy}, sms_enviados = 99 WHERE email = ${correo}`;
    const r = await entrar();
    assert.equal(r.statusCode, 200);
    assert.equal(r.json().canal, "correo");
    await sql`UPDATE owners SET sms_enviados = 0 WHERE email = ${correo}`;
  });

  it("la app recibe el token en la respuesta y entra con Bearer, sin cookies", async () => {
    const app1 = { "x-bm-cliente": "app" };
    const r = await entrar(app1);
    assert.equal(r.statusCode, 200);
    assert.equal(r.cookies.length, 0);
    const pendiente = r.json().token;
    assert.match(pendiente, /^[A-Za-z0-9_-]{43}$/);
    // Con el token pendiente no se ve nada.
    const antes = await app.inject({ method: "GET", url: "/owners/v1/me", headers: { authorization: `Bearer ${pendiente}` } });
    assert.equal(antes.statusCode, 401);

    const v = await app.inject({
      method: "POST",
      url: "/owners/v1/login/verify",
      headers: { ...app1, authorization: `Bearer ${pendiente}` },
      payload: { codigo: ultimoSms(telefono) },
    });
    assert.equal(v.statusCode, 200);
    assert.equal(v.cookies.length, 0);
    const abierta = v.json().token;
    const me = await app.inject({ method: "GET", url: "/owners/v1/me", headers: { authorization: `Bearer ${abierta}` } });
    assert.equal(me.statusCode, 200);
    assert.equal(me.json().mascotas[0].perfil.nombre, "Tor");

    // El móvil se registra para avisos y se da de baja al salir.
    const movil = { plataforma: "expo", token: "ExponentPushToken[movil-de-tor-0001]" };
    const alta = await app.inject({
      method: "POST",
      url: "/owners/v1/devices",
      headers: { authorization: `Bearer ${abierta}` },
      payload: movil,
    });
    assert.equal(alta.statusCode, 201);
    const malo = await app.inject({
      method: "POST",
      url: "/owners/v1/devices",
      headers: { authorization: `Bearer ${abierta}` },
      payload: { plataforma: "expo", token: "no-es-un-token" },
    });
    assert.equal(malo.statusCode, 400);
    const baja = await app.inject({
      method: "DELETE",
      url: "/owners/v1/devices",
      headers: { authorization: `Bearer ${abierta}` },
      payload: movil,
    });
    assert.equal(baja.statusCode, 200);
    const salir = await app.inject({ method: "POST", url: "/owners/v1/logout", headers: { authorization: `Bearer ${abierta}` } });
    assert.equal(salir.statusCode, 200);
    const despues = await app.inject({ method: "GET", url: "/owners/v1/me", headers: { authorization: `Bearer ${abierta}` } });
    assert.equal(despues.statusCode, 401);
  });

  it("quitar el teléfono devuelve el código al correo", async () => {
    const r = await app.inject({ method: "DELETE", url: "/owners/v1/phone", headers: { cookie: cookieDueno } });
    assert.equal(r.json().segundoFactor, "correo");
    const e = await entrar();
    assert.equal(e.json().canal, "correo");
    assert.equal(e.json().otroCanal, null);
  });
});

describe("panel del operador: reclamaciones", () => {
  const OPS = "t".repeat(40);
  const conOps = (method: "GET" | "POST", url: string, payload?: object, t = OPS) =>
    app.inject({ method, url, headers: { authorization: `Bearer ${t}` }, payload });
  let impugnada = "";
  let enPlazo = "";
  let titularPet = "";

  before(async () => {
    const [cl] = await sql`SELECT id FROM clinics WHERE name = 'Clínica de prueba' LIMIT 1`;
    const [t] = await sql`INSERT INTO owners (email, password_hash, pub_key, email_verified_at)
      VALUES ('titular-ops@correo.example', 'x', ${randomBytes(32)}, now()) RETURNING id`;
    const [rc] = await sql`INSERT INTO owners (email, password_hash, pub_key, email_verified_at)
      VALUES ('reclamante-ops@correo.example', 'x', ${randomBytes(32)}, now()) RETURNING id`;
    const nuevaPet = async (ownerId: string, estado: string) =>
      (await sql`INSERT INTO pets (owner_pub_key, owner_id, estado, chip_pista)
        VALUES (${randomBytes(32)}, ${ownerId}, ${estado}, '4242') RETURNING id`)[0].id as string;
    titularPet = await nuevaPet(t.id, "congelada");
    const reclamantePet = await nuevaPet(rc.id, "pendiente");
    impugnada = (await sql`INSERT INTO reclamaciones (pet_id, reclamante_pet_id, clinic_id, estado, plazo)
      VALUES (${titularPet}, ${reclamantePet}, ${cl.id}, 'impugnada', now() + interval '3 days') RETURNING id`)[0].id;
    const otraTitular = await nuevaPet(t.id, "congelada");
    const otraReclamante = await nuevaPet(rc.id, "pendiente");
    enPlazo = (await sql`INSERT INTO reclamaciones (pet_id, reclamante_pet_id, clinic_id, estado, plazo)
      VALUES (${otraTitular}, ${otraReclamante}, ${cl.id}, 'abierta', now() + interval '10 days') RETURNING id`)[0].id;
  });

  after(() => {
    delete process.env.OPS_TOKEN;
  });

  it("sin OPS_TOKEN configurado, las rutas no existen", async () => {
    delete process.env.OPS_TOKEN;
    assert.equal((await conOps("GET", "/ops/v1/claims")).statusCode, 404);
  });

  it("con un token equivocado responde igual que si no existiera", async () => {
    process.env.OPS_TOKEN = OPS;
    assert.equal((await conOps("GET", "/ops/v1/claims", undefined, "x".repeat(40))).statusCode, 404);
    assert.equal((await app.inject({ method: "GET", url: "/ops/v1/claims" })).statusCode, 404);
  });

  it("lista la cola con lo que el operador necesita para decidir", async () => {
    process.env.OPS_TOKEN = OPS;
    const r = await conOps("GET", "/ops/v1/claims");
    assert.equal(r.statusCode, 200);
    const cola = r.json().reclamaciones;
    const i = cola.find((x: { id: string }) => x.id === impugnada);
    assert.equal(i.motivo, "impugnada");
    assert.equal(i.titular.correo, "titular-ops@correo.example");
    assert.equal(i.reclamante.correo, "reclamante-ops@correo.example");
    assert.equal(i.clinica.nombre, "Clínica de prueba");
    assert.equal(cola.find((x: { id: string }) => x.id === enPlazo).motivo, "en-plazo");
  });

  it("resuelve a favor del titular con una nota y avisa a las dos partes", async () => {
    process.env.OPS_TOKEN = OPS;
    const sinNota = await conOps("POST", `/ops/v1/claims/${impugnada}/resolve`, { aFavor: "titular", nota: "" });
    assert.equal(sinNota.statusCode, 400);

    const cartas = buzon.length;
    const r = await conOps("POST", `/ops/v1/claims/${impugnada}/resolve`, {
      aFavor: "titular",
      nota: "El titular aporta la factura de implantación del chip.",
    });
    assert.equal(r.statusCode, 200);
    assert.equal(r.json().estado, "a-favor-titular");
    const [p] = await sql`SELECT estado FROM pets WHERE id = ${titularPet}`;
    assert.equal(p.estado, "activa");
    const [rec] = await sql`SELECT nota_operador FROM reclamaciones WHERE id = ${impugnada}`;
    assert.match(rec.nota_operador, /factura/);
    const nuevas = buzon.slice(cartas).map((c) => c.para).sort();
    assert.deepEqual(nuevas, ["reclamante-ops@correo.example", "titular-ops@correo.example"]);

    const otra = await conOps("POST", `/ops/v1/claims/${impugnada}/resolve`, { aFavor: "reclamante", nota: "Segunda vez" });
    assert.equal(otra.statusCode, 404);
  });

  it("no adelanta una reclamación que sigue en plazo", async () => {
    process.env.OPS_TOKEN = OPS;
    const r = await conOps("POST", `/ops/v1/claims/${enPlazo}/resolve`, { aFavor: "reclamante", nota: "Demasiado pronto" });
    assert.equal(r.statusCode, 409);
    assert.equal(r.json().motivo, "en-plazo");
  });
});

describe("recuperar la contraseña", () => {
  /* La clave de recuperación del papel: un par Ed25519. El navegador la saca
     de la clave del dueño; aquí basta con un par cualquiera. */
  const parRecuperacion = () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const x = publicKey.export({ format: "jwk" }).x!;
    return { pub: Buffer.from(x, "base64url").toString("base64"), privateKey };
  };
  const firmar = (privateKey: ReturnType<typeof parRecuperacion>["privateKey"], id: string, reto: string) =>
    sign(null, Buffer.from(`bm:dueno:recuperacion:v1\n${id}\n${reto}`), privateKey).toString("base64");

  const CHIP_R = "724098100008001";
  const EMAIL_R = "recupera@correo.example";
  const papel = parRecuperacion();

  const empezar = async (chip = CHIP_R) => {
    const r = await app.inject({
      method: "POST",
      url: "/owners/v1/recovery",
      payload: { identificador: { tipo: "iso", valor: chip } },
    });
    assert.equal(r.statusCode, 201);
    return r.json() as { recuperacionId: string; reto: string };
  };
  const probar = (id: string, pub: string, firma: string) =>
    app.inject({ method: "POST", url: "/owners/v1/recovery/proof", payload: { recuperacionId: id, clave: pub, firma } });
  const terminar = (recuperacionId: string, codigo: string, password: string) =>
    app.inject({ method: "POST", url: "/owners/v1/recovery/finish", payload: { recuperacionId, codigo, password } });
  const entrar = (password: string) =>
    app.inject({
      method: "POST",
      url: "/owners/v1/login",
      payload: { identificador: { tipo: "iso", valor: CHIP_R }, password },
    });
  const alta = async (email: string, chip: string, recuperacionPub?: string) => {
    const r = await app.inject({
      method: "POST",
      url: "/owners/v1/register",
      payload: {
        email,
        password: "la-clave-de-antes-larga",
        pubKey: b64(),
        ...(recuperacionPub ? { recuperacionPub } : {}),
        mascota: { identificador: { tipo: "iso", valor: chip }, nombre: "" },
      },
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
    return v.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  };

  let sesionVieja = "";

  it("el alta guarda la clave de recuperación y /me lo dice", async () => {
    sesionVieja = await alta(EMAIL_R, CHIP_R, papel.pub);
    const me = await app.inject({ method: "GET", url: "/owners/v1/me", headers: { cookie: sesionVieja } });
    assert.equal(me.json().recuperacion, true);
  });

  it("un chip sin cuenta también recibe reto, y ninguna firma lo abre", async () => {
    const { recuperacionId, reto } = await empezar(CHIP_INEXISTENTE);
    assert.equal(Buffer.from(reto, "base64url").length, 32);
    const r = await probar(recuperacionId, papel.pub, firmar(papel.privateKey, recuperacionId, reto));
    assert.equal(r.statusCode, 401);
    assert.equal(r.json().motivo, "papel");
  });

  it("sin el papel no hay código: otra clave o la firma de otro reto no valen", async () => {
    const otro = parRecuperacion();
    const cartas = buzon.length;
    const a = await empezar();
    assert.equal((await probar(a.recuperacionId, otro.pub, firmar(otro.privateKey, a.recuperacionId, a.reto))).statusCode, 401);
    const b = await empezar();
    // La firma de la recuperación «a» no sirve para la «b».
    assert.equal((await probar(b.recuperacionId, papel.pub, firmar(papel.privateKey, a.recuperacionId, a.reto))).statusCode, 401);
    assert.equal(buzon.length, cartas, "no sale ningún código");
  });

  it("cinco pruebas fallidas agotan la recuperación", async () => {
    const otro = parRecuperacion();
    const { recuperacionId, reto } = await empezar();
    for (let i = 0; i < 5; i++)
      assert.equal((await probar(recuperacionId, otro.pub, firmar(otro.privateKey, recuperacionId, reto))).statusCode, 401);
    const r = await probar(recuperacionId, papel.pub, firmar(papel.privateKey, recuperacionId, reto));
    assert.equal(r.statusCode, 410);
  });

  it("papel y código: contraseña nueva, sesiones cerradas y aviso al correo", async () => {
    const { recuperacionId, reto } = await empezar();
    // Sin pasar la prueba del papel no se puede terminar.
    assert.equal((await terminar(recuperacionId, "AAAA-AAAA", "la-clave-nueva-larga")).statusCode, 410);

    const p = await probar(recuperacionId, papel.pub, firmar(papel.privateKey, recuperacionId, reto));
    assert.equal(p.statusCode, 200);
    assert.equal(p.json().canal, "correo");
    assert.match(p.json().destino, /^re•+@correo\.example$/);

    const mal = await terminar(recuperacionId, "AAAA-AAAA", "la-clave-nueva-larga");
    assert.equal(mal.statusCode, 400);
    assert.equal(mal.json().intentosRestantes, 4);

    const bien = await terminar(recuperacionId, ultimoCodigo(EMAIL_R), "la-clave-nueva-larga");
    assert.equal(bien.statusCode, 200);
    assert.match([...buzon].reverse().find((c) => c.para === EMAIL_R)!.asunto, /ha cambiado/);

    // La sesión de antes ya no vale, la contraseña vieja tampoco, la nueva sí.
    const me = await app.inject({ method: "GET", url: "/owners/v1/me", headers: { cookie: sesionVieja } });
    assert.equal(me.statusCode, 401);
    assert.equal((await entrar("la-clave-de-antes-larga")).statusCode, 401);
    assert.equal((await entrar("la-clave-nueva-larga")).statusCode, 200);

    // Y la recuperación no se reutiliza.
    assert.equal((await terminar(recuperacionId, "AAAA-AAAA", "otra-clave-mas-larga")).statusCode, 410);
  });

  it("las cuentas de antes guardan su clave de recuperación una sola vez", async () => {
    const c = await alta("sin-papel-guardado@correo.example", "724098100008002");
    const me = await app.inject({ method: "GET", url: "/owners/v1/me", headers: { cookie: c } });
    assert.equal(me.json().recuperacion, false);

    const clave = parRecuperacion().pub;
    const put = (k: string, headers: Record<string, string> = { cookie: c }) =>
      app.inject({ method: "PUT", url: "/owners/v1/recovery-key", headers, payload: { clave: k } });
    assert.equal((await put(clave)).statusCode, 200);
    // Una vez puesta no se cambia: una sesión robada no puede cambiar el papel.
    const otra = await put(parRecuperacion().pub);
    assert.equal(otra.statusCode, 409);
    assert.equal(otra.json().motivo, "ya-guardada");
    assert.equal((await put(clave, {})).statusCode, 401);
  });

  it("miembro de clínica: código al correo, contraseña nueva y fuera de la consola", async () => {
    const EMAIL_M = "admin@prueba.example";
    const cartas = buzon.length;
    const r = await app.inject({ method: "POST", url: "/clinics/v1/recovery", payload: { email: EMAIL_M } });
    assert.equal(r.statusCode, 202);
    await new Promise((ok) => setImmediate(ok));
    assert.equal(buzon.length, cartas + 1);

    // Pedirla otra vez dentro del minuto devuelve la misma, sin otro correo.
    const otra = await app.inject({ method: "POST", url: "/clinics/v1/recovery", payload: { email: EMAIL_M } });
    assert.equal(otra.json().recuperacionId, r.json().recuperacionId);
    assert.equal(buzon.length, cartas + 1);

    const hecho = await app.inject({
      method: "POST",
      url: "/clinics/v1/recovery/finish",
      payload: { recuperacionId: r.json().recuperacionId, codigo: ultimoCodigo(EMAIL_M), password: "clave-nueva-de-la-clinica" },
    });
    assert.equal(hecho.statusCode, 200);

    const me = await app.inject({ method: "GET", url: "/clinics/v1/me", headers: { cookie } });
    assert.equal(me.statusCode, 401);
    const login = (password: string) =>
      app.inject({ method: "POST", url: "/clinics/v1/login", payload: { email: EMAIL_M, password } });
    assert.equal((await login("una-clave-bastante-larga")).statusCode, 401);
    const nuevo = await login("clave-nueva-de-la-clinica");
    assert.equal(nuevo.statusCode, 200);
    cookie = nuevo.cookies[0].name + "=" + nuevo.cookies[0].value;
  });

  it("un correo sin cuenta responde igual y ningún código lo abre", async () => {
    const cartas = buzon.length;
    const r = await app.inject({ method: "POST", url: "/clinics/v1/recovery", payload: { email: "nadie@prueba.example" } });
    assert.equal(r.statusCode, 202);
    assert.match(r.json().recuperacionId, /^[0-9a-f-]{36}$/);
    await new Promise((ok) => setImmediate(ok));
    assert.equal(buzon.length, cartas);
    const f = await app.inject({
      method: "POST",
      url: "/clinics/v1/recovery/finish",
      payload: { recuperacionId: r.json().recuperacionId, codigo: "AAAA-AAAA", password: "clave-nueva-de-la-clinica" },
    });
    assert.equal(f.statusCode, 400);
    assert.equal(f.json().motivo, "incorrecto");
  });
});

describe("cuenta del dueño: cambiar la contraseña y borrarla", () => {
  const CHIP = "724098100006666";
  const id = { tipo: "iso", valor: CHIP };
  const correo = "se-va@correo.example";
  const galleta = (r: { cookies: { name: string; value: string }[] }) =>
    r.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  let petId = "";

  async function entrar(password: string) {
    const r = await app.inject({ method: "POST", url: "/owners/v1/login", payload: { identificador: id, password } });
    if (r.statusCode !== 200) return { estado: r.statusCode, cookie: "" };
    const v = await app.inject({
      method: "POST",
      url: "/owners/v1/login/verify",
      headers: { cookie: galleta(r) },
      payload: { codigo: ultimoCodigo(correo) },
    });
    return { estado: v.statusCode, cookie: galleta(v) };
  }
  const yo = (cookie: string) => app.inject({ method: "GET", url: "/owners/v1/me", headers: { cookie } });

  before(async () => {
    const r = await app.inject({
      method: "POST",
      url: "/owners/v1/register",
      payload: { email: correo, password: "clave-de-antes-larga", pubKey: b64(), mascota: { identificador: id, nombre: "Coco" } },
    });
    petId = r.json().mascota.petId;
    await app.inject({
      method: "POST",
      url: "/owners/v1/login/verify",
      headers: { cookie: galleta(r) },
      payload: { codigo: ultimoCodigo(correo) },
    });
  });

  it("cambiar la contraseña exige la actual y cierra las demás sesiones", async () => {
    const aqui = await entrar("clave-de-antes-larga");
    const alli = await entrar("clave-de-antes-larga");
    const cambiar = (cookie: string, actual: string) =>
      app.inject({
        method: "POST",
        url: "/owners/v1/password",
        headers: { cookie },
        payload: { actual, nueva: "clave-de-ahora-larga" },
      });

    assert.equal((await cambiar("", "clave-de-antes-larga")).statusCode, 401);
    assert.equal((await cambiar(aqui.cookie, "no-es-la-clave")).statusCode, 403);
    const corta = await app.inject({
      method: "POST",
      url: "/owners/v1/password",
      headers: { cookie: aqui.cookie },
      payload: { actual: "clave-de-antes-larga", nueva: "corta" },
    });
    assert.equal(corta.statusCode, 400);

    const cartas = buzon.length;
    assert.equal((await cambiar(aqui.cookie, "clave-de-antes-larga")).statusCode, 200);
    // Esta sesión sigue; la del otro móvil, no.
    assert.equal((await yo(aqui.cookie)).statusCode, 200);
    assert.equal((await yo(alli.cookie)).statusCode, 401);
    await new Promise((ok) => setImmediate(ok));
    assert.ok(buzon.slice(cartas).some((c) => c.para === correo && /contraseña/.test(c.asunto)));
    assert.equal((await entrar("clave-de-antes-larga")).estado, 401);
    assert.equal((await entrar("clave-de-ahora-larga")).estado, 200);
  });

  it("borrar la cuenta se lleva sus mascotas y deja el chip libre", async () => {
    const { cookie } = await entrar("clave-de-ahora-larga");
    // Algo de todo lo que cuelga de la mascota: perfil con foto, ficha, bandeja con adjunto.
    almacen.objetos.set("fotos/coco", Buffer.from("foto"));
    almacen.objetos.set("adjuntos/coco", Buffer.from("pdf"));
    await sql`UPDATE pet_profiles SET foto_key = 'fotos/coco' WHERE pet_id = ${petId}`;
    await sql`INSERT INTO blobs (pet_id, kind, sealed) VALUES (${petId}, 'record', ${randomBytes(40)})`;
    const [m] = await sql`INSERT INTO inbox (pet_id, sealed) VALUES (${petId}, ${randomBytes(40)}) RETURNING id`;
    await sql`INSERT INTO inbox_adjuntos (inbox_id, orden, bytes, s3_key) VALUES (${m.id}, 0, 3, 'adjuntos/coco')`;

    const borrar = (password: string, c = cookie) =>
      app.inject({ method: "DELETE", url: "/owners/v1/me", headers: { cookie: c }, payload: { password } });
    assert.equal((await borrar("no-es-la-clave")).statusCode, 403);
    assert.equal((await yo(cookie)).statusCode, 200);

    const r = await borrar("clave-de-ahora-larga");
    assert.equal(r.statusCode, 200);
    assert.equal((await yo(cookie)).statusCode, 401);
    assert.equal((await sql`SELECT count(*)::int AS n FROM owners WHERE email = ${correo}`)[0].n, 0);
    for (const tabla of ["pets", "pet_profiles", "blobs", "inbox", "pet_identifiers"])
      assert.equal(
        (await sql.unsafe(`SELECT count(*)::int AS n FROM ${tabla} WHERE ${tabla === "pets" ? "id" : "pet_id"} = $1`, [petId]))[0].n,
        0,
        tabla,
      );
    assert.equal(almacen.objetos.has("fotos/coco"), false);
    assert.equal(almacen.objetos.has("adjuntos/coco"), false);
    assert.equal((await entrar("clave-de-ahora-larga")).estado, 401);

    // El chip queda libre: otra persona puede darlo de alta.
    const otra = await app.inject({
      method: "POST",
      url: "/owners/v1/register",
      payload: { email: "nueva@correo.example", password: "clave-de-la-nueva-larga", pubKey: b64(), mascota: { identificador: id, nombre: "" } },
    });
    assert.equal(otra.statusCode, 201);
  });
});
