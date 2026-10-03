"use client";

import { useId, useState, type FormEvent } from "react";
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
} from "@barkandmeow/ui-web/components/alert-dialog";
import { Button } from "@barkandmeow/ui-web/components/button";
import { Label } from "@barkandmeow/ui-web/components/label";
import { PasswordInput } from "@barkandmeow/ui-web/components/password-input";
import { toast } from "@barkandmeow/ui-web/components/sonner";
import { borrarCuenta, cambiarContrasena, ErrorApi } from "@/lib/api";
import { borrarClave } from "@/lib/claves";

/* Cambiar la contraseña y borrar la cuenta. Las dos piden la contraseña
   actual aunque la sesión esté abierta. Borrar la cuenta también se puede
   desde aquí sin la app: las tiendas de apps lo exigen. */

const mensajeError = (e: unknown) => {
  if (e instanceof ErrorApi && e.estado === 403) return "La contraseña no es correcta.";
  if (e instanceof ErrorApi && e.estado === 429) return "Demasiados intentos. Espera un minuto y vuelve a probar.";
  return "No hay conexión con Bark & Meow. Vuelve a intentarlo.";
};

export function CambiarContrasena() {
  const ids = useId();
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetida, setRepetida] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function guardar(ev: FormEvent) {
    ev.preventDefault();
    if (nueva.length < 12) return setError("La nueva tiene que tener al menos 12 caracteres.");
    if (nueva !== repetida) return setError("Las dos contraseñas nuevas no coinciden.");
    setEnviando(true);
    setError(null);
    try {
      await cambiarContrasena(actual, nueva);
      toast("Contraseña cambiada", { description: "Las demás sesiones se han cerrado." });
      setActual("");
      setNueva("");
      setRepetida("");
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={guardar} noValidate>
      <p className={ui.panelNote}>
        Al cambiarla se cierran las sesiones abiertas en otros navegadores y móviles. Te avisaremos
        por correo.
      </p>
      <div className={ui.field}>
        <Label htmlFor={`${ids}-actual`}>Contraseña actual</Label>
        <PasswordInput
          id={`${ids}-actual`}
          autoComplete="current-password"
          value={actual}
          onChange={(e) => setActual(e.target.value)}
        />
      </div>
      <div className={ui.field}>
        <Label htmlFor={`${ids}-nueva`}>Contraseña nueva</Label>
        <PasswordInput
          id={`${ids}-nueva`}
          autoComplete="new-password"
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
        />
      </div>
      <div className={ui.field}>
        <Label htmlFor={`${ids}-repetida`}>Repite la contraseña nueva</Label>
        <PasswordInput
          id={`${ids}-repetida`}
          autoComplete="new-password"
          value={repetida}
          onChange={(e) => setRepetida(e.target.value)}
          aria-describedby={error ? `${ids}-error` : undefined}
        />
      </div>
      {error && (
        <p id={`${ids}-error`} className={ui.fieldError} role="alert">
          {error}
        </p>
      )}
      <div className={ui.actions}>
        <Button type="submit" disabled={enviando || !actual || !nueva || !repetida}>
          {enviando ? "Cambiando…" : "Cambiar la contraseña"}
        </Button>
      </div>
    </form>
  );
}

export function BorrarCuenta() {
  const ids = useId();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [preguntando, setPreguntando] = useState(false);

  async function borrar() {
    setEnviando(true);
    setError(null);
    try {
      await borrarCuenta(password);
      // La clave de este navegador ya no abre nada: se va con la cuenta.
      await borrarClave().catch(() => {});
      // Navegación completa a propósito: /salir es una ruta del servidor que borra la cookie.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/mi-mascota/salir");
    } catch (e) {
      setError(mensajeError(e));
      setEnviando(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(ev) => {
        ev.preventDefault();
        if (password) setPreguntando(true);
      }}
      noValidate
    >
      <div className={ui.alertBlock}>
        Se borra todo y no se puede deshacer: tus mascotas, sus fichas de salud, placas y
        pasaportes, la bandeja y los permisos de las clínicas. Las placas del collar dejarán de
        funcionar y los chips quedarán libres para registrarse de nuevo.
      </div>
      <div className={ui.field}>
        <Label htmlFor={`${ids}-password`}>Escribe tu contraseña para confirmar</Label>
        <PasswordInput
          id={`${ids}-password`}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby={error ? `${ids}-error` : undefined}
        />
      </div>
      {error && (
        <p id={`${ids}-error`} className={ui.fieldError} role="alert">
          {error}
        </p>
      )}
      <div className={ui.actions}>
        <Button type="submit" variant="outline" disabled={enviando || !password}>
          {enviando ? "Borrando…" : "Borrar mi cuenta"}
        </Button>
      </div>
      <AlertDialog open={preguntando} onOpenChange={setPreguntando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar la cuenta para siempre?</AlertDialogTitle>
            <AlertDialogDescription>No hay papelera: no se podrá recuperar nada.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, volver</AlertDialogCancel>
            <AlertDialogAction onClick={() => void borrar()}>Sí, borrar todo</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
