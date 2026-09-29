import { DeleteObjectCommand, GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/* Almacén de objetos: fotos del perfil público y, cuando lleguen, los
   documentos cifrados de la ficha (blobs.s3_key).

   Backblaze B2 por su API compatible con S3. El bucket es privado: nada se
   sirve directo desde B2. Todo pasa por el API, que decide quién ve qué (la
   foto pública solo si el perfil está publicado y el chip activo). Lo que se
   guarda de la ficha va sellado con la clave del dueño: B2, igual que Bark &
   Meow, almacena bloques que no puede abrir.

   Como el cartero del correo, se puede sustituir: los tests usan uno en
   memoria y no tocan el bucket. */

export type Almacen = {
  guardar(clave: string, cuerpo: Buffer, tipo: string): Promise<void>;
  /** El objeto, o null si no existe. */
  leer(clave: string): Promise<Buffer | null>;
  borrar(clave: string): Promise<void>;
};

function b2(): Almacen {
  const endpoint = process.env.B2_ENDPOINT ?? "";
  const bucket = process.env.B2_BUCKET_NAME ?? "";
  const keyId = process.env.B2_KEY_ID ?? "";
  const appKey = process.env.B2_APP_KEY ?? "";
  if (!endpoint || !bucket || !keyId || !appKey) {
    const falla = () => Promise.reject(new Error("almacén sin configurar: faltan B2_ENDPOINT, B2_BUCKET_NAME, B2_KEY_ID o B2_APP_KEY"));
    return { guardar: falla, leer: falla, borrar: falla };
  }
  // s3.us-west-004.backblazeb2.com → us-west-004
  const region = /s3\.([a-z0-9-]+)\.backblazeb2\.com/.exec(endpoint)?.[1] ?? "us-east-1";
  const s3 = new S3Client({
    endpoint: endpoint.startsWith("http") ? endpoint : `https://${endpoint}`,
    region,
    credentials: { accessKeyId: keyId, secretAccessKey: appKey },
    // B2 no acepta las sumas de comprobación que el SDK añade por defecto.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return {
    async guardar(clave, cuerpo, tipo) {
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: clave, Body: cuerpo, ContentType: tipo }));
    },
    async leer(clave) {
      try {
        const r = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: clave }));
        return r.Body ? Buffer.from(await r.Body.transformToByteArray()) : null;
      } catch (e) {
        if (e instanceof NoSuchKey) return null;
        throw e;
      }
    },
    async borrar(clave) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: clave }));
    },
  };
}

/** Un almacén en memoria, para los tests. */
export function almacenEnMemoria(): Almacen & { objetos: Map<string, Buffer> } {
  const objetos = new Map<string, Buffer>();
  return {
    objetos,
    guardar: async (clave, cuerpo) => void objetos.set(clave, Buffer.from(cuerpo)),
    leer: async (clave) => objetos.get(clave) ?? null,
    borrar: async (clave) => void objetos.delete(clave),
  };
}

let almacen: Almacen | null = null;

/** El almacén en uso. Se crea al primer uso, con el entorno ya cargado. */
export const almacenActual = () => (almacen ??= b2());

export function usarAlmacen(a: Almacen) {
  almacen = a;
}

/** La foto: del almacén si ya vive allí, o de la columna antigua si es anterior. */
export async function bytesDeFoto(f: { foto: Buffer | null; fotoKey: string | null }) {
  if (f.fotoKey) return almacenActual().leer(f.fotoKey);
  return f.foto;
}

/** Dónde vive cada cosa en el bucket. */
export const claves = {
  foto: (fotoId: string) => `perfil/fotos/${fotoId}`,
  blob: (petId: string, blobId: string) => `ficha/${petId}/${blobId}`,
};
