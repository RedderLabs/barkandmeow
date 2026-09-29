"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { Button } from "@barkandmeow/ui-web/components/button";
import { Input } from "@barkandmeow/ui-web/components/input";
import { PasswordInput } from "@barkandmeow/ui-web/components/password-input";
import { Label } from "@barkandmeow/ui-web/components/label";
import { entrar, ErrorApi } from "@/lib/api";

/* Entrar en la consola de la clínica. La contraseña abre la sesión; la clave
   de la clínica no viaja nunca: vive en el navegador de cada administrador. */
export function Entrar() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = useId();

  async function alEnviar(ev: FormEvent) {
    ev.preventDefault();
    if (!email.trim() || !password) {
      setError("Escribe tu correo y tu contraseña.");
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      await entrar(email.trim().toLowerCase(), password);
      router.replace("/");
      router.refresh();
    } catch (e) {
      setError(
        e instanceof ErrorApi && e.estado === 401
          ? "El correo o la contraseña no son correctos."
          : "No hay conexión con Bark & Meow. Vuelve a intentarlo.",
      );
      setEnviando(false);
    }
  }

  return (
    <main className={ui.reading}>
      <div className={ui.readingMain}>
        <div>
          <h1 className={ui.pageTitle}>Entrar</h1>
          <p className={ui.lede}>Con la cuenta de tu clínica.</p>
        </div>
        <form className={ui.panel} onSubmit={alEnviar} noValidate>
          <div className={ui.field}>
            <Label htmlFor={`${ids}-email`}>Correo</Label>
            <Input
              id={`${ids}-email`}
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className={ui.field}>
            <Label htmlFor={`${ids}-password`}>Contraseña</Label>
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
            <Button type="submit" disabled={enviando}>
              {enviando ? "Entrando…" : "Entrar"}
            </Button>
          </div>
        </form>
      </div>
      <aside className={`${ui.panel} ${ui.readingAside}`}>
        <h2 className={ui.panelTitle}>¿Tu clínica aún no está?</h2>
        <p className={ui.panelNote}>
          Regístrala en unos minutos. Si te han invitado, usa el enlace que te llegó por
          correo.
        </p>
        <Button asChild variant="outline" size="md">
          <Link href="/registro">Registrar la clínica</Link>
        </Button>
      </aside>
    </main>
  );
}
