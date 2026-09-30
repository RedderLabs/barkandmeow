"use client";

import { useActionState, useId, useState } from "react";
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
import { Label } from "@barkandmeow/ui-web/components/label";
import { Textarea } from "@barkandmeow/ui-web/components/textarea";
import { resolver } from "@/app/acciones";

/* Resolver es irreversible: a favor del reclamante, el registro del titular se
   retira y el chip cambia de dueño. Por eso nota obligatoria y confirmación. */
export function Resolver({ id, chip }: { id: string; chip: string }) {
  const [estado, accion, enviando] = useActionState(resolver, null);
  const [aFavor, setAFavor] = useState<"titular" | "reclamante" | null>(null);
  const [nota, setNota] = useState("");
  const ids = useId();
  const error = estado && "error" in estado ? estado.error : null;
  const formId = `${ids}-form`;

  if (estado && "ok" in estado) return <p className={ui.okBlock}>Resuelta. Se ha avisado por correo a las dos partes.</p>;

  return (
    <form id={formId} action={accion} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-2 text-sm font-medium">A favor de</legend>
        {(
          [
            ["titular", "El titular: el chip sigue como está"],
            ["reclamante", "El reclamante: el chip pasa a su registro"],
          ] as const
        ).map(([v, texto]) => (
          <label key={v} className="flex items-center gap-2 text-sm">
            <input type="radio" name="aFavor" value={v} checked={aFavor === v} onChange={() => setAFavor(v)} />
            {texto}
          </label>
        ))}
      </fieldset>
      <div className={ui.field}>
        <Label htmlFor={`${ids}-nota`}>Por qué (queda guardado con la resolución)</Label>
        <Textarea
          id={`${ids}-nota`}
          name="nota"
          rows={3}
          maxLength={2000}
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Qué documentación se ha visto y de quién."
        />
      </div>
      {error && (
        <p className={ui.fieldError} role="alert">
          {error}
        </p>
      )}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" size="md" className="self-start" disabled={!aFavor || nota.trim().length < 5 || enviando}>
            {enviando ? "Resolviendo…" : "Resolver"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Resolver a favor del {aFavor === "reclamante" ? "reclamante" : "titular"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {aFavor === "reclamante"
                ? `El chip terminado en ${chip} pasa al reclamante. El registro del titular se retira, sus accesos se revocan y sus enlaces caducan. No se puede deshacer desde aquí.`
                : `El chip terminado en ${chip} sigue a nombre del titular y su perfil vuelve a mostrarse. La reclamación se cierra.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction type="submit" form={formId}>
              Sí, resolver
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
