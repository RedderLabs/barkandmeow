/* Custodia local de la clave de la clínica.

   La clave privada de la clínica y la del dispositivo del administrador viven
   solo en este navegador, en IndexedDB. Nunca se envían: al servidor solo van
   las públicas. Si se borran los datos del navegador, la clave se recupera
   con el código en papel (o con otro administrador). */

const BD = "bm-clinica";
const ALMACEN = "claves";

export type ClavesLocales = {
  clinicId: string;
  /** X25519 de la clínica, derivada del código de recuperación. Un miembro que
      no es administrador, o uno que aún no la ha recibido, no la tiene. */
  clinica: Uint8Array | null;
  /** X25519 de este dispositivo: identifica al administrador que lo usa. */
  dispositivo: Uint8Array;
  guardada: string;
};

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, mal) => {
    const r = indexedDB.open(BD, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(ALMACEN, { keyPath: "clinicId" });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
}

export async function guardarClaves(c: ClavesLocales): Promise<void> {
  const bd = await abrir();
  await new Promise<void>((ok, mal) => {
    const tx = bd.transaction(ALMACEN, "readwrite");
    tx.objectStore(ALMACEN).put(c);
    tx.oncomplete = () => ok();
    tx.onerror = () => mal(tx.error);
  });
  bd.close();
  // Pide al navegador que no borre este almacén por falta de espacio.
  await navigator.storage?.persist?.().catch(() => false);
}

export async function leerClaves(clinicId: string): Promise<ClavesLocales | null> {
  const bd = await abrir();
  const c = await new Promise<ClavesLocales | undefined>((ok, mal) => {
    const r = bd.transaction(ALMACEN).objectStore(ALMACEN).get(clinicId);
    r.onsuccess = () => ok(r.result as ClavesLocales | undefined);
    r.onerror = () => mal(r.error);
  });
  bd.close();
  return c ?? null;
}
