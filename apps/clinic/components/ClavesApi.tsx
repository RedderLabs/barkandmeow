"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { IconKey } from "@barkandmeow/ui-web/parts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@barkandmeow/ui-web/components/alert-dialog";
import { Button } from "@barkandmeow/ui-web/components/button";
import { Input } from "@barkandmeow/ui-web/components/input";
import { Label } from "@barkandmeow/ui-web/components/label";
import { toast } from "@barkandmeow/ui-web/components/sonner";
import { aBase64, aBase64Url, cargarCripto } from "@barkandmeow/crypto";
import { ErrorApi, crearClaveApi, retirarClaveApi, type ClaveCreada } from "@/lib/api";
import { CRYPTO_WASM_URL } from "@/lib/crypto-url";

/* El token y la clave de firma solo existen en esta pantalla, justo después
   de crearlos. Del token el servidor guarda el hash; de la clave de firma, la
   pública: la secreta nace en este navegador y no pasa por Bark & Meow, así
   que ni el servidor puede firmar en nombre de la clínica. Si se pierden, se
   retira la conexión y se crea otra. */

type Creada = ClaveCreada & { firma: string };

export function NuevaClave({ activa }: { activa: boolean }) {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creada, setCreada] = useState<Creada | null>(null);
  const ids = useId();

  async function alEnviar(ev: FormEvent) {
    ev.preventDefault();
    if (!nombre.trim()) return setError("Ponle un nombre para reconocerla.");
    setEnviando(true);
    setError(null);
    try {
      const cripto = await cargarCripto(fetch(CRYPTO_WASM_URL));
      const semilla = crypto.getRandomValues(new Uint8Array(32));
      const hecha = await crearClaveApi(nombre.trim(), aBase64(cripto.publicaFirma(semilla)));
      setCreada({ ...hecha, firma: `bmf_${aBase64Url(semilla)}` });
      setNombre("");
      router.refresh();
    } catch (e) {
      const motivo = e instanceof ErrorApi ? e.datos.motivo : null;
      setError(
        motivo === "correo-sin-verificar"
          ? "Confirma antes el correo de la clínica."
          : motivo === "tope-claves"
            ? "Ya tenéis el máximo de claves. Retira alguna que no uséis."
            : "No se ha podido crear la clave. Vuelve a intentarlo.",
      );
    } finally {
      setEnviando(false);
    }
  }

  async function copiar(que: "token" | "firma") {
    if (!creada) return;
    try {
      await navigator.clipboard.writeText(creada[que]);
      toast(que === "token" ? "Clave de API copiada" : "Clave de firma copiada");
    } catch {
      toast("No se ha podido copiar", { description: "Selecciónala y cópiala a mano." });
    }
  }

  if (creada)
    return (
      <div className="flex flex-col gap-3">
        <div className={ui.okBlock} role="status">
          <strong>Conexión creada.</strong> Copia las dos claves ahora y pégalas en la
          configuración de vuestro software de gestión: no se vuelven a mostrar.
        </div>
        <p className={ui.panelNote}>
          <strong>Clave de API</strong> (<code>BM_API_KEY</code>): identifica a la clínica ante
          Bark &amp; Meow.
        </p>
        <div className={ui.copyBlock}>
          <code className="select-all">{creada.token}</code>
        </div>
        <p className={ui.panelNote}>
          <strong>Clave de firma</strong> (<code>BM_FIRMA</code>): firma cada vacuna e informe.
          Con ella se comprueba en cualquier frontera que el registro es vuestro y que nadie lo
          cambió. Nació en este navegador y Bark &amp; Meow no la tiene.
        </p>
        <div className={ui.copyBlock}>
          <code className="select-all">{creada.firma}</code>
        </div>
        <div className={ui.actions}>
          <Button type="button" size="md" onClick={() => void copiar("token")}>
            Copiar la clave de API
          </Button>
          <Button type="button" size="md" onClick={() => void copiar("firma")}>
            Copiar la clave de firma
          </Button>
          <Button type="button" variant="outline" size="md" onClick={() => setCreada(null)}>
            Ya las he guardado
          </Button>
        </div>
      </div>
    );

  return (
    <form className="flex flex-col gap-3" onSubmit={alEnviar} noValidate>
      <div className={ui.field}>
        <Label htmlFor={`${ids}-nombre`}>Nombre de la clave</Label>
        <Input
          id={`${ids}-nombre`}
          type="text"
          maxLength={60}
          placeholder="Por ejemplo: Qvet, recepción"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${ids}-error` : undefined}
        />
      </div>
      {error && (
        <p id={`${ids}-error`} className={ui.fieldError} role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={enviando || !activa}>
        <IconKey /> {enviando ? "Creando…" : "Crear conexión"}
      </Button>
      <p className={ui.panelNote}>
        Se crean dos claves: una para entrar en la API y otra para firmar. Con ellas el
        software solo puede enviar vacunas e informes a los dueños que os dieron acceso
        permanente. No abre ninguna ficha ni sirve para buscar chips de nadie más.
      </p>
    </form>
  );
}

export function RetirarClave({ id, nombre }: { id: string; nombre: string }) {
  const router = useRouter();

  async function confirmar() {
    try {
      await retirarClaveApi(id);
      toast(`«${nombre}» ya no vale`, {
        description: "Los informes que envió siguen en las bandejas de los dueños.",
      });
      router.refresh();
    } catch {
      toast("No se ha podido retirar", { description: "Vuelve a intentarlo en un momento." });
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive" size="sm">
          Retirar
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Retirar «{nombre}»</AlertDialogTitle>
          <AlertDialogDescription>
            El software que la use deja de poder enviar informes al momento. Lo que ya envió
            sigue en las bandejas de los dueños. Para volver a conectarlo hará falta una clave
            nueva.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>No, dejarla</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => void confirmar()}>
            Sí, retirar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
