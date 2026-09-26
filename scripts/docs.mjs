/* Regenera las exportaciones del documento de arquitectura desde el markdown.
   La fuente es siempre el .md: el .docx y el .pdf son salidas. */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const raiz = process.cwd();
const md = "barkandmeow-arquitectura.md";
const tmp = mkdtempSync(join(tmpdir(), "bam-docs-"));

// La hoja de estilo lleva las rutas de las fuentes como marcador, para que el
// repositorio no dependa de una ruta absoluta de una máquina concreta.
const css = readFileSync(join(raiz, "diseno", "doc.css"), "utf8").replaceAll(
  "FONTS",
  `file:///${join(raiz, "apps", "clinic", "public", "fonts").replaceAll("\\", "/")}`,
);
const cssPath = join(tmp, "doc.css");
writeFileSync(cssPath, css);

const run = (cmd, args) =>
  execFileSync(cmd, args, { cwd: raiz, stdio: ["ignore", "pipe", "pipe"] });

run("pandoc", [md, "-o", "barkandmeow-arquitectura.docx", "--toc", "--toc-depth=2"]);
console.log("escrito barkandmeow-arquitectura.docx");

const html = join(tmp, "arq.html");
run("pandoc", [
  md, "-o", html, "--standalone", "--toc", "--toc-depth=2",
  "--metadata", "title=Bark & Meow — Arquitectura",
  "--css", cssPath, "--embed-resources",
]);
try {
  run("wkhtmltopdf", [
    "--quiet", "--enable-local-file-access",
    "--margin-top", "16mm", "--margin-bottom", "16mm",
    "--margin-left", "16mm", "--margin-right", "16mm",
    "--footer-right", "[page]", "--footer-font-size", "8",
    html, "barkandmeow-arquitectura.pdf",
  ]);
  console.log("escrito barkandmeow-arquitectura.pdf");
} catch (e) {
  console.error("wkhtmltopdf falló; el .docx sí se ha generado.", e.message);
  process.exitCode = 1;
}

console.log("Los diagramas mermaid salen como bloques de código: ni pandoc ni wkhtmltopdf los dibujan.");
