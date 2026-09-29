import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aCalendario, evaluarViaje, recordatoriosViaje, type RegistroEvaluable } from "@barkandmeow/schema";

/* Las reglas del viaje, sin red ni base: solo fechas. */

const base = { version: 1 as const, chip: "724098100001234", clinica: "", veterinario: "" };
const rabia = (fecha: string, validaHasta: string, origen: "certificado" | "declarado" = "certificado"): RegistroEvaluable => ({
  origen,
  registro: { ...base, tipo: "vacuna", enfermedad: "rabia", nombre: "", producto: "Rabisin", lote: "L1", fecha, validaHasta },
});
const tenia = (fecha: string, hora: string): RegistroEvaluable => ({
  origen: "certificado",
  registro: { ...base, tipo: "desparasitacion", contra: "equinococo", producto: "Praziquantel", fecha, hora },
});
const perro = { especie: "dog" as const, chip: "724098100001234", numeroPasaporte: "ES-123" };
const estado = (r: ReturnType<typeof evaluarViaje>, clave: string) => r.find((x) => x.clave === clave)?.estado;

describe("requisitos de viaje", () => {
  it("dentro de la UE basta chip, pasaporte y rabia vigente", () => {
    const r = evaluarViaje(perro, [rabia("2026-01-10", "2027-01-10")], "ue", new Date("2026-10-15T10:00"));
    assert.deepEqual(r.map((x) => x.estado), ["ok", "ok", "ok"]);
    assert.equal(r.find((x) => x.clave === "rabia")?.origen, "certificado");
  });

  it("una vacuna que caduca antes de llegar no vale", () => {
    const r = evaluarViaje(perro, [rabia("2025-10-01", "2026-10-01")], "ue", new Date("2026-10-15T10:00"));
    assert.equal(estado(r, "rabia"), "falta");
  });

  it("avisa de los 21 días si la vacuna es de hace menos", () => {
    const r = evaluarViaje(perro, [rabia("2026-10-01", "2027-10-01")], "ue", new Date("2026-10-15T10:00"));
    assert.equal(estado(r, "rabia"), "aviso");
    assert.match(r.find((x) => x.clave === "rabia")!.detalle, /22\/10\/2026/);
  });

  it("lo certificado gana a lo declarado", () => {
    const r = evaluarViaje(
      perro,
      [rabia("2026-05-01", "2027-05-01", "declarado"), rabia("2026-02-01", "2027-02-01", "certificado")],
      "ue",
      new Date("2026-10-15T10:00"),
    );
    assert.equal(r.find((x) => x.clave === "rabia")?.origen, "certificado");
  });

  it("la tenia cuenta si se dio entre 120 y 24 horas antes de llegar", () => {
    const llegada = new Date("2026-10-15T10:00");
    const vacuna = rabia("2026-01-10", "2027-01-10");
    assert.equal(estado(evaluarViaje(perro, [vacuna, tenia("2026-10-12", "09:00")], "ue-equinococo", llegada), "equinococo"), "ok");
    // A 23 horas: demasiado tarde. A 6 días: demasiado pronto.
    assert.equal(estado(evaluarViaje(perro, [vacuna, tenia("2026-10-14", "11:00")], "ue-equinococo", llegada), "equinococo"), "falta");
    assert.equal(estado(evaluarViaje(perro, [vacuna, tenia("2026-10-09", "09:00")], "gb", llegada), "equinococo"), "falta");
    // A los gatos no se les pide.
    const gato = evaluarViaje({ ...perro, especie: "cat" }, [vacuna], "ue-equinococo", llegada);
    assert.equal(estado(gato, "equinococo"), undefined);
  });

  it("para otras especies no inventa reglas", () => {
    const r = evaluarViaje({ ...perro, especie: "rabbit" }, [], "ue", new Date("2026-10-15T10:00"));
    assert.deepEqual(r.map((x) => x.clave), ["especie"]);
  });
});

describe("recordatorios del viaje", () => {
  const ahora = new Date("2026-09-29T12:00");

  it("avisa de renovar la rabia 30 días antes y de la franja de la tenia", () => {
    const r = recordatoriosViaje(perro, [rabia("2026-01-10", "2027-01-10")], "ue-equinococo", new Date("2026-10-15T10:00"), "Kira", ahora);
    const renovar = r.find((x) => x.clave === "rabia-renovar")!;
    assert.equal(renovar.inicio.toDateString(), new Date("2026-12-11T00:00").toDateString());
    const tenia = r.find((x) => x.clave === "equinococo")!;
    assert.equal(tenia.inicio.getTime(), new Date("2026-10-10T10:00").getTime());
    assert.equal(tenia.fin!.getTime(), new Date("2026-10-14T10:00").getTime());
    assert.ok(r.some((x) => x.clave === "viaje"));
  });

  it("si la tenia ya está dada a tiempo, no la recuerda", () => {
    const r = recordatoriosViaje(perro, [rabia("2026-01-10", "2027-01-10"), tenia("2026-10-12", "09:00")], "ue-equinococo", new Date("2026-10-15T10:00"), "Kira", ahora);
    assert.equal(r.find((x) => x.clave === "equinococo"), undefined);
  });

  it("el calendario es iCalendar válido: CRLF, líneas de 75 octetos y texto escapado", () => {
    const r = recordatoriosViaje(perro, [rabia("2026-01-10", "2027-01-10")], "ue-equinococo", new Date("2026-10-15T10:00"), "Kira, la de casa", ahora);
    const ics = aCalendario(r, ahora);
    assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.endsWith("END:VCALENDAR\r\n"));
    assert.equal(ics.split("BEGIN:VEVENT").length - 1, r.length);
    for (const linea of ics.split("\r\n")) assert.ok(new TextEncoder().encode(linea).length <= 75, linea);
    assert.match(ics.replace(/\r\n /g, ""), /Kira\\, la de casa/);
    assert.match(ics, /DTSTART;VALUE=DATE:20261211/);
  });
});
