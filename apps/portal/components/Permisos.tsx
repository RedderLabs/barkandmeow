"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { aBase64, cargarCripto, claveFicha, deBase64, type Cripto } from "@barkandmeow/crypto";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { Button } from "@barkandmeow/ui-web/components/button";
import { toast } from "@barkandmeow/ui-web/components/sonner";
import { aprobarAlta, ErrorApi, leerPermisos, rechazarAlta, retirarAlta } from "@/lib/api";
import { leerClave } from "@/lib/claves";
import { CRYPTO_WASM_URL } from "@/lib/crypto-url";

/* Permisos de nivel 3: peticiones de alta que esperan respuesta y clínicas que
   ya tienen acceso.

   Aprobar es envolver la clave de la ficha de esa mascota para la clave
   pública de la clínica, aquí en el navegador: al servidor suben bytes que no
   puede abrir. Por eso hace falta la clave del papel en este navegador;
   rechazar y retirar no la necesitan. */

type Lista = Awaited<ReturnType<typeof leerPermisos>>;
type Mascota = { petId: string; nombre: string; chipPista: string | null };

let criptoCargada: Promise<Cripto> | null = null;
const cripto = () => (criptoCargada ??= cargarCripto(fetch(CRYPTO_WASM_URL)));

const igual = (a: Uint8Array, b: Uint8Array | null) => !!b && a.length === b.length && a.every((x, i) => x === b[i]);

/** Las peticiones caducan a los diez minutos: la lista se vuelve a pedir sola. */
const REFRESCO_MS = 5000;

const dd = (n: number) => String(n).padStart(2, "0");
const dia = (iso: string) => {
  const d = new Date(iso);
  return `${dd(d.getDate())}/${dd(d.getMonth() + 1)}/${d.getFullYear()}`;
};
const hora = (iso: string) => {
  const d = new Date(iso);
  return `${dd(d.getHours())}:${dd(d.getMinutes())}`;
};

export function Permisos({ pubKey, mascotas }: { pubKey: string; mascotas: Mascota[] }) {
  const [lista, setLista] = useState<Lista | null>(null);
  const [fallo, setFallo] = useState(false);
  // null: aún mirando. false: este navegador no tiene la clave del papel.
  const [secreta, setSecreta] = useState<Uint8Array | false | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const nombreDe = (petId: string) => {
    const m = mascotas.find((x) => x.petId === petId);
    if (!m) return "tu mascota";
    return m.nombre || (m.chipPista ? `la mascota con chip ···${m.chipPista}` : "tu mascota");
  };

  const cargar = useCallback(async () => {
    try {
      setLista(await leerPermisos());
      setFallo(false);
    } catch {
      setFallo(true);
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    const pedir = () =>
      leerPermisos()
        .then((l) => {
          if (!vivo) return;
          setLista(l);
          setFallo(false);
        })
        .catch(() => vivo && setFallo(true));
    void pedir();
    const t = setInterval(() => void pedir(), REFRESCO_MS);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const [c, local] = await Promise.all([cripto(), leerClave()]);
      if (!vivo) return;
      setSecreta(local && igual(c.publica(local.secreta), deBase64(pubKey)) ? local.secreta : false);
    })().catch(() => vivo && setSecreta(false));
    return () => {
      vivo = false;
    };
  }, [pubKey]);

  async function aprobar(p: Lista["peticiones"][number]) {
    if (!secreta) return;
    const destino = deBase64(p.vetPubKey);
    if (!destino || destino.length !== 32) return toast("La petición no es válida", { description: "Recházala y pide a la clínica que la repita." });
    setOcupado(p.requestId);
    try {
      const c = await cripto();
      const envuelta = c.sellar(destino, claveFicha(c, secreta, p.petId));
      await aprobarAlta(p.requestId, aBase64(envuelta));
      toast("Acceso concedido", { description: `${p.clinica.nombre} ya tiene permiso sobre la ficha de ${nombreDe(p.petId)}.` });
    } catch (e) {
      toast(
        e instanceof ErrorApi && e.estado === 410 ? "La petición ha caducado" : "No se ha podido aprobar",
        { description: e instanceof ErrorApi && e.estado === 410 ? "Pide a la clínica que la repita." : "Vuelve a intentarlo en un momento." },
      );
    } finally {
      setOcupado(null);
      await cargar();
    }
  }

  async function rechazar(p: Lista["peticiones"][number]) {
    setOcupado(p.requestId);
    try {
      await rechazarAlta(p.requestId);
      toast("Petición rechazada");
    } catch {
      toast("No se ha podido rechazar", { description: "Puede que ya hubiera caducado." });
    } finally {
      setOcupado(null);
      await cargar();
    }
  }

  async function retirar(g: Lista["permisos"][number]) {
    setOcupado(g.grantId);
    try {
      await retirarAlta(g.grantId);
      toast("Permiso retirado", { description: "Lo que la clínica ya descargó no vuelve." });
    } catch {
      toast("No se ha podido retirar", { description: "Vuelve a intentarlo en un momento." });
    } finally {
      setOcupado(null);
      await cargar();
    }
  }

  if (!lista)
    return fallo ? (
      <div className={ui.alertBlock} role="alert">
        No se han podido cargar los permisos. Comprueba la conexión y recarga la página.
      </div>
    ) : (
      <p className={ui.panelNote} role="status">
        Cargando tus permisos…
      </p>
    );

  return (
    <>
      <section className={ui.panel} aria-labelledby="peticiones">
        <h2 id="peticiones" className={ui.panelTitle}>
          Peticiones que esperan tu respuesta
        </h2>
        {lista.peticiones.length === 0 ? (
          <p className={ui.panelNote}>
            No hay ninguna. Cuando una clínica pida el alta con tu mascota delante, aparecerá
            aquí durante diez minutos.
          </p>
        ) : (
          <>
            {secreta === false && (
              <div className={ui.pendingBlock} role="status">
                Para aprobar hace falta la clave de tu papel en este navegador.{" "}
                <Link href="/bandeja">Ábrela desde la bandeja</Link> con tu código de recuperación y
                vuelve aquí. Rechazar sí puedes.
              </div>
            )}
            <ul className={ui.rowList} aria-live="polite">
              {lista.peticiones.map((p) => (
                <li key={p.requestId} className="flex flex-col gap-3 border-b border-divider py-4 last:border-b-0">
                  <div>
                    <span className={ui.rowName}>{p.clinica.nombre}</span>{" "}
                    <span className={ui.rowMeta}>
                      {p.clinica.pais}
                      {p.clinica.dominio ? ` · ${p.clinica.dominio}` : " · correo sin dominio propio"}
                    </span>
                    <p className={ui.panelNote}>
                      Pide acceso permanente a la ficha de {nombreDe(p.petId)}. Caduca a las {hora(p.caduca)}.
                    </p>
                  </div>
                  <p className="font-mono text-4xl font-semibold tracking-[0.18em] tabular-nums" aria-label={`Número de comparación: ${p.sas.split("").join(" ")}`}>
                    {p.sas.slice(0, 3)} {p.sas.slice(3)}
                  </p>
                  <div className={ui.actions}>
                    <Button
                      type="button"
                      size="md"
                      disabled={!secreta || ocupado === p.requestId}
                      onClick={() => void aprobar(p)}
                    >
                      El número coincide: aprobar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="md"
                      disabled={ocupado === p.requestId}
                      onClick={() => void rechazar(p)}
                    >
                      Rechazar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className={ui.panel} aria-labelledby="concedidos">
        <h2 id="concedidos" className={ui.panelTitle}>
          Clínicas con acceso
        </h2>
        {lista.permisos.length === 0 ? (
          <p className={ui.panelNote}>Ninguna clínica tiene acceso permanente a tus mascotas.</p>
        ) : (
          <ul className={ui.rowList}>
            {lista.permisos.map((g) => (
              <li key={g.grantId} className={ui.row}>
                <div>
                  <span className={ui.rowName}>{g.clinica.nombre}</span>
                  <p className={ui.rowMeta}>
                    Ficha de {nombreDe(g.petId)} · desde el {dia(g.desde)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  size="md"
                  disabled={ocupado === g.grantId}
                  onClick={() => void retirar(g)}
                >
                  Retirar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
