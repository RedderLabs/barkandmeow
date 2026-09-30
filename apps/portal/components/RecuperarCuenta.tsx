"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { cargarCripto, claveDeDueno, claveDeRecuperacion, leerCodigo } from "@barkandmeow/crypto";
import { mensajeRecuperacion } from "@barkandmeow/schema";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { Button } from "@barkandmeow/ui-web/components/button";
import { Input } from "@barkandmeow/ui-web/components/input";
import { PasswordInput } from "@barkandmeow/ui-web/components/password-input";
import { Label } from "@barkandmeow/ui-web/components/label";
import { empezarRecuperacion, ErrorApi, identificar, probarPapel, terminarRecuperacion } from "@/lib/api";
import { guardarClave } from "@/lib/claves";
import { CRYPTO_WASM_URL } from "@/lib/crypto-url";
import { CLASE_CHIP, formatearChip } from "./Entrar";
import { Placa } from "./Placa";
import a from "./acceso.module.css";

const b64 = (b: Uint8Array) => {
  let x = "";
  for (const c of b) x += String.fromCharCode(c);
  return btoa(x);
};

type Fase =
  | { tipo: "papel" }
  | { tipo: "codigo"; recuperacionId: string; destino: string; canal: "correo" | "sms" }
  | { tipo: "hecho" };

/** El texto de cada error del servidor, para quien está recuperando la cuenta. */
function mensaje(e: unknown): string {
  if (!(e instanceof ErrorApi)) return "No se ha podido comprobar. Vuelve a intentarlo.";
  const d = e.datos;
  if (e.estado === 0) return "No hay conexión con Bark & Meow. Vuelve a intentarlo.";
  if (d.motivo === "papel") return "El código en papel no corresponde a ese chip.";
  if (e.estado === 410) return "La recuperación ha caducado o se ha agotado. Vuelve a empezar.";
  if (d.motivo === "incorrecto")
    return `El código no es correcto. Te quedan ${String(d.intentosRestantes)} intentos.`;
  if (e.estado === 429) return "Demasiados intentos. Espera un minuto y vuelve a probar.";
  if (e.estado === 502) return "No hemos podido enviarte el código. Vuelve a intentarlo en un momento.";
  return "No se ha podido comprobar. Revisa los datos y vuelve a intentarlo.";
}

/* Recuperar la contraseña: el código en papel y, después, el código del
   segundo factor. El papel no sale del navegador: con él se firma un reto del
   servidor, que solo guarda la clave pública con que comprobarlo. */
export function RecuperarCuenta() {
  const [chip, setChip] = useState("");
  const [papel, setPapel] = useState("");
  const [codigo, setCodigo] = useState("");
  const [password, setPassword] = useState("");
  const [repetida, setRepetida] = useState("");
  const [fase, setFase] = useState<Fase>({ tipo: "papel" });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = useId();

  async function alProbar(ev: FormEvent) {
    ev.preventDefault();
    const id = identificar(chip);
    if (!id) return setError("Un microchip ISO tiene 15 dígitos.");
    const semilla = await leerCodigo(papel);
    if (!semilla) return setError("El código en papel no es válido: revisa cada bloque.");
    setEnviando(true);
    setError(null);
    try {
      const cripto = await cargarCripto(fetch(CRYPTO_WASM_URL));
      const clave = claveDeDueno(cripto, semilla);
      const rec = claveDeRecuperacion(cripto, clave.secreta);
      const { recuperacionId, reto } = await empezarRecuperacion(id);
      const firma = cripto.firmar(rec.semilla, new TextEncoder().encode(mensajeRecuperacion(recuperacionId, reto)));
      const r = await probarPapel(recuperacionId, b64(rec.publica), b64(firma));
      // El papel ya está leído: la clave se queda en este navegador, como al abrir la bandeja.
      await guardarClave(clave.secreta, clave.publica).catch(() => {});
      setFase({ tipo: "codigo", recuperacionId, destino: r.destino, canal: r.canal });
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setEnviando(false);
    }
  }

  async function alTerminar(ev: FormEvent) {
    ev.preventDefault();
    if (fase.tipo !== "codigo") return;
    const limpio = codigo.toUpperCase().replace(/[\s-]/g, "");
    if (limpio.length !== 8) return setError("El código tiene 8 caracteres.");
    if (password.length < 12) return setError("La contraseña nueva necesita al menos 12 caracteres.");
    if (password !== repetida) return setError("Las dos contraseñas no coinciden.");
    setEnviando(true);
    setError(null);
    try {
      await terminarRecuperacion(fase.recuperacionId, limpio, password);
      setFase({ tipo: "hecho" });
    } catch (e) {
      if (e instanceof ErrorApi && e.estado === 410) {
        setFase({ tipo: "papel" });
        setCodigo("");
      }
      setError(mensaje(e));
    } finally {
      setEnviando(false);
    }
  }

  const avisoError = error && (
    <p id={`${ids}-error`} className={ui.fieldError} role="alert">
      {error}
    </p>
  );

  return (
    <main className={a.acceso}>
      <section className={a.portada} aria-labelledby={`${ids}-titular`}>
        <div className={a.portadaTexto}>
          <h1 id={`${ids}-titular`} className={a.titular}>
            Una contraseña nueva, <span className={a.titularQuieto}>con tu papel.</span>
          </h1>
          <p className={a.entradilla}>
            Te pedimos el código de recuperación que apuntaste en el alta y un código que te
            llega al correo o por SMS. Así, quien consiga entrar en tu correo no puede quedarse
            con tu cuenta.
          </p>
        </div>
        <Placa chip={chip} />
      </section>

      {fase.tipo === "hecho" ? (
        <div className={a.tarjeta}>
          <h2 className={a.tarjetaTitulo}>Contraseña cambiada</h2>
          <p className={a.tarjetaNota}>
            Hemos cerrado tu sesión en todos los navegadores y en la app. Entra con la contraseña
            nueva.
          </p>
          <Button asChild className="w-full">
            <Link href="/entrar">Entrar</Link>
          </Button>
        </div>
      ) : fase.tipo === "codigo" ? (
        <form className={a.tarjeta} onSubmit={alTerminar} noValidate aria-labelledby={`${ids}-titulo`}>
          <h2 id={`${ids}-titulo`} className={a.tarjetaTitulo}>
            {fase.canal === "sms" ? "Revisa tu móvil" : "Revisa tu correo"}
          </h2>
          <p className={a.tarjetaNota}>
            Te hemos enviado un código a <strong>{fase.destino}</strong>. Caduca en 15 minutos.
          </p>
          <div className={ui.field}>
            <Label htmlFor={`${ids}-codigo`}>Código</Label>
            <Input
              id={`${ids}-codigo`}
              className="font-mono uppercase tracking-[0.08em]"
              autoComplete="one-time-code"
              autoFocus
              maxLength={12}
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
              aria-describedby={`${ids}-password-ayuda`}
            />
            <span id={`${ids}-password-ayuda`} className={ui.hint}>
              Mínimo 12 caracteres.
            </span>
          </div>
          <div className={ui.field}>
            <Label htmlFor={`${ids}-repetida`}>Repítela</Label>
            <PasswordInput
              id={`${ids}-repetida`}
              autoComplete="new-password"
              value={repetida}
              onChange={(e) => setRepetida(e.target.value)}
            />
          </div>
          {avisoError}
          <Button type="submit" disabled={enviando} className="w-full">
            {enviando ? "Guardando…" : "Guardar la contraseña nueva"}
          </Button>
        </form>
      ) : (
        <form className={a.tarjeta} onSubmit={alProbar} noValidate aria-labelledby={`${ids}-titulo`}>
          <h2 id={`${ids}-titulo`} className={a.tarjetaTitulo}>
            Recuperar la contraseña
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
            <Label htmlFor={`${ids}-papel`}>Código de recuperación</Label>
            <Input
              id={`${ids}-papel`}
              className="font-mono uppercase tracking-[0.08em]"
              placeholder="XXXX XXXX XXXX XXXX XXXX XXXX XXXX XXXX"
              autoComplete="off"
              spellCheck={false}
              value={papel}
              onChange={(e) => setPapel(e.target.value)}
              aria-describedby={`${ids}-papel-ayuda`}
            />
            <span id={`${ids}-papel-ayuda`} className={ui.hint}>
              Los 8 bloques del papel del alta. No sale de este navegador.
            </span>
          </div>
          {avisoError}
          <Button type="submit" disabled={enviando} className="w-full">
            {enviando ? "Comprobando…" : "Continuar"}
          </Button>
          <p className={a.tarjetaNota}>
            ¿Has perdido el papel? Sin él no podemos comprobar que la cuenta es tuya. Da de alta
            de nuevo a tu mascota y pide en una clínica que reclame el chip con ella delante.
          </p>
          <div className={a.separador}>¿Te acuerdas de ella?</div>
          <Button asChild variant="outline" size="md" className="w-full">
            <Link href="/entrar">Volver a entrar</Link>
          </Button>
        </form>
      )}
    </main>
  );
}
