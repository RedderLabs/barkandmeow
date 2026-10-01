"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent } from "react";
import { toast } from "@barkandmeow/ui-web/components/sonner";
import { claveDeClinica, deBase64, leerCodigo } from "@barkandmeow/crypto";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { IconCheck, IconKey } from "@barkandmeow/ui-web/parts";
import { Button } from "@barkandmeow/ui-web/components/button";
import { Input } from "@barkandmeow/ui-web/components/input";
import { Label } from "@barkandmeow/ui-web/components/label";
import { entregarClave } from "@/lib/api";
import { guardarClaves, leerClaves } from "@/lib/claves";
import { CLAVE_LISTA, cripto, igual } from "@/lib/cripto";

/* Custodia de la clave de la clínica en este navegador.

   La clave no pasa nunca por el servidor en claro. Llega a un navegador de
   tres formas: se generó aquí al registrar la clínica, la entregó otro
   administrador sellada para este dispositivo, o se reconstruye con el código
   en papel. En las tres se comprueba contra la clave pública de la clínica:
   una clave que no corresponde no se guarda. */

/** La portada espera la clave para abrir las etiquetas de los pacientes. */
const avisarClave = () => window.dispatchEvent(new Event(CLAVE_LISTA));

const b64 = (b: Uint8Array) => {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
};

type Estado = "mirando" | "tiene" | "recibida" | "falta";

export function CustodiaClave({
  clinicId,
  pubKeyClinica,
  claveEnvuelta,
}: {
  clinicId: string;
  pubKeyClinica: string;
  claveEnvuelta: string | null;
}) {
  const [estado, setEstado] = useState<Estado>("mirando");
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [recuperando, setRecuperando] = useState(false);
  const ids = useId();
  const publica = deBase64(pubKeyClinica);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const c = await cripto();
      const local = await leerClaves(clinicId).catch(() => null);
      if (local?.clinica && igual(c.publica(local.clinica), publica)) {
        if (vivo) setEstado("tiene");
        return;
      }
      // Entregada por otro administrador para el dispositivo de este navegador.
      const sellada = claveEnvuelta ? deBase64(claveEnvuelta) : null;
      if (sellada && local?.dispositivo) {
        try {
          const clave = c.abrirSellado(local.dispositivo, sellada);
          if (igual(c.publica(clave), publica)) {
            await guardarClaves({ ...local, clinica: clave, guardada: new Date().toISOString() });
            avisarClave();
            if (vivo) setEstado("recibida");
            return;
          }
        } catch {
          // Sellada para otro dispositivo: se sigue a la recuperación.
        }
      }
      if (vivo) setEstado("falta");
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicId, pubKeyClinica, claveEnvuelta]);

  async function recuperar(ev: FormEvent) {
    ev.preventDefault();
    setRecuperando(true);
    setError(null);
    const semilla = await leerCodigo(codigo);
    if (!semilla) {
      setError("El código no es válido: revisa cada bloque en el papel.");
      setRecuperando(false);
      return;
    }
    const c = await cripto();
    const clave = claveDeClinica(c, semilla);
    if (!igual(clave.publica, publica)) {
      setError("Ese código es válido, pero no es el de esta clínica.");
      setRecuperando(false);
      return;
    }
    const local = await leerClaves(clinicId).catch(() => null);
    await guardarClaves({
      clinicId,
      clinica: clave.secreta,
      dispositivo: local?.dispositivo ?? crypto.getRandomValues(new Uint8Array(32)),
      guardada: new Date().toISOString(),
    });
    avisarClave();
    setEstado("recibida");
    setRecuperando(false);
  }

  if (estado === "mirando" || estado === "tiene") return null;

  if (estado === "recibida")
    return (
      <div className={ui.okBlock} role="status">
        <strong>
          <IconCheck /> La clave de la clínica ya está en este navegador
        </strong>
        Se ha comprobado que corresponde a esta clínica.
      </div>
    );

  return (
    <section className={`${ui.panel} ${ui.panelWarn}`} aria-labelledby={`${ids}-titulo`}>
      <h2 id={`${ids}-titulo`} className={ui.panelTitle}>
        <IconKey size={20} /> Este navegador no tiene la clave de la clínica
      </h2>
      <p className={ui.panelNote}>
        Sin ella no podréis abrir las fichas que los dueños os autoricen. Si tienes el
        código de recuperación en papel, escríbelo aquí. Si te invitaron como
        administrador, pide a otro administrador que te la entregue desde Equipo.
      </p>
      <form className="flex flex-col gap-3" onSubmit={recuperar} noValidate>
        <div className={ui.field}>
          <Label htmlFor={`${ids}-codigo`}>Código de recuperación</Label>
          <Input
            id={`${ids}-codigo`}
            className="font-mono uppercase tracking-[0.08em]"
            placeholder="XXXX XXXX XXXX XXXX XXXX XXXX XXXX XXXX"
            autoComplete="off"
            spellCheck={false}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            aria-describedby={error ? `${ids}-error` : undefined}
          />
        </div>
        {error && (
          <p id={`${ids}-error`} className={ui.fieldError} role="alert">
            {error}
          </p>
        )}
        <div className={ui.actions}>
          <Button type="submit" variant="outline" size="md" disabled={recuperando || !codigo.trim()}>
            {recuperando ? "Comprobando…" : "Recuperar la clave"}
          </Button>
        </div>
      </form>
    </section>
  );
}

/** Entrega la clave de la clínica, sellada en este navegador, a otro administrador. */
export function EntregarClave({
  clinicId,
  memberId,
  nombre,
  devicePubKey,
}: {
  clinicId: string;
  memberId: string;
  nombre: string;
  devicePubKey: string;
}) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);

  async function entregar() {
    setEnviando(true);
    try {
      const local = await leerClaves(clinicId).catch(() => null);
      if (!local?.clinica) {
        toast("Este navegador no tiene la clave", {
          description: "Recupérala antes en la consola con el código en papel.",
        });
        return;
      }
      const destino = deBase64(devicePubKey);
      if (!destino) throw new Error("clave del dispositivo inválida");
      const c = await cripto();
      await entregarClave(memberId, b64(c.sellar(destino, local.clinica)));
      toast(`Clave entregada a ${nombre}`, {
        description: "Solo su navegador puede abrirla. La recibirá al entrar en la consola.",
      });
      router.refresh();
    } catch {
      toast("No se ha podido entregar la clave", { description: "Vuelve a intentarlo en un momento." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Button type="button" variant="soft" size="sm" disabled={enviando} onClick={() => void entregar()}>
      <IconKey />
      {enviando ? "Entregando…" : "Entregar la clave"}
    </Button>
  );
}

