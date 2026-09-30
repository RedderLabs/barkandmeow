/* QVET: carpeta de exportaciones CSV. Los nombres de columna son los
   habituales en español, no verificados contra una exportación real. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodificar, leerCsv } from "../src/csv.ts";
import { FuenteQvet, fechaQvet } from "../src/fuentes/qvet.ts";

/** Texto a Windows-1252, como lo guarda Excel en Windows. */
const cp1252 = (s: string) => Buffer.from(s, "latin1");

test("CSV: comillas, saltos dentro de campo y separador adivinado", () => {
  assert.deepEqual(leerCsv('a;b\r\n"x;y";"dijo ""hola""\notra"\r\n'), [
    ["a", "b"],
    ["x;y", 'dijo "hola"\notra'],
  ]);
  assert.deepEqual(leerCsv("a,b\n1,2\n"), [["a", "b"], ["1", "2"]]);
  assert.equal(decodificar(cp1252("Diagnóstico")), "Diagnóstico");
  assert.equal(decodificar(Buffer.from("﻿Diagnóstico", "utf8")), "Diagnóstico");
});

test("fechas de QVET", () => {
  assert.equal(fechaQvet("29/09/2026 10:15"), "2026-09-29");
  assert.equal(fechaQvet("3-9-26"), "2026-09-03");
  assert.equal(fechaQvet("2026-09-29"), "2026-09-29");
  assert.equal(fechaQvet("mañana"), null);
});

test("QVET: vacunas y consultas desde la carpeta; al confirmar, a «procesados»", async () => {
  const dir = mkdtempSync(join(tmpdir(), "qvet-"));
  writeFileSync(
    join(dir, "vacunas.csv"),
    cp1252(
      [
        "Fecha;Nº Chip;Vacuna;Lote;Próxima vacunación;Veterinario",
        "29/09/2026;724 098 060 143 113;Rabisin;L2231;29/09/2029;Dra. Pérez",
        "29/09/2026;941000024680135;Nobivac DHPPi;B9;;Dr. Gil",
        ";724098060143113;Sin fecha;;;",
      ].join("\r\n"),
    ),
  );
  writeFileSync(
    join(dir, "consultas.csv"),
    "Fecha consulta;Microchip;Motivo;Diagnóstico;Tratamiento;Observaciones\n28/09/2026;724098060143113;Otitis;Otitis externa;Gotas óticas;\"Revisar en\n10 días\"\n",
  );
  writeFileSync(join(dir, "raro.csv"), "Nombre;Especie\nLuna;perro\n");
  writeFileSync(join(dir, "reciente.csv"), "Fecha;Chip;Motivo\n29/09/2026;724098060143113;Vómitos\n");
  writeFileSync(join(dir, "listado.xlsx"), "PK");
  const ahora = Date.now();
  for (const f of ["vacunas.csv", "consultas.csv", "raro.csv"]) utimesSync(join(dir, f), new Date(ahora - 120_000), new Date(ahora - 120_000));

  const f = new FuenteQvet({ carpeta: dir, reglas: {} }, () => ahora);
  const l = await f.leer();
  const porRef = Object.fromEntries(l.hallazgos.map((h) => [h.ref, h.registro]));

  assert.deepEqual(porRef["qvet:vacunas.csv:2"], {
    version: 1, tipo: "vacuna", chip: "724098060143113", fecha: "2026-09-29", veterinario: "Dra. Pérez",
    enfermedad: "rabia", nombre: "", producto: "Rabisin", lote: "L2231", validaHasta: "2029-09-29",
  });
  assert.equal(porRef["qvet:vacunas.csv:3"].tipo, "informe");
  assert.equal(porRef["qvet:vacunas.csv:4"], undefined);
  assert.deepEqual(porRef["qvet:consultas.csv:2"], {
    version: 1, tipo: "informe", chip: "724098060143113", fecha: "2026-09-28", veterinario: "",
    motivo: "Otitis", diagnostico: "Otitis externa", tratamiento: "Gotas óticas", observaciones: "Revisar en\n10 días",
  });
  // El que aún se está escribiendo espera a la próxima vuelta.
  assert.ok(!Object.keys(porRef).some((r) => r.startsWith("qvet:reciente.csv")));
  // Sin columnas de fecha y chip: apartado a «errores» al leer.
  assert.equal(readdirSync(join(dir, "errores")).length, 1);

  await l.confirmar!();
  const procesados = readdirSync(join(dir, "procesados"));
  assert.equal(procesados.length, 2);
  assert.ok(existsSync(join(dir, "reciente.csv")));
  assert.ok(existsSync(join(dir, "listado.xlsx")));
});

test("QVET: columnas propias de la clínica en las reglas", async () => {
  const dir = mkdtempSync(join(tmpdir(), "qvet-"));
  writeFileSync(join(dir, "v.csv"), "F. Vacuna;Identificador;Nombre comercial;Nº de lote;Válida hasta\n01/09/2026;724098060143113;Versican Plus R;X1;01/09/2027\n");
  utimesSync(join(dir, "v.csv"), new Date(0), new Date(0));
  const f = new FuenteQvet({
    carpeta: dir,
    reglas: { qvet: { columnas: { fecha: ["F. Vacuna"], chip: ["Identificador"], vacuna: ["Nombre comercial"], lote: ["Nº de lote"] } } },
  });
  const { hallazgos } = await f.leer();
  assert.equal(hallazgos.length, 1);
  assert.equal(hallazgos[0].registro.tipo, "vacuna");
  assert.equal((hallazgos[0].registro as { lote: string }).lote, "X1");
  assert.equal((hallazgos[0].registro as { validaHasta: string }).validaHasta, "2027-09-01");
});
