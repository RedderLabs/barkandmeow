/* ezyVet contra un servidor falso con las formas de la documentación:
   {"meta": {...}, "items": [{"vaccination": {...}}]}, filtros en JSON y
   token por client_credentials. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FuenteEzyVet } from "../src/fuentes/ezyvet.ts";
import { httpFalso, type Llamada } from "./falso.ts";

process.env.CONECTOR_ZONA = "Europe/Madrid";
const AHORA = Date.parse("2026-09-30T10:00:00Z");
const s = (iso: string) => String(Date.parse(iso) / 1000);
const lista = (clave: string, filas: object[], pagina = 1, total = 1) => ({
  json: {
    meta: { timestamp: "0", items_page: String(pagina), items_page_total: String(total), items_page_size: "200", items_total: String(filas.length) },
    items: filas.map((f) => ({ [clave]: f })),
    messages: [],
  },
});
const filtro = (l: Llamada, k: string) => JSON.parse(l.url.searchParams.get(k) ?? "null");

function servidor(o: { tokenFalla401?: boolean; limite429?: boolean } = {}) {
  let tokens = 0;
  let vistos401 = false;
  let vistos429 = false;
  const http = httpFalso([
    (l) => {
      if (l.url.pathname !== "/v1/oauth/access_token") return;
      tokens++;
      return { json: { access_token: `tok${tokens}`, token_type: "Bearer", expires_in: 43200 } };
    },
    (l) => {
      if (o.tokenFalla401 && !vistos401 && l.url.pathname === "/v1/vaccination") {
        vistos401 = true;
        return { estado: 401, json: { messages: [{ level: "error", text: "access token" }] } };
      }
      if (o.limite429 && !vistos429 && l.url.pathname === "/v1/vaccination") {
        vistos429 = true;
        return { estado: 429, cabeceras: { "retry-after": "2" } };
      }
    },
    (l) => {
      if (l.url.pathname !== "/v1/vaccination") return;
      const pagina = Number(l.url.searchParams.get("page"));
      if (pagina === 1)
        return lista(
          "vaccination",
          [
            {
              id: "501", active: "1", consult_id: "900", product_id: "70", description: "Rabia",
              date_of_administration: s("2026-09-29T09:00:00Z"), date_of_next_administration: s("2029-09-29T09:00:00Z"),
            },
            { id: "502", active: "0", consult_id: "900", product_id: "70", date_of_administration: s("2026-09-29T09:00:00Z") },
          ],
          1,
          2,
        );
      return lista(
        "vaccination",
        [{ id: "503", active: "1", consult_id: "901", product_id: "71", date_of_administration: s("2026-09-28T09:00:00Z"), date_of_next_administration: "0" }],
        2,
        2,
      );
    },
    (l) => {
      if (l.url.pathname !== "/v1/consult") return;
      if (filtro(l, "id")) return lista("consult", [{ id: "901", active: "1", animal_id: "31", date: s("2026-09-28T09:00:00Z"), description: "" }]);
      return lista("consult", [
        { id: "900", active: "1", animal_id: "30", date: s("2026-09-28T16:00:00Z"), description: "Revisión anual" },
        { id: "902", active: "1", animal_id: "30", date: s("2026-09-28T17:00:00Z"), description: "" },
      ]);
    },
    (l) => {
      if (l.url.pathname !== "/v1/animal") return;
      return lista("animal", [
        { id: "30", microchip_number: "724 0980 6014 3113" },
        { id: "31", microchip_number: "941000024680135" },
      ]);
    },
    (l) => {
      if (l.url.pathname !== "/v1/product") return;
      return lista("product", [
        { id: "70", name: "Rabisin" },
        { id: "71", name: "Nobivac DHPPi" },
      ]);
    },
    (l) => {
      if (l.url.pathname !== "/v1/history") return;
      return lista("history", [
        { id: "2", active: "1", consult_id: "900", comments: "Buen estado general.", timestamp: "20" },
        { id: "1", active: "1", consult_id: "900", comments: "Peso 21 kg.", timestamp: "10" },
      ]);
    },
  ]);
  return { http, tokens: () => tokens };
}

const config = {
  url: "https://api.trial.ezyvet.com",
  partnerId: "p",
  clientId: "c",
  clientSecret: "s",
  scope: "read-animal,read-consult,read-vaccination,read-history,read-product",
  diasIniciales: 30,
  esperaHoras: 24,
  reglas: {},
};

test("ezyVet: token, páginas, vacunas por su consulta y consultas asentadas", async () => {
  const { http, tokens } = servidor();
  const f = new FuenteEzyVet(config, http, () => AHORA);
  const { hallazgos, cursor } = await f.leer(undefined);

  // El token se pide una vez, con client_credentials y los campos de la documentación.
  assert.equal(tokens(), 1);
  const pet = JSON.parse(http.llamadas[0].cuerpo);
  assert.deepEqual(Object.keys(pet).sort(), ["client_id", "client_secret", "grant_type", "partner_id", "scope"]);
  assert.equal(pet.grant_type, "client_credentials");
  assert.ok(http.llamadas.slice(1).every((l) => l.auth === "Bearer tok1"));

  // Filtros en JSON: vacunas por modified_at, consultas por fecha con 24 h de espera.
  const vac = http.llamadas.find((l) => l.url.pathname === "/v1/vaccination")!;
  assert.equal(filtro(vac, "modified_at").lte, AHORA / 1000);
  assert.equal(vac.url.searchParams.get("limit"), "200");
  const cons = http.llamadas.find((l) => l.url.pathname === "/v1/consult" && !filtro(l, "id"))!;
  assert.equal(filtro(cons, "date").lte, AHORA / 1000 - 24 * 3600);
  assert.deepEqual(cursor, { vacunas: AHORA / 1000, consultas: AHORA / 1000 - 24 * 3600 });

  const porRef = Object.fromEntries(hallazgos.map((h) => [h.ref, h.registro]));
  // Inactiva (502) fuera; consulta sin descripción ni historial (902) fuera.
  assert.deepEqual(Object.keys(porRef).sort(), ["ezyvet:consult:900", "ezyvet:vaccination:501", "ezyvet:vaccination:503"]);

  assert.deepEqual(porRef["ezyvet:vaccination:501"], {
    version: 1, tipo: "vacuna", chip: "724098060143113", fecha: "2026-09-29", veterinario: "",
    enfermedad: "rabia", nombre: "Rabia", producto: "Rabisin", lote: "", validaHasta: "2029-09-29",
  });
  // Sin próxima administración ni regla: informe, no certificado.
  assert.equal(porRef["ezyvet:vaccination:503"].tipo, "informe");
  assert.equal(porRef["ezyvet:vaccination:503"].chip, "941000024680135");
  // Historial en orden de timestamp.
  const inf = porRef["ezyvet:consult:900"] as { motivo: string; observaciones: string };
  assert.equal(inf.motivo, "Revisión anual");
  assert.equal(inf.observaciones, "Peso 21 kg.\n\nBuen estado general.");
});

test("ezyVet: con cursor, lee desde él con solape", async () => {
  const { http } = servidor();
  await new FuenteEzyVet(config, http, () => AHORA).leer({ vacunas: 1_790_000_000, consultas: 1_789_000_000 });
  const vac = http.llamadas.find((l) => l.url.pathname === "/v1/vaccination")!;
  assert.equal(filtro(vac, "modified_at").gt, 1_790_000_000 - 300);
});

test("ezyVet: un 401 renueva el token y un 429 espera", async () => {
  const a = servidor({ tokenFalla401: true });
  await new FuenteEzyVet(config, a.http, () => AHORA).leer(undefined);
  assert.equal(a.tokens(), 2);

  const b = servidor({ limite429: true });
  await new FuenteEzyVet(config, b.http, () => AHORA).leer(undefined);
  assert.deepEqual(b.http.dormido, [2000]);
});
