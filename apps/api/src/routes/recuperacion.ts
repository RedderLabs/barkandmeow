import { createPublicKey, randomBytes, verify } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import { and, desc, eq, gt, isNotNull, isNull, lt, ne, sql } from "drizzle-orm";
import {
  clinicMembers,
  clinicSessions,
  ownerSessions,
  owners,
  petIdentifiers,
  pets,
  recuperaciones,
} from "@barkandmeow/db";
import {
  claveRecuperacionBody,
  mensajeRecuperacion,
  normalizarChip,
  recuperacionFinBody,
  recuperacionInicioBody,
  recuperacionMiembroBody,
  recuperacionPruebaBody,
} from "@barkandmeow/schema";
import {
  db,
  enviarCorreo,
  hashCodigoCorreo,
  hashPassword,
  indexar,
  mismoHash,
  normalizarCodigoCorreo,
  nuevoCodigoCorreo,
} from "../core.js";
import {
  canalDe,
  destinatario,
  destinoDe,
  duenoDe,
  enviarCodigo,
  SinCupoSms,
  type Destinatario,
} from "./duenos.js";

/* Recuperar la contraseña (decidido 2026-09-30).

   La contraseña no protege ningún dato: las claves salen del código en papel
   (dueño) o viven en los dispositivos (clínica). Cambiarla no descifra nada ni
   hace perder nada. Lo que protege es la cuenta: quién puede entrar.

   Dueño: tiene que demostrar dos cosas.
   1. Que tiene su código en papel. El servidor da un reto y el dueño lo firma
      con una clave Ed25519 que sale de la del papel; el servidor solo guarda
      la pública (`owners.recovery_pub`). Quien robe el correo no la tiene.
   2. Que recibe el código de su segundo factor (correo o SMS).
   Quien perdió el papel no puede recuperar la cuenta así: le queda la
   reclamación del chip en una clínica, con el animal delante.

   Miembro de clínica: basta un código al correo, como en la invitación. La
   clave de la clínica no depende de la contraseña; en un dispositivo nuevo
   se recupera como siempre (papel de la clínica u otro administrador).

   En los dos casos se cierran todas las sesiones y llega un aviso al correo. */

const VIGENCIA_MS = 15 * 60 * 1000;
const PRUEBAS = 5;
const INTENTOS = 5;
const REENVIO_MS = 60 * 1000;

const caduca = () => new Date(Date.now() + VIGENCIA_MS);

/** Firma Ed25519 con claves en bruto, con lo que trae Node. */
function firmaValida(clave: Buffer, mensaje: string, firma: Buffer): boolean {
  try {
    const publica = createPublicKey({
      key: { kty: "OKP", crv: "Ed25519", x: clave.toString("base64url") },
      format: "jwk",
    });
    return verify(null, Buffer.from(mensaje, "utf8"), publica, firma);
  } catch {
    return false;
  }
}

async function avisarCambio(email: string) {
  await enviarCorreo({
    para: email,
    asunto: "Tu contraseña de Bark & Meow ha cambiado",
    texto: [
      "Acabas de poner una contraseña nueva en Bark & Meow. Hemos cerrado la",
      "sesión en todos tus dispositivos.",
      "",
      "Si no has sido tú, escríbenos respondiendo a este correo.",
    ].join("\n"),
  }).catch(() => {});
}

/** Último paso, común: código, contraseña nueva y fuera todas las sesiones. */
async function terminar(tipo: "dueno" | "miembro", body: unknown, reply: FastifyReply) {
  const cuerpo = recuperacionFinBody.safeParse(body);
  if (!cuerpo.success) return reply.code(400).send({ error: "cuerpo inválido" });
  const { recuperacionId, codigo, password } = cuerpo.data;

  const [r] = await db
    .select()
    .from(recuperaciones)
    .where(
      and(
        eq(recuperaciones.id, recuperacionId),
        eq(recuperaciones.tipo, tipo),
        isNull(recuperaciones.usadaAt),
        gt(recuperaciones.expiresAt, new Date()),
      ),
    )
    .limit(1);
  // Un dueño que no ha pasado la prueba del papel todavía no tiene código.
  if (!r || (tipo === "dueno" && !r.codeHash))
    return reply.code(410).send({ error: "caducado", motivo: "caducado" });

  const [reserva] = await db
    .update(recuperaciones)
    .set({ codeAttempts: sql`${recuperaciones.codeAttempts} + 1` })
    .where(and(eq(recuperaciones.id, r.id), lt(recuperaciones.codeAttempts, INTENTOS)))
    .returning({ intentos: recuperaciones.codeAttempts });
  if (!reserva) return reply.code(429).send({ error: "demasiados intentos", motivo: "demasiados-intentos" });

  /* Un miembro sin cuenta también tiene recuperación (señuelo, sin código):
     falla igual que un código equivocado, para no confirmar qué correos hay. */
  const bueno =
    !!r.codeHash && !!r.sujetoId && mismoHash(hashCodigoCorreo(r.id, normalizarCodigoCorreo(codigo)), r.codeHash);
  if (!bueno)
    return reply.code(400).send({
      error: "código incorrecto",
      motivo: "incorrecto",
      intentosRestantes: Math.max(0, INTENTOS - reserva.intentos),
    });

  // Solo una vez: si dos peticiones llegan a la vez, gana la primera.
  const [usada] = await db
    .update(recuperaciones)
    .set({ usadaAt: new Date() })
    .where(and(eq(recuperaciones.id, r.id), isNull(recuperaciones.usadaAt)))
    .returning({ id: recuperaciones.id });
  if (!usada) return reply.code(410).send({ error: "caducado", motivo: "caducado" });

  const passwordHash = await hashPassword(password);
  if (tipo === "dueno") {
    const [o] = await db
      .update(owners)
      .set({ passwordHash })
      .where(eq(owners.id, r.sujetoId!))
      .returning({ email: owners.email });
    await db.delete(ownerSessions).where(eq(ownerSessions.ownerId, r.sujetoId!));
    if (o) await avisarCambio(o.email);
  } else {
    const [m] = await db
      .update(clinicMembers)
      .set({ passwordHash })
      .where(eq(clinicMembers.id, r.sujetoId!))
      .returning({ email: clinicMembers.email });
    await db.delete(clinicSessions).where(eq(clinicSessions.memberId, r.sujetoId!));
    if (m) await avisarCambio(m.email);
  }
  return { ok: true as const };
}

export default async function rutasRecuperacion(app: FastifyInstance) {
  /* ── Dueño ──────────────────────────────────────────────── */

  /** Paso 1: el chip. Siempre hay reto, haya cuenta o no. */
  app.post("/owners/v1/recovery", async (req, reply) => {
    const cuerpo = recuperacionInicioBody.safeParse(req.body);
    if (!cuerpo.success) return reply.code(400).send({ error: "cuerpo inválido" });
    const [idx] = await indexar([normalizarChip(cuerpo.data.identificador.valor)]);
    await db.delete(recuperaciones).where(lt(recuperaciones.expiresAt, new Date(Date.now() - 864e5)));
    const reto = randomBytes(32).toString("base64url");
    const [r] = await db
      .insert(recuperaciones)
      .values({ tipo: "dueno", idIndex: idx, reto, expiresAt: caduca() })
      .returning({ id: recuperaciones.id, expiresAt: recuperaciones.expiresAt });
    return reply.code(201).send({ recuperacionId: r.id, reto, caduca: r.expiresAt });
  });

  /** Paso 2: el reto firmado con la clave del papel. Si vale, sale el código. */
  app.post("/owners/v1/recovery/proof", async (req, reply) => {
    const cuerpo = recuperacionPruebaBody.safeParse(req.body);
    if (!cuerpo.success) return reply.code(400).send({ error: "cuerpo inválido" });
    const { recuperacionId, clave, firma } = cuerpo.data;

    const [reserva] = await db
      .update(recuperaciones)
      .set({ pruebas: sql`${recuperaciones.pruebas} + 1` })
      .where(
        and(
          eq(recuperaciones.id, recuperacionId),
          eq(recuperaciones.tipo, "dueno"),
          isNull(recuperaciones.sujetoId),
          isNull(recuperaciones.usadaAt),
          gt(recuperaciones.expiresAt, new Date()),
          lt(recuperaciones.pruebas, PRUEBAS),
        ),
      )
      .returning();
    if (!reserva) return reply.code(410).send({ error: "caducado", motivo: "caducado" });

    const pub = Buffer.from(clave, "base64");
    const rechazo = () =>
      reply.code(401).send({ error: "el código en papel no corresponde a este chip", motivo: "papel" });
    if (!firmaValida(pub, mensajeRecuperacion(reserva.id, reserva.reto!), Buffer.from(firma, "base64")))
      return rechazo();

    const [owner] = await db
      .select(destinatario)
      .from(petIdentifiers)
      .innerJoin(pets, eq(pets.id, petIdentifiers.petId))
      .innerJoin(owners, eq(owners.id, pets.ownerId))
      .where(
        and(
          eq(petIdentifiers.idIndex, reserva.idIndex!),
          ne(pets.estado, "retirada"),
          isNotNull(owners.recoveryPub),
          eq(owners.recoveryPub, pub),
        ),
      )
      .limit(1);
    if (!owner) return rechazo();

    const codigo = nuevoCodigoCorreo();
    const asunto = "Este es el código para poner una contraseña nueva en Bark & Meow:";
    let canal = canalDe(owner);
    try {
      // Sin cupo de SMS hoy, el código va al correo.
      await enviarCodigo(owner, canal, codigo, asunto).catch((e: unknown) => {
        if (!(e instanceof SinCupoSms)) throw e;
        canal = "correo";
        return enviarCodigo(owner, canal, codigo, asunto);
      });
    } catch {
      return reply.code(502).send({ error: "no se pudo enviar el código", motivo: "envio" });
    }
    await db
      .update(recuperaciones)
      .set({ sujetoId: owner.id, codeHash: hashCodigoCorreo(reserva.id, codigo), expiresAt: caduca() })
      .where(eq(recuperaciones.id, reserva.id));
    return { enviado: true as const, canal, destino: destinoDe(owner as Destinatario, canal) };
  });

  /** Paso 3: el código recibido y la contraseña nueva. */
  app.post("/owners/v1/recovery/finish", async (req, reply) => terminar("dueno", req.body, reply));

  /**
   * Dueños que se dieron de alta antes de la recuperación: su navegador o su
   * móvil, que ya guardan la clave del papel, suben la pública una sola vez.
   */
  app.put("/owners/v1/recovery-key", async (req, reply) => {
    const d = await duenoDe(req, reply);
    if (!d) return;
    const cuerpo = claveRecuperacionBody.safeParse(req.body);
    if (!cuerpo.success) return reply.code(400).send({ error: "cuerpo inválido" });
    const hecho = await db
      .update(owners)
      .set({ recoveryPub: Buffer.from(cuerpo.data.clave, "base64") })
      .where(and(eq(owners.id, d.ownerId), isNull(owners.recoveryPub)))
      .returning({ id: owners.id });
    if (!hecho.length) return reply.code(409).send({ error: "ya guardada", motivo: "ya-guardada" });
    return { ok: true as const };
  });

  /* ── Miembro de clínica ─────────────────────────────────── */

  /**
   * Paso 1: el correo. La respuesta es la misma haya cuenta o no, y el correo
   * sale sin esperar, para que el tiempo tampoco lo diga.
   */
  app.post("/clinics/v1/recovery", async (req, reply) => {
    const cuerpo = recuperacionMiembroBody.safeParse(req.body);
    if (!cuerpo.success) return reply.code(400).send({ error: "cuerpo inválido" });
    const email = cuerpo.data.email.trim().toLowerCase();

    const [m] = await db
      .select({ id: clinicMembers.id, email: clinicMembers.email })
      .from(clinicMembers)
      .where(
        and(eq(clinicMembers.email, email), isNull(clinicMembers.revokedAt), isNotNull(clinicMembers.passwordHash)),
      )
      .limit(1);

    // Una por minuto: dentro de ese plazo vale la última, sin otro correo.
    if (m) {
      const [reciente] = await db
        .select({ id: recuperaciones.id })
        .from(recuperaciones)
        .where(
          and(
            eq(recuperaciones.tipo, "miembro"),
            eq(recuperaciones.sujetoId, m.id),
            isNull(recuperaciones.usadaAt),
            gt(recuperaciones.createdAt, new Date(Date.now() - REENVIO_MS)),
          ),
        )
        .orderBy(desc(recuperaciones.createdAt))
        .limit(1);
      if (reciente) return reply.code(202).send({ recuperacionId: reciente.id });
    }

    const [r] = await db
      .insert(recuperaciones)
      .values({ tipo: "miembro", sujetoId: m?.id ?? null, expiresAt: caduca() })
      .returning({ id: recuperaciones.id });
    if (m) {
      const codigo = nuevoCodigoCorreo();
      await db
        .update(recuperaciones)
        .set({ codeHash: hashCodigoCorreo(r.id, codigo) })
        .where(eq(recuperaciones.id, r.id));
      const legible = `${codigo.slice(0, 4)}-${codigo.slice(4)}`;
      void enviarCorreo({
        para: m.email,
        asunto: `${legible} es tu código para cambiar la contraseña`,
        texto: [
          "Este es el código para poner una contraseña nueva en la consola de tu clínica:",
          "",
          `    ${legible}`,
          "",
          "Caduca en 15 minutos. Si no lo has pedido tú, ignora este correo: tu",
          "contraseña sigue siendo la misma.",
        ].join("\n"),
      }).catch((e: Error) => req.log.warn({ err: e.message }, "recuperación: no salió el correo"));
    }
    return reply.code(202).send({ recuperacionId: r.id });
  });

  /** Paso 2: el código del correo y la contraseña nueva. */
  app.post("/clinics/v1/recovery/finish", async (req, reply) => terminar("miembro", req.body, reply));
}
