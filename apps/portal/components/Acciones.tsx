"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { toast } from "@barkandmeow/ui-web/components/sonner";
import ui from "@barkandmeow/ui-web/ui.module.css";
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
import { identificar, impugnar, nuevaMascota, nuevoCodigoActivacion, type Activacion } from "@/lib/api";
import { CodigoActivacion } from "./Piezas";

/** Genera un código de activación nuevo y lo muestra una sola vez. Lo que
    falta y por qué lo explica la fila de la ficha donde va el botón. */
export function GenerarCodigo({ petId, nombre }: { petId: string; nombre: string }) {
  const [activacion, setActivacion] = useState<Activacion | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function generar() {
    setEnviando(true);
    try {
      setActivacion(await nuevoCodigoActivacion(petId));
    } catch {
      toast("No se ha podido generar el código", { description: "Vuelve a intentarlo en un momento." });
    } finally {
      setEnviando(false);
    }
  }

  if (activacion)
    return <CodigoActivacion codigo={activacion.codigoActivacion} caduca={activacion.caduca} nombre={nombre} />;
  return (
    <Button type="button" size="md" className="self-start" disabled={enviando} onClick={() => void generar()}>
      {enviando ? "Generando…" : "Generar código de activación"}
    </Button>
  );
}

/** Impugnar una reclamación: protegido con un diálogo, porque detiene un traspaso. */
export function Impugnar({ reclamacionId, nombre }: { reclamacionId: string; nombre: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);

  async function confirmar() {
    try {
      await impugnar(reclamacionId);
      toast("Reclamación impugnada", {
        description: "El chip no cambiará de dueño. Revisaremos el caso con la documentación de las dos partes.",
      });
      router.refresh();
    } catch {
      toast("No se ha podido impugnar", { description: "Vuelve a intentarlo en un momento." });
    }
  }

  return (
    <AlertDialog open={abierto} onOpenChange={setAbierto}>
      <AlertDialogTrigger asChild>
        <Button type="button" size="md" className="self-start">
          Impugnar la reclamación
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿{nombre || "Esta mascota"} es tuya?</AlertDialogTitle>
          <AlertDialogDescription>
            Al impugnar, el chip no pasará a la otra persona cuando termine el plazo. Revisaremos
            el caso a mano y te pediremos documentación: el pasaporte o el registro oficial del
            animal.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>No, volver</AlertDialogCancel>
          <AlertDialogAction onClick={() => void confirmar()}>Sí, es mía: impugnar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Añadir otra mascota a la cuenta. */
export function NuevaMascota() {
  const router = useRouter();
  const [chip, setChip] = useState("");
  const [nombre, setNombre] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<Activacion | null>(null);
  const ids = useId();

  async function alEnviar(ev: FormEvent) {
    ev.preventDefault();
    const id = identificar(chip);
    if (!id) return setError("Un microchip ISO tiene 15 dígitos.");
    setEnviando(true);
    setError(null);
    try {
      setHecho(await nuevaMascota(id, nombre.trim()));
      router.refresh();
    } catch {
      setError("No se ha podido añadir. Revisa el número y vuelve a intentarlo.");
    } finally {
      setEnviando(false);
    }
  }

  if (hecho)
    return (
      <div className="flex flex-col gap-3">
        <CodigoActivacion codigo={hecho.codigoActivacion} caduca={hecho.caduca} nombre={nombre.trim()} />
        <Button
          type="button"
          variant="outline"
          size="md"
          className="self-start"
          onClick={() => {
            setHecho(null);
            setChip("");
            setNombre("");
          }}
        >
          Añadir otra
        </Button>
      </div>
    );

  return (
    <form className="flex flex-col gap-3" onSubmit={alEnviar} noValidate>
      <div className={ui.field}>
        <Label htmlFor={`${ids}-chip`}>Número del microchip</Label>
        <Input
          id={`${ids}-chip`}
          className="font-mono tracking-[0.04em] tabular-nums"
          inputMode="numeric"
          autoComplete="off"
          maxLength={32}
          value={chip}
          onChange={(e) => setChip(e.target.value)}
        />
      </div>
      <div className={ui.field}>
        <Label htmlFor={`${ids}-nombre`}>Cómo se llama</Label>
        <Input id={`${ids}-nombre`} maxLength={60} value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </div>
      {error && (
        <p className={ui.fieldError} role="alert">
          {error}
        </p>
      )}
      <Button type="submit" variant="outline" size="md" className="self-start" disabled={enviando}>
        {enviando ? "Añadiendo…" : "Añadir mascota"}
      </Button>
    </form>
  );
}
