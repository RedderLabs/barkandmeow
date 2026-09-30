/* Provet Cloud contra un servidor falso con las formas de su OpenAPI 0.1
   (openapi-schema-01.json): listas {count, next, previous, results},
   filtros campo__gt y OAuth 2.0 client_credentials. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FuenteProvet } from "../src/fuentes/provet.ts";
import { httpFalso } from "./falso.ts";

process.env.CONECTOR_ZONA = "Europe/Madrid";
const AHORA = Date.parse("2026-09-30T10:00:00Z");
const BASE = "https://provetcloud.com/54321";
const API = `${BASE}/api/0.1`;
const pagina = (results: object[], next: string | null = null) => ({ json: { count: results.length, next, previous: null, results } });

function servidor() {
  const http = httpFalso([
    (l) =>
      l.url.pathname === "/54321/oauth2/token/"
        ? { json: { access_token: "abc", expires_in: 36000, token_type: "Bearer", scope: "restapi" } }
        : undefined,
    (l) => {
      if (l.url.pathname !== "/54321/api/0.1/consultation_items/medicine/") return;
      const q = l.url.searchParams;
      if (q.get("vaccination__is") === "true") {
        if (q.get("page") === "2")
          return pagina([{ url: `${API}/consultation_items/medicine/12/`, name: "Nobivac DHPPi", batch_number: "B9", vaccination: true, vaccination_disease: "Moquillo", used: "2026-09-28T08:00:00Z", patient: `${API}/patient/2/` }]);
        return pagina(
          [{ url: `${API}/consultation_items/medicine/11/`, name: "Rabisin", batch_number: "L2231", vaccination: true, vaccination_disease: "Rabies", used: "2026-09-29T08:30:00Z", patient: `${API}/patient/1/` }],
          `${API}/consultation_items/medicine/?vaccination__is=true&page=2`,
        );
      }
      if (q.get("consultation__is") === "77")
        return pagina([{ name: "Meloxicam 1,5 mg/ml", quantity: 10, unit: "ml", vaccination: false }]);
      return pagina([]);
    },
    (l) => {
      if (l.url.pathname === "/54321/api/0.1/patient/1/") return { json: { id: 1, name: "Luna", microchip: "724098060143113" } };
      if (l.url.pathname === "/54321/api/0.1/patient/2/") return { json: { id: 2, name: "Coco", microchip: "941000024680135" } };
    },
    (l) => {
      if (l.url.pathname === "/54321/api/0.1/consultation/")
        return pagina([
          { id: 77, url: `${API}/consultation/77/`, patients: [`${API}/patient/1/`], complaint: "Cojera", started: "2026-09-29T15:00:00Z", ended: "2026-09-29T15:40:00Z" },
          { id: 78, url: `${API}/consultation/78/`, patients: [`${API}/patient/2/`], complaint: "", started: "2026-09-29T16:00:00Z", ended: "2026-09-29T16:10:00Z" },
        ]);
      if (l.url.pathname === "/54321/api/0.1/consultation/77/consultationdiagnosis/")
        return pagina([{ name: "Artrosis", type: 1 }]);
      if (l.url.pathname === "/54321/api/0.1/consultation/77/consultationnote/")
        return pagina([{ text: "Dolor a la flexión del codo derecho.", type: 0 }]);
      if (/\/consultation\/78\//.test(l.url.pathname)) return pagina([]);
    },
  ]);
  return http;
}

const config = { url: BASE, clientId: "id", clientSecret: "secreto", diasIniciales: 30, reglas: { validez: [{ patron: "rabisin", meses: 36 }] } };

test("Provet: OAuth, páginas por next, vacunas con lote y consultas cerradas", async () => {
  const http = servidor();
  const { hallazgos, cursor } = await new FuenteProvet(config, http, () => AHORA).leer(undefined);

  const tok = http.llamadas[0];
  assert.equal(tok.metodo, "POST");
  assert.equal(new URLSearchParams(tok.cuerpo).get("grant_type"), "client_credentials");
  assert.equal(new URLSearchParams(tok.cuerpo).get("scope"), "restapi");
  assert.equal(http.llamadas.filter((l) => l.url.pathname.endsWith("/oauth2/token/")).length, 1);
  assert.ok(http.llamadas.slice(1).every((l) => l.auth === "Bearer abc"));

  // Filtro de fecha en el formato de Provet, con el + codificado al enviarlo.
  const vac = http.llamadas.find((l) => l.url.searchParams.get("vaccination__is") === "true")!;
  assert.equal(vac.url.searchParams.get("modified__lte"), "2026-09-30 10:00+00:00");
  assert.match(vac.url.search, /modified__lte=2026-09-30\+10%3A00%2B00%3A00/);
  assert.deepEqual(cursor, { vacunas: "2026-09-30T10:00:00.000Z", consultas: "2026-09-30T10:00:00.000Z" });

  const porRef = Object.fromEntries(hallazgos.map((h) => [h.ref, h.registro]));
  // Rabisin: sin fecha de revacunación en Provet, la pone la regla de la clínica (36 meses).
  assert.deepEqual(porRef[`provet:medicine:${API}/consultation_items/medicine/11/`], {
    version: 1, tipo: "vacuna", chip: "724098060143113", fecha: "2026-09-29", veterinario: "",
    enfermedad: "rabia", nombre: "Rabies", producto: "Rabisin", lote: "L2231", validaHasta: "2029-09-29",
  });
  // Sin regla: informe, con el lote en el tratamiento.
  const dhppi = porRef[`provet:medicine:${API}/consultation_items/medicine/12/`] as { tipo: string; tratamiento: string };
  assert.equal(dhppi.tipo, "informe");
  assert.match(dhppi.tratamiento, /Lote: B9/);

  // La 78 no tiene nada que contar: no se envía.
  assert.deepEqual(porRef[`provet:consultation:77:${API}/patient/1/`], {
    version: 1, tipo: "informe", chip: "724098060143113", fecha: "2026-09-29",
    motivo: "Cojera", diagnostico: "Artrosis", tratamiento: "Meloxicam 1,5 mg/ml · 10 ml",
    observaciones: "Dolor a la flexión del codo derecho.",
  });
  assert.equal(hallazgos.length, 3);
  // El paciente se pide una vez aunque salga en vacuna y consulta.
  assert.equal(http.llamadas.filter((l) => l.url.pathname === "/54321/api/0.1/patient/1/").length, 1);
});

test("Provet: sin credenciales no arranca; con el token antiguo usa «Token»", async () => {
  assert.throws(() => new FuenteProvet({ url: BASE, diasIniciales: 1, reglas: {} }), /PROVET_CLIENT_ID/);
  const http = servidor();
  await new FuenteProvet({ url: BASE, tokenAntiguo: "viejo", diasIniciales: 1, reglas: {} }, http, () => AHORA).leer(undefined);
  assert.ok(http.llamadas.every((l) => l.auth === "Token viejo"));
});
