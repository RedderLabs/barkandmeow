"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ui from "../app/_ui/ui.module.css";

/* El rol no es un detalle administrativo: decide quién firma un diagnóstico y
   quién custodia la clave. Por eso cada opción explica lo que concede, cosa
   que un <select> nativo no permite. */

const ROLES = [
  {
    valor: "vet",
    nombre: "Veterinario",
    concede: "Busca, carga datos y firma informes",
  },
  {
    valor: "assistant",
    nombre: "Auxiliar",
    concede: "Busca y carga datos. No firma",
  },
  {
    valor: "admin",
    nombre: "Administrador",
    concede: "Gestiona el equipo y custodia la clave de la clínica",
  },
];

export function InvitarForm() {
  const [rol, setRol] = useState("vet");
  const [nombre, setNombre] = useState("");
  const elegido = ROLES.find((r) => r.valor === rol)!;

  return (
    <>
      <label className={ui.field}>
        Nombre y apellidos
        <input
          className={ui.input}
          type="text"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
      </label>

      <label className={ui.field}>
        Correo
        <input className={ui.input} type="email" />
      </label>

      <div className={ui.field}>
        <span id="rol-label">Rol</span>
        <Select value={rol} onValueChange={setRol}>
          <SelectTrigger
            aria-labelledby="rol-label"
            className="w-full border-input bg-surface font-sans text-[15px]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => (
              <SelectItem key={r.valor} value={r.valor} className="py-2">
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">{r.nombre}</span>
                  <span className="text-[13px] text-muted-foreground">
                    {r.concede}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <button
        type="button"
        className={ui.primary}
        disabled={nombre.trim().length < 2}
        onClick={() =>
          toast("Invitación enviada", {
            description: `${nombre} entrará como ${elegido.nombre.toLowerCase()}.`,
          })
        }
      >
        Enviar invitación
      </button>

      <p className={ui.panelNote}>
        Al aceptar, su navegador genera su propia clave y tú le envuelves la de
        la clínica. Los dueños no tienen que autorizar nada de nuevo.
      </p>
    </>
  );
}
