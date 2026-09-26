"use client";

import { useState } from "react";
import { toast } from "sonner";
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
} from "@/components/ui/alert-dialog";
import ui from "../app/_ui/ui.module.css";

/* Dar de baja es irreversible para lo ya descargado, así que se protege el
   foco con un diálogo. El resto de acciones de la pantalla no lo llevan:
   un modal para algo que no lo necesita es ruido. */

export function BajaMiembro({
  nombre,
  esAdministrador,
}: {
  nombre: string;
  esAdministrador: boolean;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <AlertDialog open={abierto} onOpenChange={setAbierto}>
      <AlertDialogTrigger asChild>
        <button type="button" className={ui.danger}>
          Dar de baja
        </button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-serif text-xl font-semibold">
            Dar de baja a {nombre}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[15px] leading-relaxed text-muted-foreground">
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
          <AlertDialogCancel className={ui.secondary}>
            No, dejarlo
          </AlertDialogCancel>
          <AlertDialogAction
            className={ui.danger}
            onClick={() =>
              toast(`${nombre} ya no tiene acceso`, {
                description: "Lo descargado antes de ahora no se puede retirar.",
              })
            }
          >
            Sí, dar de baja
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
