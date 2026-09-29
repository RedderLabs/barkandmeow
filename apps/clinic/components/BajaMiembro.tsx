"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { darDeBaja } from "@/lib/api";
import { toast } from "@barkandmeow/ui-web/components/sonner";
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

/* Dar de baja es irreversible para lo ya descargado, así que se protege el
   foco con un diálogo. El resto de acciones de la pantalla no lo llevan:
   un modal para algo que no lo necesita es ruido. */

export function BajaMiembro({
  id,
  nombre,
  esAdministrador,
}: {
  id: string;
  nombre: string;
  esAdministrador: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);

  async function confirmar() {
    try {
      await darDeBaja(id);
      toast(`${nombre} ya no tiene acceso`, {
        description: "Lo descargado antes de ahora no se puede retirar.",
      });
      router.refresh();
    } catch {
      toast("No se ha podido dar de baja", { description: "Vuelve a intentarlo en un momento." });
    }
  }

  return (
    <AlertDialog open={abierto} onOpenChange={setAbierto}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive" size="sm">
          Dar de baja
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Dar de baja a {nombre}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Se borra su envoltura de la clave: deja de poder pedir fichas nuevas
            al momento. Lo que ya se descargó en su navegador no vuelve, igual
            que ocurre con un acceso temporal revocado.
            {esAdministrador && (
              <>
                {" "}
                Además es administrador, así que su copia de la clave de la
                clínica desaparece con él.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>
            No, dejarlo
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => void confirmar()}
          >
            Sí, dar de baja
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
