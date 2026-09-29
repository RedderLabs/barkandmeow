"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { Button } from "@barkandmeow/ui-web/components/button";
import { Input } from "@barkandmeow/ui-web/components/input";
import { PasswordInput } from "@barkandmeow/ui-web/components/password-input";
import { Label } from "@barkandmeow/ui-web/components/label";
import { entrar, ErrorApi, identificar } from "@/lib/api";
import { PasoCodigo } from "./Piezas";
import { Placa } from "./Placa";
import a from "./acceso.module.css";

/** Agrupa los dígitos de tres en tres mientras se teclean: se leen como en el pasaporte. */
export function formatearChip(valor: string) {
  if (/[^\d\s]/.test(valor)) return valor; // chip no ISO: tal cual
  return valor.replace(/\D/g, "").slice(0, 15).replace(/(\d{3})(?=\d)/g, "$1 ");
}

/** El campo protagonista: el mismo campo de chip destacado de la consulta del veterinario. */
export const CLASE_CHIP =
  "h-[52px] border-2 border-brand font-mono text-lg tracking-[0.04em] tabular-nums hover:border-brand aria-invalid:border-alert-ink";

/* Entrar: chip y contraseña, y después el código del correo. El chip solo
   identifica; sin la contraseña y el correo no abre nada. */
export function Entrar() {
  const router = useRouter();
  const [chip, setChip] = useState("");
  const [password, setPassword] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [correo, setCorreo] = useState<string | null>(null);
  const ids = useId();

  async function alEnviar(ev: FormEvent) {
    ev.preventDefault();
    const id = identificar(chip);
    if (!id || !password) {
      setError(!id ? "Un microchip ISO tiene 15 dígitos." : "Escribe tu contraseña.");
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const r = await entrar(id, password);
      setCorreo(r.correo);
    } catch (e) {
      setError(
        e instanceof ErrorApi && e.estado === 401
          ? "El número de chip o la contraseña no son correctos."
          : e instanceof ErrorApi && e.estado === 429
            ? "Demasiados intentos. Espera un minuto y vuelve a probar."
            : "No hay conexión con Bark & Meow. Vuelve a intentarlo.",
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className={a.acceso}>
      <section className={a.portada} aria-labelledby={`${ids}-titular`}>
        <div className={a.portadaTexto}>
        <h1 id={`${ids}-titular`} className={a.titular}>
          Si se pierde, <span className={a.titularQuieto}>sabrán a quién llamar.</span>
        </h1>
        <p className={a.entradilla}>
          Su placa lleva su perfil: foto, nombre y tus teléfonos. Entra para tenerlo al día,
          activar su chip y responder si alguien lo reclama.
        </p>
      </div>
      <Placa chip={chip} />
      </section>

      {correo ? (
        <div className={a.tarjeta}>
          <PasoCodigo
            sinMarco
            claseTitulo={a.tarjetaTitulo}
            correo={correo}
            titulo="Revisa tu correo"
            alTerminar={() => {
              router.replace("/");
              router.refresh();
            }}
          />
        </div>
      ) : (
        <form className={a.tarjeta} onSubmit={alEnviar} noValidate aria-labelledby={`${ids}-titulo`}>
          <h2 id={`${ids}-titulo`} className={a.tarjetaTitulo}>
            Entrar
          </h2>
          <div className={ui.field}>
            <Label htmlFor={`${ids}-chip`}>Número del microchip</Label>
            <Input
              id={`${ids}-chip`}
              className={CLASE_CHIP}
              inputMode="numeric"
              autoComplete="username"
              autoFocus
              maxLength={32}
              placeholder="000 000 000 000 000"
              value={chip}
              onChange={(e) => setChip(formatearChip(e.target.value))}
            />
          </div>
          <div className={ui.field}>
            <Label htmlFor={`${ids}-password`}>Contraseña</Label>
            <PasswordInput
              id={`${ids}-password`}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby={error ? `${ids}-error` : `${ids}-nota`}
            />
          </div>
          {error && (
            <p id={`${ids}-error`} className={ui.fieldError} role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={enviando} className="w-full">
            {enviando ? "Comprobando…" : "Continuar"}
          </Button>
          <p id={`${ids}-nota`} className={a.tarjetaNota}>
            Después te enviaremos un código a tu correo.
          </p>
          <div className={a.separador}>¿Primera vez?</div>
          <Button asChild variant="outline" size="md" className="w-full">
            <Link href="/alta">Dar de alta a mi mascota</Link>
          </Button>
        </form>
      )}
    </main>
  );
}
