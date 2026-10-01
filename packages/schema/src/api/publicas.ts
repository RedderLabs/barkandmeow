import { z } from "zod";
import {
  activacionBody,
  avisoBody,
  base64,
  chipLookupBody,
  chipLookupRespuesta,
  estadoPeticion,
  grantApproveBody,
  grantRejectBody,
  grantRequestBody,
  grantRevokeBody,
  notaBody,
  perfilPublicoRespuesta,
  petRegisterBody,
  resolverReclamacionBody,
} from "../contracts";
import { fecha, ok, ruta } from "./tipos";

/* Rutas que no son del portal del dueño ni del SaaS de clínicas: nivel 0,
   permisos de nivel 3, registro y activación de mascotas, web del
   veterinario (niveles 1 y 2), directorio de firmas y panel del operador. */

const numeroComparacion = z.string().regex(/^\d{6}$/);

/** La clínica tal como la ve el dueño al decidir un permiso de nivel 3. */
const clinicaPermiso = z.object({
  nombre: z.string(),
  pais: z.string(),
  /** Dominio verificado por correo, o null si aún no lo está. */
  dominio: z.string().nullable(),
});

const estadoReclamacion =z.enum(["abierta", "impugnada", "a-favor-reclamante", "a-favor-titular"]);

/** Una reclamación de chip vista por el operador: incluye correos de las dos partes. */
const reclamacionOperador = z.object({
  id: z.string().uuid(),
  petId: z.string().uuid(),
  reclamantePetId: z.string().uuid(),
  clinicId: z.string().uuid(),
  estado: estadoReclamacion,
  motivo: z.enum(["impugnada", "vencida-sin-cuenta", "en-plazo", "resuelta"]),
  plazo: fecha,
  creada: fecha,
  resuelta: fecha.nullable(),
  nota: z.string().nullable(),
  clinica: z.object({
    nombre: z.string(),
    pais: z.string(),
    direccion: z.string().nullable(),
    registroSanitario: z.string().nullable(),
    dominio: z.string().nullable(),
    verificada: fecha.nullable(),
  }),
  titular: z.object({
    estado: z.enum(["pendiente", "activa", "congelada", "retirada"]),
    chipPista: z.string().nullable(),
    activada: fecha.nullable(),
    activadaPor: z.string().nullable(),
    registrada: fecha,
    nombre: z.string().nullable(),
    correo: z.string().nullable(),
    correoVerificado: fecha.nullable(),
  }),
  reclamante: z.object({
    registrada: fecha,
    nombre: z.string().nullable(),
    correo: z.string().nullable(),
    correoVerificado: fecha.nullable(),
  }),
});

export const rutasPublicas = {
  salud: ruta({
    metodo: "GET",
    ruta: "/health",
    acceso: "publica",
    resumen: "El proceso responde.",
    respuesta: z.object({ ok: z.literal(true) }),
  }),

  /* ── Nivel 0: localizar sin abrir ──────────────────────── */

  consultarChip: ruta({
    metodo: "POST",
    ruta: "/chip/v1/lookup",
    acceso: "web-vet",
    resumen:
      "¿Existe ficha para este identificador? La respuesta se rellena siempre al mismo tamaño (4096 bytes) y gasta el mismo presupuesto de tiempo exista o no; sin ficha, requestId, sas, aviso y ownerPubKey son señuelos con la forma correcta. Con sesión de clínica verificada y vetPubKey, abre de paso la petición de alta de nivel 3 y devuelve el número de comparación.",
    cuerpo: chipLookupBody,
    respuesta: chipLookupRespuesta,
    errores: [400, 429],
  }),

  avisarDueno: ruta({
    metodo: "POST",
    ruta: "/chip/v1/notify",
    acceso: "web-vet",
    resumen:
      "Aviso sellado para el dueño con el token que dio el nivel 0. Responde igual con token real o con señuelo, así que no confirma si el chip existe.",
    cuerpo: avisoBody,
    respuesta: z.object({ recibido: z.literal(true) }),
    estado: 202,
    errores: [400],
  }),

  /* ── Nivel 3: permisos del dueño ───────────────────────── */

  pedirAlta: ruta({
    metodo: "POST",
    ruta: "/grants/v1/request",
    acceso: "clinica",
    resumen:
      "Pedir alta de nivel 3 para un identificador. Devuelve el número de comparación de seis dígitos, derivado de BLAKE2b(pk_veterinario ‖ pk_dueño ‖ id_petición): no es secreto ni abre nada, sirve para que el dueño detecte a un intermediario comparándolo con el de su pantalla. Caduca a los 10 minutos.",
    cuerpo: grantRequestBody,
    respuesta: z.object({ requestId: z.string().uuid(), sas: numeroComparacion, caduca: fecha }),
    estado: 201,
    errores: [400, 401, 403, 404],
  }),

  estadoAlta: ruta({
    metodo: "GET",
    ruta: "/grants/v1/request/:id",
    acceso: "clinica",
    resumen: "Estado de una petición de alta de la propia clínica.",
    respuesta: z.object({ requestId: z.string().uuid(), estado: estadoPeticion, caduca: fecha }),
    errores: [401, 404],
  }),

  aprobarAlta: ruta({
    metodo: "POST",
    ruta: "/grants/v1/approve",
    acceso: "dueno",
    resumen:
      "El dueño aprueba: sube K envuelta para la clave pública del veterinario. El servidor guarda bytes que no puede abrir. Misma respuesta si la petición es de otra mascota.",
    cuerpo: grantApproveBody,
    respuesta: z.object({ grantId: z.string().uuid(), level: z.literal(3) }),
    estado: 201,
    errores: [400, 401, 410],
  }),

  retirarAlta: ruta({
    metodo: "POST",
    ruta: "/grants/v1/revoke",
    acceso: "dueno",
    resumen: "El dueño retira el nivel 3. Borra la copia del servidor, no lo que ya se descargó.",
    cuerpo: grantRevokeBody,
    respuesta: z.object({ ok: z.literal(true), descargadoNoVuelve: z.literal(true) }),
    errores: [400, 401, 404],
  }),

  rechazarAlta: ruta({
    metodo: "POST",
    ruta: "/grants/v1/reject",
    acceso: "dueno",
    resumen:
      "El dueño rechaza una petición de alta: el número no coincide o no conoce a la clínica. Misma respuesta si la petición es de otra mascota.",
    cuerpo: grantRejectBody,
    respuesta: ok,
    errores: [400, 401, 410],
  }),

  permisosDueno: ruta({
    metodo: "GET",
    ruta: "/grants/v1/owner",
    acceso: "dueno",
    resumen:
      "Lo que el dueño tiene que ver para decidir: las peticiones de alta que esperan su respuesta, con el número de comparación y la clave pública a la que envolver K, y los permisos de nivel 3 que tiene concedidos.",
    respuesta: z.object({
      peticiones: z.array(
        z.object({
          requestId: z.string().uuid(),
          petId: z.string().uuid(),
          clinica: clinicaPermiso,
          /** Clave pública X25519 para la que se envuelve K. */
          vetPubKey: base64,
          sas: numeroComparacion,
          caduca: fecha,
        }),
      ),
      permisos: z.array(
        z.object({
          grantId: z.string().uuid(),
          petId: z.string().uuid(),
          clinica: clinicaPermiso,
          desde: fecha,
        }),
      ),
    }),
    errores: [401],
  }),

  permisosClinica: ruta({
    metodo: "GET",
    ruta: "/grants/v1/mine",
    acceso: "clinica",
    resumen: "Los permisos vivos de la clínica. Nunca contenido.",
    respuesta: z.object({
      permisos: z.array(
        z.object({
          id: z.string().uuid(),
          petId: z.string().uuid(),
          level: z.number().int(),
          expiresAt: fecha.nullable(),
          revokedAt: z.null(),
        }),
      ),
      total: z.number().int(),
    }),
    errores: [401],
  }),

  /* ── Registro y activación de mascotas ─────────────────── */

  registrarMascota: ruta({
    metodo: "POST",
    ruta: "/pets/v1/register",
    acceso: "publica",
    resumen:
      "Registro pendiente de un chip desde la app. No responde a ninguna búsqueda ni reserva el chip hasta que una clínica lo active con el código.",
    cuerpo: petRegisterBody,
    respuesta: z.object({
      petId: z.string().uuid(),
      codigoActivacion: z.string().regex(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/),
      caduca: fecha,
      estado: z.literal("pendiente"),
    }),
    estado: 201,
    errores: [400],
  }),

  activarMascota: ruta({
    metodo: "POST",
    ruta: "/pets/v1/activate",
    acceso: "clinica",
    resumen: "La clínica, con el animal delante, activa el registro pendiente con el chip leído y el código del dueño.",
    cuerpo: activacionBody,
    respuesta: z.object({ petId: z.string().uuid(), estado: z.literal("activa") }),
    errores: [400, 401, 403, 404, 409],
  }),

  reclamarChip: ruta({
    metodo: "POST",
    ruta: "/pets/v1/claims",
    acceso: "clinica",
    resumen:
      "El chip está activo a nombre de otro y el animal está aquí: congela la ficha del titular, que tiene 14 días para impugnar. Exige dominio verificado.",
    cuerpo: activacionBody,
    respuesta: z.object({ reclamacionId: z.string().uuid(), plazo: fecha }),
    estado: 201,
    errores: [400, 401, 403, 404, 409],
  }),

  /* ── Web del veterinario: niveles 1 y 2 ────────────────── */

  leerPlaca: ruta({
    metodo: "GET",
    ruta: "/e/v1/:id",
    acceso: "web-vet",
    resumen: "Nivel 1: el resumen de emergencia de una placa, sellado. La clave va en el fragmento de la URL y nunca llega aquí.",
    respuesta: z.object({
      sobre: base64,
      version: z.number().int(),
      perfil: perfilPublicoRespuesta.nullable(),
    }),
    errores: [404],
  }),

  leerCopia: ruta({
    metodo: "GET",
    ruta: "/s/v1/:id",
    acceso: "web-vet",
    resumen: "Nivel 2: la copia temporal (historial o pasaporte) mientras no caduque, con la clave pública del dueño para sellar la nota.",
    respuesta: z.object({
      sobre: base64,
      caduca: fecha,
      ownerPubKey: base64,
      perfil: perfilPublicoRespuesta.nullable(),
    }),
    errores: [404, 410],
  }),

  leerDocumentoCopia: ruta({
    metodo: "GET",
    ruta: "/s/v1/:id/doc/:docId",
    acceso: "web-vet",
    resumen: "Documento original de un registro, cifrado con la misma clave temporal.",
    respuestaBinaria: "application/octet-stream",
    errores: [404, 410],
  }),

  dejarNota: ruta({
    metodo: "POST",
    ruta: "/s/v1/:id/nota",
    acceso: "web-vet",
    resumen: "Nota de la consulta, sellada para el dueño en el navegador del veterinario: escribe, no lee.",
    cuerpo: notaBody,
    respuesta: ok,
    estado: 201,
    errores: [400, 404, 410],
  }),

  fotoPerfil: ruta({
    metodo: "GET",
    ruta: "/perfil/v1/foto/:id",
    acceso: "web-vet",
    resumen: "Foto del perfil público, solo si el dueño lo ha publicado. El id cambia con cada foto: se cachea como inmutable.",
    respuestaBinaria: "image/*",
    errores: [404],
  }),

  /* ── Directorio público de claves de firma ─────────────── */

  firmante: ruta({
    metodo: "GET",
    ruta: "/firmas/v1/:clave",
    acceso: "web-vet",
    resumen: "De qué clínica es una clave de firma Ed25519 (base64url sin relleno). El dominio solo si está verificado.",
    respuesta: z.object({
      clinica: z.string(),
      pais: z.string(),
      dominio: z.string().nullable(),
      verificada: z.boolean(),
      alta: fecha,
      retirada: fecha.nullable(),
    }),
    errores: [404],
  }),

  /* ── Panel del operador ────────────────────────────────── */

  colaReclamaciones: ruta({
    metodo: "GET",
    ruta: "/ops/v1/claims",
    acceso: "operador",
    resumen:
      "Reclamaciones abiertas e impugnadas y las resueltas en los últimos 30 días. Sin OPS_TOKEN válido responde 404, como una ruta desconocida.",
    respuesta: z.object({ reclamaciones: z.array(reclamacionOperador) }),
    errores: [404],
  }),

  resolverReclamacion: ruta({
    metodo: "POST",
    ruta: "/ops/v1/claims/:id/resolve",
    acceso: "operador",
    resumen: "Resolver a mano, con una nota que queda guardada y avisa a las dos partes. Una abierta en plazo no se adelanta.",
    cuerpo: resolverReclamacionBody,
    respuesta: z.object({ ok: z.literal(true), estado: z.enum(["a-favor-reclamante", "a-favor-titular"]) }),
    errores: [400, 404, 409],
  }),
} as const;
