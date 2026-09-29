/* Clínica y dueña de demostración, para enseñar el producto en local.

     pnpm --filter @barkandmeow/api demo

   Crea, si no existen ya:
   - «Clínica Veterinaria Demo», con el correo y el dominio verificados, así
     que la purga de cuentas sin verificar no la toca y puede activar y
     reclamar chips. Su clave sale de un código de recuperación real.
   - Una dueña con Kira (chip activo, perfil publicado) y Nala (pendiente,
     con su código de activación para activarla desde la clínica).

   Las credenciales van a demo.txt en la raíz del repo, que no se sube a git.
   Si la demo ya existe no toca nada: los códigos solo se ven al crearla. */
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { clinicMembers, clinics, owners, petIdentifiers, petProfiles, pets } from "@barkandmeow/db";
/* El núcleo criptográfico es el mismo que usan las webs. Se importa en tiempo
   de ejecución: sus tipos son de navegador (WebAssembly) y la API no los carga. */
type Par = { secreta: Uint8Array; publica: Uint8Array };
type Codigo = { bloques: string[]; semilla: Uint8Array };
type Cripto = unknown;
const RUTA_CRIPTO = "../../../packages/crypto/js/index.ts";
const { cargarCripto, claveDeClinica, claveDeDueno, nuevoCodigo } = (await import(RUTA_CRIPTO)) as {
  cargarCripto(bytes: Uint8Array): Promise<Cripto>;
  claveDeClinica(c: Cripto, semilla: Uint8Array): Par;
  claveDeDueno(c: Cripto, semilla: Uint8Array): Par;
  nuevoCodigo(): Promise<Codigo>;
};
import { cerrarDb, db, hashPassword, indexar } from "../src/core.js";
import { registrarPendiente } from "../src/routes/mascotas.js";

const CLINICA = { nombre: "Clínica Veterinaria Demo", dominio: "clinica-demo.example" };
const ADMIN = { nombre: "Admin Demo", email: "demo@clinica-demo.example" };
const DUENA = "kira.demo@correo-demo.example";
const KIRA = { nombre: "Kira", chip: "724098060143113" };
const NALA = { nombre: "Nala", chip: "724098060143114" };

const clave = () => randomBytes(12).toString("base64url");

async function main() {
  const [ya] = await db
    .select({ id: clinicMembers.id })
    .from(clinicMembers)
    .where(eq(clinicMembers.email, ADMIN.email))
    .limit(1);
  const [yaDuena] = await db.select({ id: owners.id }).from(owners).where(eq(owners.email, DUENA)).limit(1);
  if (ya || yaDuena) {
    console.log("La demo ya existe: las credenciales están en demo.txt. No se ha tocado nada.");
    return;
  }

  const cripto = await cargarCripto(
    readFileSync(new URL("../../../packages/crypto/wasm/bm_crypto.wasm", import.meta.url)),
  );
  const ahora = new Date();

  // Clínica verificada: correo y dominio.
  const codigoClinica = await nuevoCodigo();
  const parClinica = claveDeClinica(cripto, codigoClinica.semilla);
  const claveAdmin = clave();
  const [clinica] = await db
    .insert(clinics)
    .values({
      name: CLINICA.nombre,
      country: "ES",
      domain: CLINICA.dominio,
      domainVerifiedAt: ahora,
      pubKey: Buffer.from(parClinica.publica),
    })
    .returning({ id: clinics.id });
  await db.insert(clinicMembers).values({
    clinicId: clinica.id,
    name: ADMIN.nombre,
    email: ADMIN.email,
    role: "admin",
    passwordHash: await hashPassword(claveAdmin),
    devicePubKey: randomBytes(32),
    emailVerifiedAt: ahora,
    acceptedAt: ahora,
  });

  // Dueña verificada, con Kira activa y Nala pendiente.
  const codigoDuena = await nuevoCodigo();
  const parDuena = claveDeDueno(cripto, codigoDuena.semilla);
  const claveDuena = clave();
  const pubKey = Buffer.from(parDuena.publica);
  const [duena] = await db
    .insert(owners)
    .values({ email: DUENA, passwordHash: await hashPassword(claveDuena), pubKey, emailVerifiedAt: ahora })
    .returning({ id: owners.id });

  const kira = await registrarPendiente({
    identificador: { tipo: "iso", valor: KIRA.chip },
    ownerPubKey: pubKey,
    ownerId: duena.id,
  });
  const [idxKira] = await indexar([KIRA.chip]);
  await db
    .update(petIdentifiers)
    .set({ activo: true })
    .where(and(eq(petIdentifiers.petId, kira.petId), eq(petIdentifiers.idIndex, idxKira)));
  await db
    .update(pets)
    .set({
      estado: "activa",
      activatedAt: ahora,
      activatedByClinicId: clinica.id,
      activationCodeHash: null,
      activationExpiresAt: null,
    })
    .where(eq(pets.id, kira.petId));
  await db.insert(petProfiles).values({
    petId: kira.petId,
    nombre: KIRA.nombre,
    publicado: true,
    bio: "Mestiza de tamaño mediano, muy sociable. Lleva collar rojo.",
  });

  const nala = await registrarPendiente({
    identificador: { tipo: "iso", valor: NALA.chip },
    ownerPubKey: pubKey,
    ownerId: duena.id,
  });
  await db.insert(petProfiles).values({ petId: nala.petId, nombre: NALA.nombre });

  const bloques = (b: string[]) => b.join(" ");
  const texto = [
    "DEMO DE BARK & MEOW (local). No se sube a git. Creada el " + ahora.toISOString().slice(0, 10) + ".",
    "Arranca todo con `pnpm dev` y entra por http://localhost:4510",
    "",
    "── Clínica: http://localhost:4510/clinica/entrar",
    `Clínica                ${CLINICA.nombre} (dominio ${CLINICA.dominio}, verificada)`,
    `Correo                 ${ADMIN.email}`,
    `Contraseña             ${claveAdmin}`,
    `Código de recuperación ${bloques(codigoClinica.bloques)}`,
    "  En un navegador nuevo, la consola pide este código una vez para guardar",
    "  la clave de la clínica. Sin él todo funciona, pero sale el aviso.",
    "",
    "── Dueña: http://localhost:4510/mi-mascota",
    `Correo                 ${DUENA}`,
    `Contraseña             ${claveDuena}`,
    `Código de recuperación ${bloques(codigoDuena.bloques)}`,
    "  Para entrar se usa el chip de Kira y la contraseña; después llega un",
    "  código al correo, que en desarrollo se ve en la bandeja de Mailtrap.",
    "",
    "── Mascotas",
    `${KIRA.nombre.padEnd(23)}chip ${KIRA.chip}, activa, perfil publicado`,
    `${"".padEnd(23)}Búscala en http://localhost:4510/chip`,
    `${NALA.nombre.padEnd(23)}chip ${NALA.chip}, pendiente de activar en la clínica`,
    `Código de activación   ${nala.codigoActivacion} (caduca el ${nala.caduca.toISOString().slice(0, 10)};`,
    "                       si caduca, la dueña pide otro desde el portal)",
    "",
  ].join("\n");
  writeFileSync(new URL("../../../demo.txt", import.meta.url), texto);
  console.log(texto);
}

try {
  await main();
} finally {
  await cerrarDb();
}
