/* Ficha de prueba de extremo a extremo para la web del veterinario.

   Crea en la base de DESARROLLO una mascota con placa (nivel 1), copia
   temporal de 72 h (nivel 2), un PDF de clínica y un perfil público con foto,
   todo cifrado con el núcleo real (packages/crypto). Imprime los enlaces con la
   clave en el fragmento, como los que imprimiría la app del dueño.

     pnpm --filter vet ficha:prueba
     pnpm --filter vet ficha:prueba -- --bandeja <clave secreta del dueño>

   El segundo modo hace de app del dueño: abre lo que ha llegado a su bandeja
   (notas y avisos sellados) para comprobar que solo él puede leerlo.

   Los datos son los huecos del lienzo entre corchetes: no hay animales,
   clínicas ni dueños reales. */

import { createHash, createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import postgres from "postgres";
import { ad, aBase64Url, cargarCripto, deBase64 } from "@barkandmeow/crypto";

const CHIP = "724098100005678";
const HORA = 60 * 60 * 1000;

const url = process.env.DATABASE_URL;
const pepper = process.env.CHIP_PEPPER_LOCAL;
if (!url || !pepper) {
  console.error("Falta DATABASE_URL o CHIP_PEPPER_LOCAL: se leen de apps/api/.env.");
  process.exit(1);
}
if (!/127\.0\.0\.1|localhost/.test(url)) {
  console.error("Este script solo escribe en una base local de desarrollo.");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
const cripto = await cargarCripto(
  readFileSync(new URL("../../../packages/crypto/wasm/bm_crypto.wasm", import.meta.url)),
);
const enc = new TextEncoder();
const azar = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const json = (o: unknown) => enc.encode(JSON.stringify(o));

const iBandeja = process.argv.indexOf("--bandeja");
if (iBandeja > 0) {
  await leerBandeja(process.argv[iBandeja + 1]);
} else {
  await sembrar();
}
await sql.end();

/* ── Modo app del dueño: abrir la bandeja ─────────────────── */

async function leerBandeja(secretaB64: string | undefined) {
  const secreta = secretaB64 ? deBase64(secretaB64) : null;
  if (!secreta || secreta.length !== 32) {
    console.error("Pasa la clave secreta del dueño que imprimió la siembra.");
    process.exit(1);
  }
  const publica = Buffer.from(cripto.publica(secreta));
  const filas = await sql`
    SELECT i.sealed, i.created_at FROM inbox i JOIN pets p ON p.id = i.pet_id
    WHERE p.owner_pub_key = ${publica} ORDER BY i.created_at`;
  console.log(`${filas.length} mensaje(s) en la bandeja del dueño:`);
  for (const f of filas) {
    const claro = new TextDecoder().decode(cripto.abrirSellado(secreta, new Uint8Array(f.sealed)));
    console.log(`· ${f.created_at.toISOString()}  ${claro}`);
  }
}

/* ── Modo siembra ──────────────────────────────────────────── */

async function sembrar() {
  const indice = createHmac("sha256", pepper!).update(CHIP).digest();
  await sql`DELETE FROM pets WHERE id IN (SELECT pet_id FROM pet_identifiers WHERE id_index = ${indice})`;

  const secreta = azar(32);
  const petId = randomUUID();
  await sql`INSERT INTO pets (id, owner_pub_key) VALUES (${petId}, ${Buffer.from(cripto.publica(secreta))})`;
  await sql`INSERT INTO pet_identifiers (pet_id, kind, id_index) VALUES (${petId}, 'iso', ${indice})`;

  const resumen = {
    animal: {
      nombre: "[Nombre]",
      especie: "dog",
      sexo: "hembra",
      esterilizado: true,
      raza: "[Raza]",
      edad: "[Edad]",
      pesoKg: "[Peso]",
      chip: CHIP,
    },
    alergias: [
      {
        sustancia: "Amoxicilina",
        reaccion: {
          es: "Urticaria generalizada",
          pt: "Urticária generalizada",
          en: "Generalised urticaria",
          fr: "Urticaire généralisée",
        },
        gravedad: "alta",
        atcvet: "QJ01CA04",
      },
    ],
    medicacion: [{ principio: "Omeprazol", dosis: "1 mg/kg", cadaHoras: 24 }],
    cronicas: [],
    rabiaHasta: "2027-03-14",
    telefono: "+34000000000",
    actualizado: "2026-06-02",
    idioma: "es",
  };

  // Nivel 1: la placa. La clave E va en el fragmento de la URL impresa.
  const placaId = randomUUID();
  const claveE = azar(32);
  await sql`
    INSERT INTO blobs (id, pet_id, kind, sealed, version)
    VALUES (${placaId}, ${petId}, 'emergency',
            ${Buffer.from(cripto.cerrar(claveE, ad.emergencia(placaId), json(resumen)))}, 1)`;

  // Nivel 2: copia temporal de 72 h, con el PDF cifrado con la misma clave T.
  const copiaId = randomUUID();
  const docId = randomUUID();
  const claveT = azar(32);
  const caduca = new Date(Date.now() + 72 * HORA);
  const pdf = pdfDeEjemplo();
  await sql`
    INSERT INTO blobs (id, pet_id, kind, sealed, expires_at)
    VALUES (${docId}, ${petId}, 'document',
            ${Buffer.from(cripto.cerrarDocumento(claveT, ad.documento(docId), pdf))}, ${caduca})`;

  const historial = {
    resumen,
    peso: { kg: "[Peso]", fecha: "2026-06-02" },
    registros: [
      {
        id: "r3",
        fecha: "2026-06-02",
        lugar: "Madrid, ES",
        procedencia: "clinica",
        titulo: { es: "Revisión anual", pt: "Revisão anual", en: "Annual check-up", fr: "Bilan annuel" },
        texto: "Sin alteraciones relevantes. Analítica sanguínea dentro de los valores de referencia.",
        idiomaTexto: "es",
        vacuna: null,
        documento: {
          nombre: "revision-anual.pdf",
          blobId: docId,
          sha256: createHash("sha256").update(pdf).digest("hex"),
        },
      },
      {
        id: "r2",
        fecha: "2026-03-14",
        lugar: "Madrid, ES",
        procedencia: "clinica",
        titulo: {
          es: "Vacunación antirrábica",
          pt: "Vacinação antirrábica",
          en: "Rabies vaccination",
          fr: "Vaccination antirabique",
        },
        texto: null,
        idiomaTexto: "es",
        vacuna: { lote: "[lote]", validezMeses: 12 },
        documento: null,
      },
      {
        id: "r1",
        fecha: "2025-11-20",
        lugar: "Madrid, ES",
        procedencia: "dueno",
        titulo: {
          es: "Reacción alérgica a amoxicilina",
          pt: "Reação alérgica à amoxicilina",
          en: "Allergic reaction to amoxicillin",
          fr: "Réaction allergique à l’amoxicilline",
        },
        texto: "Urticaria en todo el cuerpo a las pocas horas de empezar el antibiótico.",
        idiomaTexto: "es",
        vacuna: null,
        documento: null,
      },
    ],
  };
  await sql`
    INSERT INTO blobs (id, pet_id, kind, sealed, expires_at)
    VALUES (${copiaId}, ${petId}, 'share',
            ${Buffer.from(cripto.cerrar(claveT, ad.historial(copiaId), json(historial)))}, ${caduca})`;

  // Perfil público: lo único en claro, porque el dueño lo publica.
  await sql`
    INSERT INTO pet_profiles (pet_id, publicado, bio, telefonos, foto_id, foto, foto_tipo)
    VALUES (${petId}, true, '[Bio de ejemplo: carácter, señas y cómo acercarse al animal.]',
            ${sql.json([
              { etiqueta: "[Casa]", numero: "+34 000 000 000" },
              { etiqueta: "[Móvil]", numero: "+34 600 000 000" },
            ])},
            ${randomUUID()}, ${pngDeEjemplo()}, 'image/png')`;

  const web = process.env.VET_WEB ?? "http://localhost:4510";
  console.log(`
Ficha de prueba creada (chip ${CHIP}).

  Nivel 0  ${web}/chip?n=${CHIP}
  Nivel 1  ${web}/e/${placaId}#${aBase64Url(claveE)}
  Nivel 2  ${web}/s/${copiaId}#${aBase64Url(claveT)}

Clave secreta del dueño (para leer su bandeja):
  ${Buffer.from(secreta).toString("base64")}
`);
}

/* ── Adjuntos de ejemplo ─────────────────────────────────────── */

/** PDF mínimo válido de una página. */
function pdfDeEjemplo(): Uint8Array {
  const texto = "(Documento de ejemplo de Bark & Meow. No corresponde a ninguna clinica.)";
  const flujo = `BT /F1 12 Tf 60 760 Td ${texto} Tj ET`;
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${flujo.length} >>\nstream\n${flujo}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objetos.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return enc.encode(pdf);
}

/** PNG de 256 × 256 en el hueso del sistema con un círculo verde: un hueco de
    foto, no la foto de ningún animal. */
function pngDeEjemplo(): Buffer {
  const lado = 256;
  const filas = Buffer.alloc((lado * 3 + 1) * lado);
  for (let y = 0; y < lado; y++) {
    filas[y * (lado * 3 + 1)] = 0;
    for (let x = 0; x < lado; x++) {
      const dentro = (x - 128) ** 2 + (y - 128) ** 2 < 70 ** 2;
      const [r, g, b] = dentro ? [0xe3, 0xef, 0xe9] : [0xf4, 0xf1, 0xea];
      const o = y * (lado * 3 + 1) + 1 + x * 3;
      filas[o] = r;
      filas[o + 1] = g;
      filas[o + 2] = b;
    }
  }
  const trozo = (tipo: string, datos: Buffer) => {
    const t = Buffer.concat([Buffer.from(tipo), datos]);
    const largo = Buffer.alloc(4);
    largo.writeUInt32BE(datos.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(t));
    return Buffer.concat([largo, t, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lado, 0);
  ihdr.writeUInt32BE(lado, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo("IHDR", ihdr),
    trozo("IDAT", deflateSync(filas)),
    trozo("IEND", Buffer.alloc(0)),
  ]);
}

function crc32(b: Buffer): number {
  let c = ~0;
  for (const x of b) {
    c ^= x;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
