import { test } from "node:test";
import assert from "node:assert/strict";
import { IDIOMAS } from "@barkandmeow/i18n";
import { TEXTOS } from "../lib/textos";

const huecos = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test("los cuatro idiomas tienen las mismas claves, sin textos vacíos", () => {
  const base = Object.keys(TEXTOS.es).sort();
  assert.ok(base.length > 0);
  for (const i of IDIOMAS) {
    assert.deepEqual(Object.keys(TEXTOS[i]).sort(), base, `claves de ${i}`);
    for (const [k, v] of Object.entries(TEXTOS[i])) assert.ok(v.trim(), `${i}:${k} vacío`);
  }
});

test("cada traducción tiene los mismos huecos {x} que el español", () => {
  const es = TEXTOS.es as Record<string, string>;
  for (const i of IDIOMAS) {
    const otro = TEXTOS[i] as Record<string, string>;
    for (const k of Object.keys(es)) assert.deepEqual(huecos(otro[k]), huecos(es[k]), `${i}:${k}`);
  }
});
