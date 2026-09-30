/* CSV de hojas de cálculo españolas: separador «;» casi siempre, comillas
   dobles, saltos de línea dentro de campos entre comillas y, desde Windows,
   texto en Windows-1252 en vez de UTF-8. */

/** Texto del archivo: UTF-8 si lo es (con o sin BOM), si no Windows-1252. */
export function decodificar(bytes: Uint8Array, codificacion?: string): string {
  if (codificacion) return new TextDecoder(codificacion).decode(bytes).replace(/^﻿/, "");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** El separador que más aparece en la primera línea. */
export function adivinarSeparador(texto: string): string {
  const primera = texto.split(/\r?\n/, 1)[0] ?? "";
  const cuenta = (c: string) => primera.split(c).length - 1;
  return [";", ",", "\t", "|"].sort((a, b) => cuenta(b) - cuenta(a))[0];
}

export function leerCsv(texto: string, separador = adivinarSeparador(texto)): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"' && campo === "") comillas = true;
    else if (c === separador) {
      fila.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fila.push(campo);
      if (fila.some((x) => x.trim() !== "")) filas.push(fila);
      fila = [];
      campo = "";
    } else campo += c;
  }
  fila.push(campo);
  if (fila.some((x) => x.trim() !== "")) filas.push(fila);
  return filas;
}

/** Cabecera comparable: sin tildes, sin mayúsculas, sin signos. */
export const normalizarCabecera = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
