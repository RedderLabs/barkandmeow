"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { cargarCripto, claveDeDueno, type CodigoRecuperacion } from "@barkandmeow/crypto";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { Button } from "@barkandmeow/ui-web/components/button";
import { Input } from "@barkandmeow/ui-web/components/input";
import { PasswordInput } from "@barkandmeow/ui-web/components/password-input";
import { Label } from "@barkandmeow/ui-web/components/label";
import { darDeAlta, ErrorApi, identificar, type Activacion } from "@/lib/api";
import { guardarClave } from "@/lib/claves";
import { CRYPTO_WASM_URL } from "@/lib/crypto-url";
import { CLASE_CHIP, formatearChip } from "./Entrar";
import { CodigoActivacion, PasoCodigo, Recuperacion } from "./Piezas";
import { Placa } from "./Placa";
import a from "./acceso.module.css";

const b64 = (b: Uint8Array) => {
  let x = "";
  for (const c of b) x += String.fromCharCode(c);
  return btoa(x);
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* Los tres pasos del alta, uno por pantalla: la mascota, la cuenta y la
   clave. La llamada al servidor es una sola, al final. */
const PASOS = [
  { nombre: "Tu mascota", titulo: "¿Cómo se llama y qué chip lleva?" },
  { nombre: "Tu cuenta", titulo: "Para entrar, tu correo y una contraseña" },
  { nombre: "Tu clave", titulo: "Apunta tu código de recuperación" },
] as const;

type Fase =
  | { tipo: "pasos" }
  | { tipo: "enviando" }
  | { tipo: "codigo"; correo: string; activacion: Activacion }
  | { tipo: "hecho"; activacion: Activacion };

export function Alta() {
  const router = useRouter();
  const [paso, setPaso] = useState(0);
  const [chip, setChip] = useState("");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [papel, setPapel] = useState<{ codigo: CodigoRecuperacion | null; confirmado: boolean }>({
    codigo: null,
    confirmado: false,
  });
  const [intentado, setIntentado] = useState(false);
  const [emailUsado, setEmailUsado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fase, setFase] = useState<Fase>({ tipo: "pasos" });
  const ids = useId();

  const id = identificar(chip);
  const errores: Record<string, string> = {};
  if (intentado && paso === 0 && !id) errores.chip = "Un microchip ISO tiene 15 dígitos.";
  if (intentado && paso === 1) {
    if (!EMAIL.test(email.trim())) errores.email = "Revisa el correo.";
    else if (emailUsado === email.trim().toLowerCase())
      errores.email = "Ya hay una cuenta con este correo. Entra con ella para añadir otra mascota.";
    if (password.length < 12) errores.password = "Mínimo 12 caracteres.";
  }

  function pasoValido(p: number) {
    if (p === 0) return !!id;
    if (p === 1) return EMAIL.test(email.trim()) && password.length >= 12 && emailUsado !== email.trim().toLowerCase();
    return papel.confirmado && !!papel.codigo;
  }

  function ir(p: number) {
    setIntentado(false);
    setError(null);
    setPaso(p);
    // El foco al primer campo del paso nuevo, para seguir con el teclado.
    setTimeout(() => document.querySelector<HTMLInputElement>(`[data-paso="${p}"] input`)?.focus(), 0);
  }

  async function alEnviar(ev: FormEvent) {
    ev.preventDefault();
    setIntentado(true);
    if (!pasoValido(paso)) return;
    if (paso < 2) return ir(paso + 1);

    setFase({ tipo: "enviando" });
    try {
      const cripto = await cargarCripto(fetch(CRYPTO_WASM_URL));
      const clave = claveDeDueno(cripto, papel.codigo!.semilla);
      const r = await darDeAlta({
        email: email.trim().toLowerCase(),
        password,
        pubKey: b64(clave.publica),
        mascota: { identificador: id!, nombre: nombre.trim() },
      });
      await guardarClave(clave.secreta, clave.publica);
      setFase({ tipo: "codigo", correo: r.correo, activacion: r.mascota });
    } catch (err) {
      setFase({ tipo: "pasos" });
      if (err instanceof ErrorApi && err.estado === 409) {
        setEmailUsado(email.trim().toLowerCase());
        setIntentado(true);
        setPaso(1);
        return;
      }
      setError(
        err instanceof ErrorApi && err.estado === 0
          ? "No hay conexión con Bark & Meow. Tu código de recuperación sigue siendo el mismo: vuelve a intentarlo."
          : "No se ha podido crear la cuenta. Revisa los datos y vuelve a intentarlo.",
      );
    }
  }

  const portada = (
    <section className={a.portada} aria-labelledby={`${ids}-titular`}>
      <div className={a.portadaTexto}>
        <h1 id={`${ids}-titular`} className={a.titular}>
        {fase.tipo === "hecho" ? (
          <>
            Último paso: <span className={a.titularQuieto}>la clínica.</span>
          </>
        ) : (
          <>
            Dale su placa. <span className={a.titularQuieto}>Tres pasos.</span>
          </>
        )}
      </h1>
      <p className={a.entradilla}>
        {fase.tipo === "hecho"
          ? `Para que el chip de ${nombre.trim() || "tu mascota"} funcione, una clínica tiene que activarlo con el animal delante. Así nadie puede registrar como suyo el chip de una mascota ajena.`
          : "Su chip, tu cuenta y tu clave. Después, una clínica activa el chip con el animal delante: así nadie puede registrar como suyo el de una mascota ajena."}
      </p>
      </div>
      <Placa chip={chip} />
    </section>
  );

  if (fase.tipo === "codigo")
    return (
      <main className={a.acceso}>
        {portada}
        <div className={a.tarjeta}>
          <PasoCodigo
            sinMarco
            claseTitulo={a.tarjetaTitulo}
            correo={fase.correo}
            titulo="Confirma tu correo"
            alTerminar={() => setFase({ tipo: "hecho", activacion: fase.activacion })}
          />
        </div>
      </main>
    );

  if (fase.tipo === "hecho")
    return (
      <main className={a.acceso}>
        {portada}
        <div className={a.tarjeta}>
          <h2 className={a.tarjetaTitulo}>Tu cuenta está lista</h2>
          <CodigoActivacion
            codigo={fase.activacion.codigoActivacion}
            caduca={fase.activacion.caduca}
            nombre={nombre.trim()}
          />
          <Button
            type="button"
            className="w-full"
            onClick={() => {
              router.replace("/");
              router.refresh();
            }}
          >
            Ir a mis mascotas
          </Button>
        </div>
      </main>
    );

  const enviando = fase.tipo === "enviando";

  return (
    <main className={a.acceso}>
      {portada}

      <form className={a.tarjeta} onSubmit={alEnviar} noValidate aria-labelledby={`${ids}-titulo`}>
        <ol className={a.pasos} aria-label="Progreso del alta">
          {PASOS.map((p, i) => (
            <li
              key={p.nombre}
              className={`${a.paso} ${i < paso ? a.pasoHecho : ""} ${i === paso ? a.pasoActual : ""}`}
              aria-current={i === paso ? "step" : undefined}
            >
              {p.nombre}
            </li>
          ))}
        </ol>

        <h2 id={`${ids}-titulo`} className={a.tarjetaTitulo}>
          {PASOS[paso].titulo}
        </h2>

        {paso === 0 && (
          <div className="flex flex-col gap-4" data-paso="0">
            <div className={ui.field}>
              <Label htmlFor={`${ids}-chip`}>Número del microchip</Label>
              <Input
                id={`${ids}-chip`}
                className={CLASE_CHIP}
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                maxLength={32}
                placeholder="000 000 000 000 000"
                value={chip}
                onChange={(e) => setChip(formatearChip(e.target.value))}
                aria-invalid={errores.chip ? true : undefined}
                aria-describedby={`${ids}-chip-ayuda`}
              />
              <span id={`${ids}-chip-ayuda`} className={errores.chip ? ui.fieldError : ui.hint}>
                {errores.chip ?? "15 dígitos. Está en su pasaporte o en la cartilla de la clínica."}
              </span>
            </div>
            <div className={ui.field}>
              <Label htmlFor={`${ids}-nombre`}>Cómo se llama</Label>
              <Input id={`${ids}-nombre`} maxLength={60} value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </div>
          </div>
        )}

        {paso === 1 && (
          <div className="flex flex-col gap-4" data-paso="1">
            <p className={a.tarjetaNota}>
              Para entrar necesitarás el número de chip, esta contraseña y un código que te
              llegará a este correo.
            </p>
            <div className={ui.field}>
              <Label htmlFor={`${ids}-email`}>Correo</Label>
              <Input
                id={`${ids}-email`}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={errores.email ? true : undefined}
                aria-describedby={errores.email ? `${ids}-email-error` : undefined}
              />
              {errores.email && (
                <span id={`${ids}-email-error`} className={ui.fieldError}>
                  {errores.email}
                </span>
              )}
            </div>
            <div className={ui.field}>
              <Label htmlFor={`${ids}-password`}>Contraseña</Label>
              <PasswordInput
                id={`${ids}-password`}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={errores.password ? true : undefined}
                aria-describedby={`${ids}-password-ayuda`}
              />
              <span id={`${ids}-password-ayuda`} className={errores.password ? ui.fieldError : ui.hint}>
                {errores.password ?? "Mínimo 12 caracteres."}
              </span>
            </div>
          </div>
        )}

        {paso === 2 && (
          <div data-paso="2">
            <Recuperacion
              sinMarco
              codigoInicial={papel.codigo}
              copia={{ chip, nombre }}
              onCambio={setPapel}
              faltaPapel={intentado}
            />
          </div>
        )}

        {error && (
          <div className={ui.alertBlock} role="alert">
            <strong>No se ha creado la cuenta.</strong>
            {error}
          </div>
        )}

        <div className={a.acciones}>
          {paso > 0 && (
            <Button type="button" variant="outline" size="md" disabled={enviando} onClick={() => ir(paso - 1)}>
              Atrás
            </Button>
          )}
          <Button type="submit" className="flex-1" disabled={enviando || (paso === 2 && !papel.codigo)}>
            {enviando ? "Creando la cuenta…" : paso < 2 ? "Continuar" : "Crear la cuenta"}
          </Button>
        </div>

        {paso === 0 && (
          <>
            <div className={a.separador}>¿Ya tienes cuenta?</div>
            <Button asChild variant="outline" size="md" className="w-full">
              <Link href="/entrar">Entrar para añadir otra mascota</Link>
            </Button>
          </>
        )}
      </form>
    </main>
  );
}
