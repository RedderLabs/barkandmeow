import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CRONICAS,
  FICHA_VACIA,
  REACCIONES,
  edadTexto,
  fichaBody,
  fichaConSalud,
  fichaDueno,
  fichaLista,
  placaBody,
  resumenDeFicha,
} from "@barkandmeow/schema";

/* La ficha de salud del dueño: lo que se guarda y lo que sale de ella hacia
   la web del veterinario. Son funciones puras: no tocan la base. */

const dia = (iso: string) => new Date(`${iso}T12:00:00`);

describe("ficha de salud del dueño", () => {
  it("empieza vacía y no se puede enseñar sin el sexo del animal", () => {
    assert.equal(FICHA_VACIA.sexo, null);
    assert.equal(fichaLista(FICHA_VACIA), false);
    assert.equal(fichaConSalud(FICHA_VACIA), false);
    assert.throws(() => resumenDeFicha(FICHA_VACIA, { nombre: "Kira", telefono: "", hoy: dia("2026-10-01") }));
  });

  it("la edad se dice como en una cartilla", () => {
    const hoy = dia("2026-10-01");
    assert.equal(edadTexto("", hoy), "");
    assert.equal(edadTexto("2026-09-20", hoy), "Menos de 1 mes");
    assert.equal(edadTexto("2026-09-01", hoy), "1 mes");
    assert.equal(edadTexto("2026-02-15", hoy), "7 meses");
    assert.equal(edadTexto("2025-10-01", hoy), "1 año");
    assert.equal(edadTexto("2025-10-02", hoy), "11 meses");
    assert.equal(edadTexto("2021-05-14", hoy), "5 años");
    assert.equal(edadTexto("2027-01-01", hoy), "");
  });

  it("los catálogos están en los cuatro idiomas de la web del veterinario", () => {
    for (const t of [...Object.values(REACCIONES), ...Object.values(CRONICAS)])
      for (const idioma of ["es", "pt", "en", "fr"] as const) assert.ok(t[idioma].length > 2, JSON.stringify(t));
  });

  it("el resumen de urgencia pone primero la alergia grave y traduce lo del catálogo", () => {
    const f = fichaDueno.parse({
      version: 1,
      especie: "dog",
      sexo: "hembra",
      esterilizado: true,
      raza: "Mestiza",
      nacimiento: "2021-05-14",
      pesoKg: "12.4",
      alergias: [
        { id: "a", sustancia: "Pollo", reaccion: "otra", texto: "Se rasca mucho", gravedad: "baja" },
        { id: "b", sustancia: "Amoxicilina", reaccion: "hinchazon-cara", gravedad: "alta" },
      ],
      medicacion: [{ id: "m", principio: "Omeprazol", dosis: "10 mg", cadaHoras: 24 }],
      cronicas: [
        { id: "c", codigo: "dermatitis-atopica" },
        { id: "d", codigo: "otra", texto: "Displasia de cadera" },
      ],
      rabiaHasta: "2027-03-14",
    });
    assert.equal(fichaLista(f), true);
    assert.equal(fichaConSalud(f), true);

    const r = resumenDeFicha(f, { nombre: "Kira", telefono: " +34 600 000 000 ", hoy: dia("2026-10-01") });
    assert.deepEqual(r.animal, {
      nombre: "Kira",
      especie: "dog",
      sexo: "hembra",
      esterilizado: true,
      raza: "Mestiza",
      edad: "5 años",
      pesoKg: "12,4",
      chip: null,
    });
    assert.deepEqual(
      r.alergias.map((a) => [a.sustancia, a.gravedad]),
      [
        ["Amoxicilina", "alta"],
        ["Pollo", "baja"],
      ],
    );
    assert.equal(r.alergias[0].reaccion.en, "Facial swelling");
    // Lo que no está en el catálogo va tal cual en todos los idiomas: no se inventa una traducción.
    assert.deepEqual(r.alergias[1].reaccion, { es: "Se rasca mucho", pt: "Se rasca mucho", en: "Se rasca mucho", fr: "Se rasca mucho" });
    // Y ningún código ATCvet inventado.
    assert.ok(r.alergias.every((a) => a.atcvet === null));
    assert.deepEqual(r.medicacion, [{ principio: "Omeprazol", dosis: "10 mg", cadaHoras: 24 }]);
    assert.equal(r.cronicas[0].fr, "Dermatite atopique");
    assert.equal(r.cronicas[1].en, "Displasia de cadera");
    assert.equal(r.rabiaHasta, "2027-03-14");
    assert.equal(r.telefono, "+34 600 000 000");
    assert.equal(r.actualizado, "2026-10-01");
  });

  it("sin teléfono elegido, la placa no enseña ninguno", () => {
    const f = fichaDueno.parse({ version: 1, sexo: "macho" });
    const r = resumenDeFicha(f, { nombre: "", telefono: "", hoy: dia("2026-10-01") });
    assert.equal(r.telefono, null);
    assert.equal(r.rabiaHasta, null);
    assert.deepEqual(r.alergias, []);
  });

  it("rechaza lo que no es una ficha: peso con letras, demasiadas alergias, placa con mala clave", () => {
    assert.equal(fichaDueno.safeParse({ version: 1, pesoKg: "doce" }).success, false);
    assert.equal(fichaDueno.safeParse({ version: 2 }).success, false);
    const muchas = Array.from({ length: 21 }, (_, i) => ({ id: String(i), sustancia: "x", reaccion: "urticaria", gravedad: "baja" }));
    assert.equal(fichaDueno.safeParse({ version: 1, alergias: muchas }).success, false);
    assert.equal(
      fichaDueno.safeParse({ version: 1, placa: { id: "00000000-0000-4000-8000-000000000000", clave: "corta", creada: "" } }).success,
      false,
    );
  });

  it("los cuerpos de la API ponen tope al tamaño", () => {
    const b64 = (n: number) => Buffer.alloc(n, 1).toString("base64");
    assert.equal(fichaBody.safeParse({ sobre: b64(1000), version: 0 }).success, true);
    assert.equal(fichaBody.safeParse({ sobre: b64(65 * 1024), version: 0 }).success, false);
    assert.equal(fichaBody.safeParse({ sobre: b64(1000), version: -1 }).success, false);
    assert.equal(placaBody.safeParse({ id: "00000000-0000-4000-8000-000000000000", sobre: b64(500) }).success, true);
    assert.equal(placaBody.safeParse({ id: "no", sobre: b64(500) }).success, false);
  });
});
