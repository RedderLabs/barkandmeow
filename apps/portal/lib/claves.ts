/* La clave del dueño en este navegador.

   Sale de su código de recuperación en papel y vive solo aquí, en IndexedDB.
   Al servidor solo va la pública: es a la que los veterinarios sellan notas y
   avisos. Si se borra el navegador, el papel la reconstruye. */

const BD = "bm-dueno";
const ALMACEN = "claves";

export type ClaveLocal = { id: "dueno"; secreta: Uint8Array; publica: Uint8Array; guardada: string };

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, mal) => {
    const r = indexedDB.open(BD, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(ALMACEN, { keyPath: "id" });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
}

export async function guardarClave(secreta: Uint8Array, publica: Uint8Array): Promise<void> {
  const bd = await abrir();
  await new Promise<void>((ok, mal) => {
    const tx = bd.transaction(ALMACEN, "readwrite");
    tx.objectStore(ALMACEN).put({ id: "dueno", secreta, publica, guardada: new Date().toISOString() });
    tx.oncomplete = () => ok();
    tx.onerror = () => mal(tx.error);
  });
  bd.close();
  await navigator.storage?.persist?.().catch(() => false);
}

/** La clave guardada en este navegador, o null si no hay (o si IndexedDB falla). */
export async function leerClave(): Promise<ClaveLocal | null> {
  try {
    const bd = await abrir();
    const r = await new Promise<ClaveLocal | undefined>((ok, mal) => {
      const q = bd.transaction(ALMACEN, "readonly").objectStore(ALMACEN).get("dueno");
      q.onsuccess = () => ok(q.result as ClaveLocal | undefined);
      q.onerror = () => mal(q.error);
    });
    bd.close();
    return r ?? null;
  } catch {
    return null;
  }
}
