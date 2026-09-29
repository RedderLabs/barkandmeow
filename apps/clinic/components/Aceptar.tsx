"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { cargarCripto } from "@barkandmeow/crypto";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { Button } from "@barkandmeow/ui-web/components/button";
import { PasswordInput } from "@barkandmeow/ui-web/components/password-input";
import { Label } from "@barkandmeow/ui-web/components/label";
import { aceptarInvitacion, ErrorApi } from "@/lib/api";
import { guardarClaves } from "@/lib/claves";
import { CRYPTO_WASM_URL } from "@/lib/crypto-url";

const b64 = (b: Uint8Array) => {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
};

/* Aceptar la invitación del correo. Este navegador genera la clave de su
   dispositivo; al servidor solo va la pública. Si la persona es
   administradora, otro administrador le entregará la clave de la clínica
   sellada para ese dispositivo. */
export function Aceptar({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [repetida, setRepetida] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = useId();

  async function alEnviar(ev: FormEvent) {
    ev.preventDefault();
    if (password.length < 12) return setError("La contraseña necesita al menos 12 caracteres.");
    if (password !== repetida) return setError("Las dos contraseñas no coinciden.");
    setEnviando(true);
    setError(null);
    try {
      const cripto = await cargarCripto(fetch(CRYPTO_WASM_URL));
      const dispositivo = crypto.getRandomValues(new Uint8Array(32));
      const r = await aceptarInvitacion(token, password, b64(cripto.publica(dispositivo)));
      await guardarClaves({ clinicId: r.clinicId, clinica: null, dispositivo, guardada: new Date().toISOString() });
      router.replace("/");
      router.refresh();
    } catch (e) {
      setError(
        e instanceof ErrorApi && e.estado === 400
          ? "Esta invitación ya se usó o ya no es válida. Pide otra a un administrador de la clínica."
          : "No hay conexión con Bark & Meow. Vuelve a intentarlo.",
      );
      setEnviando(false);
    }
  }

  if (!token)
    return (
      <main className={ui.reading}>
        <div className={ui.readingMain}>
          <h1 className={ui.pageTitle}>Falta la invitación</h1>
          <div className={ui.alertBlock} role="alert">
            <strong>El enlace está incompleto.</strong>
            Ábrelo desde el correo de invitación, sin copiarlo a mano.
          </div>
        </div>
      </main>
    );

  return (
    <main className={ui.reading}>
      <div className={ui.readingMain}>
        <div>
          <h1 className={ui.pageTitle}>Unirte a la clínica</h1>
          <p className={ui.lede}>Elige tu contraseña para entrar en Bark & Meow.</p>
        </div>
        <form className={ui.panel} onSubmit={alEnviar} noValidate>
          <div className={ui.field}>
            <Label htmlFor={`${ids}-password`}>Contraseña</Label>
            <PasswordInput
              id={`${ids}-password`}
              autoComplete="new-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <span className={ui.hint}>Mínimo 12 caracteres.</span>
          </div>
          <div className={ui.field}>
            <Label htmlFor={`${ids}-repetida`}>Repite la contraseña</Label>
            <PasswordInput
              id={`${ids}-repetida`}
              autoComplete="new-password"
              value={repetida}
              onChange={(e) => setRepetida(e.target.value)}
            />
          </div>
          {error && (
            <p className={ui.fieldError} role="alert">
              {error}
            </p>
          )}
          <div className={ui.actions}>
            <Button type="submit" disabled={enviando}>
              {enviando ? "Uniéndote…" : "Aceptar la invitación"}
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}
