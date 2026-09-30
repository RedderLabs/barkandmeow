import { z } from "zod";
import { todasLasRutas } from "./index";
import { errorApi, type Acceso, type Ruta } from "./tipos";

/* El documento OpenAPI 3.1 sale del catálogo, no se escribe a mano. Lo usan
   Swagger UI (apps/api, /docs) y packages/spec/openapi.yaml, que se regenera
   con `pnpm spec`. */

const SEGURIDAD: Record<Acceso, Record<string, string[]>[] | undefined> = {
  publica: undefined,
  "web-vet": undefined,
  dueno: [{ sesionDueno: [] }, { tokenApp: [] }],
  "dueno-pendiente": [{ sesionDueno: [] }, { tokenApp: [] }],
  clinica: [{ sesionClinica: [] }],
  "clave-api": [{ claveApi: [] }],
  operador: [{ tokenOperador: [] }],
};

const ETIQUETAS: Record<string, string> = {
  owners: "Dueño (portal y app)",
  clinics: "Clínica",
  chip: "Nivel 0: localizar",
  grants: "Alta de nivel 3",
  pets: "Registro y activación",
  e: "Web del veterinario",
  s: "Web del veterinario",
  perfil: "Web del veterinario",
  firmas: "Web del veterinario",
  ops: "Operador",
  health: "Servicio",
};

const esquema = (s: z.ZodType) => z.toJSONSchema(s, { io: "input", unrepresentable: "any" });
const esquemaSalida = (s: z.ZodType) => z.toJSONSchema(s, { io: "output", unrepresentable: "any" });

function operacion(r: Ruta) {
  const familia = r.ruta.split("/")[1] ?? "";
  const params = [...r.ruta.matchAll(/:([A-Za-z]+)/g)].map((m) => ({
    name: m[1],
    in: "path",
    required: true,
    schema: { type: "string" },
  }));
  const estado = String(r.estado ?? 200);
  const buena = r.respuestaBinaria
    ? { description: "Bytes", content: { [r.respuestaBinaria]: { schema: { type: "string", format: "binary" } } } }
    : r.respuesta
      ? { description: "Correcto", content: { "application/json": { schema: esquemaSalida(r.respuesta) } } }
      : { description: "Correcto" };
  const errores = Object.fromEntries(
    (r.errores ?? []).map((c) => [
      String(c),
      { description: `Error ${c}`, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
    ]),
  );
  return {
    tags: [ETIQUETAS[familia] ?? familia],
    summary: r.resumen,
    ...(params.length ? { parameters: params } : {}),
    ...(SEGURIDAD[r.acceso] ? { security: SEGURIDAD[r.acceso] } : {}),
    ...(r.cuerpo
      ? { requestBody: { required: true, content: { "application/json": { schema: esquema(r.cuerpo) } } } }
      : r.cuerpoBinario
        ? {
            requestBody: {
              required: true,
              content: Object.fromEntries(
                r.cuerpoBinario.map((t) => [t, { schema: { type: "string", format: "binary" } }]),
              ),
            },
          }
        : {}),
    responses: { [estado]: buena, ...errores },
    "x-acceso": r.acceso,
  };
}

export function generarOpenApi(servidores: { url: string; description: string }[] = []) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const r of todasLasRutas) {
    const p = r.ruta.replace(/:([A-Za-z]+)/g, "{$1}");
    (paths[p] ??= {})[r.metodo.toLowerCase()] = operacion(r);
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Bark & Meow — API",
      version: "1.0.0",
      description: [
        "Contrato de apps/api: lo consumen el portal del dueño (mi-mascota), la app, la web de la clínica, la web del veterinario, el panel del operador y el software de gestión.",
        "",
        "Dos principios que cualquier implementación debe respetar:",
        "",
        "1. **El servidor no descifra.** Todo lo que lleva contenido clínico viaja como bytes opacos en base64.",
        "2. **Localizar no es abrir.** La consulta por identificador responde si existe ficha y nada más, con el mismo tamaño y el mismo tiempo en ambos casos.",
        "",
        "La consulta entre nodos (`/federation/v1/lookup`) está por implementar: solo podrá decir si existe ficha y ofrecer un enlace de aviso, con peticiones y respuestas firmadas con Ed25519.",
        "",
        "Generado desde packages/schema/src/api. No se edita a mano.",
      ].join("\n"),
      license: { name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/" },
    },
    servers: servidores,
    paths,
    components: {
      securitySchemes: {
        sesionDueno: { type: "apiKey", in: "cookie", name: "bam_owner", description: "Portal del dueño." },
        tokenApp: {
          type: "http",
          scheme: "bearer",
          description: "App: token de sesión, con la cabecera `x-bm-cliente: app`.",
        },
        sesionClinica: {
          type: "apiKey",
          in: "cookie",
          name: "bam_clinic",
          description: "Identifica a la organización y a la persona. No es una llave a los datos.",
        },
        claveApi: { type: "http", scheme: "bearer", description: "Software de gestión: `bmk_…`." },
        tokenOperador: { type: "http", scheme: "bearer", description: "Panel del operador: OPS_TOKEN." },
      },
      schemas: { Error: esquemaSalida(errorApi) },
    },
  };
}
