"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { Button } from "@barkandmeow/ui-web/components/button";
import { Input } from "@barkandmeow/ui-web/components/input";
import { PasswordInput } from "@barkandmeow/ui-web/components/password-input";
import { Label } from "@barkandmeow/ui-web/components/label";
import { empezarRecuperacion, ErrorApi, terminarRecuperacion } from "@/lib/api";

type Paso = { paso: "correo" } | { paso: "codigo"; id: string; email: string } | { paso: "hecho" };

/* Recuperar la contraseña de un miembro. El código llega al correo; la
   respuesta es la misma haya cuenta o no, así que aquí tampoco se dice. La
   clave de la clínica no depende de la contraseña: no cambia. */
export function Recuperar() {
  const [estado, setEstado] = useState<Paso>({ paso: "correo" });
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [password, setPassword] = useState("");
  const [repetida, setRepetida] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = useId();

  async function pedirCodigo(ev: FormEvent) {
    ev.preventDefault();
    const limpio = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(limpio)) return setError("Escribe el correo con el que entras en la consola.");
    setEnviando(true);
    setError(null);
    try {
      const r = await empezarRecuperacion(limpio);
      setEstado({ paso: "codigo", id: r.recuperacionId, email: limpio });
    } catch (e) {
      setError(
        e instanceof ErrorApi && e.estado === 429
          ? "Demasiados intentos seguidos. Espera un minuto y vuelve a probar."
          : "No hay conexión con Bark & Meow. Vuelve a intentarlo.",
      );
    } finally {
      setEnviando(false);
    }
  }

  async function cambiar(ev: FormEvent) {
    ev.preventDefault();
    if (estado.paso !== "codigo") return;
    if (!codigo.trim()) return setError("Escribe el código que te ha llegado al correo.");
    if (password.length < 12) return setError("La contraseña necesita al menos 12 caracteres.");
    if (password !== repetida) return setError("Las dos contraseñas no coinciden.");
    setEnviando(true);
    setError(null);
    try {
      await terminarRecuperacion(estado.id, codigo.trim(), password);
      setEstado({ paso: "hecho" });
    } catch (e) {
      if (e instanceof ErrorApi && e.estado === 400 && e.datos.motivo === "incorrecto") {
        const quedan = Number(e.datos.intentosRestantes ?? 0);
        setError(
          quedan > 0
            ? `El código no es correcto. Te quedan ${quedan} ${quedan === 1 ? "intento" : "intentos"}.`
            : "El código no es correcto y ya no quedan intentos. Pide otro código.",
        );
      } else if (e instanceof ErrorApi && e.estado === 410) {
        setError("El código ha caducado o ya se usó. Pide otro para volver a empezar.");
      } else if (e instanceof ErrorApi && e.estado === 429) {
        setError("Demasiados intentos. Pide otro código para volver a empezar.");
      } else if (e instanceof ErrorApi && e.estado === 400) {
        setError("Revisa el código y la contraseña nueva.");
      } else {
        setError("No hay conexión con Bark & Meow. Vuelve a intentarlo.");
      }
    } finally {
      setEnviando(false);
    }
  }

  function volverAEmpezar() {
    setEstado({ paso: "correo" });
    setCodigo("");
    setPassword("");
    setRepetida("");
    setError(null);
  }

  const errorVisible = error && (
    <p id={`${ids}-error`} className={ui.fieldError} role="alert">
      {error}
    </p>
  );

  return (
    <main className={ui.reading}>
      <div className={ui.readingMain}>
        {estado.paso === "correo" && (
          <>
            <div>
              <h1 className={ui.pageTitle}>Recuperar la contraseña</h1>
              <p className={ui.lede}>Te enviaremos un código al correo de tu cuenta.</p>
            </div>
            <form className={ui.panel} onSubmit={pedirCodigo} noValidate>
              <div className={ui.field}>
                <Label htmlFor={`${ids}-email`}>Correo</Label>
                <Input
                  id={`${ids}-email`}
                  type="email"
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-describedby={error ? `${ids}-error` : undefined}
                />
              </div>
              {errorVisible}
              <div className={ui.actions}>
                <Button type="submit" disabled={enviando}>
                  {enviando ? "Enviando…" : "Enviar el código"}
                </Button>
              </div>
            </form>
          </>
        )}

        {estado.paso === "codigo" && (
          <>
            <div>
              <h1 className={ui.pageTitle}>Contraseña nueva</h1>
              <p className={ui.lede}>
                Si hay una cuenta con {estado.email}, te hemos enviado un código. Caduca en 15 minutos.
              </p>
            </div>
            <form className={ui.panel} onSubmit={cambiar} noValidate>
              <div className={ui.field}>
                <Label htmlFor={`${ids}-codigo`}>Código</Label>
                <Input
                  id={`${ids}-codigo`}
                  autoComplete="one-time-code"
                  autoCapitalize="characters"
                  spellCheck={false}
                  autoFocus
                  placeholder="XXXX-XXXX"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                />
              </div>
              <div className={ui.field}>
                <Label htmlFor={`${ids}-password`}>Contraseña nueva</Label>
                <PasswordInput
                  id={`${ids}-password`}
                  autoComplete="new-password"
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
                  aria-describedby={error ? `${ids}-error` : undefined}
                />
              </div>
              {errorVisible}
              <div className={ui.actions}>
                <Button type="submit" disabled={enviando}>
                  {enviando ? "Cambiando…" : "Cambiar la contraseña"}
                </Button>
                <Button type="button" variant="outline" size="md" onClick={volverAEmpezar}>
                  Pedir otro código
                </Button>
              </div>
            </form>
          </>
        )}

        {estado.paso === "hecho" && (
          <>
            <div>
              <h1 className={ui.pageTitle}>Contraseña cambiada</h1>
              <p className={ui.lede}>
                Hemos cerrado tus sesiones en todos los dispositivos. Entra con la contraseña nueva.
              </p>
            </div>
            <div className={ui.actions}>
              <Button asChild>
                <Link href="/entrar">Entrar</Link>
              </Button>
            </div>
          </>
        )}
      </div>
      <aside className={`${ui.panel} ${ui.readingAside}`}>
        <h2 className={ui.panelTitle}>La clave de la clínica no cambia</h2>
        <p className={ui.panelNote}>
          La contraseña solo abre tu sesión. Si entras desde un dispositivo nuevo, la clave de la
          clínica se recupera como siempre: con el código en papel de la clínica o pidiéndosela a
          otro administrador.
        </p>
      </aside>
    </main>
  );
}
