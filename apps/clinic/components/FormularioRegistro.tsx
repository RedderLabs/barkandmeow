"use client";

import Link from "next/link";
import { useEffect, useId, useState, type FormEvent } from "react";
import { cargarCripto, claveDeClinica, nuevoCodigo, type CodigoRecuperacion } from "@barkandmeow/crypto";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { IconAlert, IconCheck, IconKey } from "@barkandmeow/ui-web/parts";
import { Button } from "@barkandmeow/ui-web/components/button";
import { Checkbox } from "@barkandmeow/ui-web/components/checkbox";
import { Input } from "@barkandmeow/ui-web/components/input";
import { PasswordInput } from "@barkandmeow/ui-web/components/password-input";
import { Label } from "@barkandmeow/ui-web/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@barkandmeow/ui-web/components/select";
import { dominioDeCorreo } from "@barkandmeow/schema/correo";
import { ErrorApi, reenviarCodigo, registrarClinica, verificarCorreo, type CorreoVerificado } from "@/lib/api";
import { guardarClaves } from "@/lib/claves";
import { CRYPTO_WASM_URL } from "@/lib/crypto-url";

/* Alta de la clínica.

   La clave de la clínica se genera aquí y no sale de aquí: se deriva del
   código de recuperación (packages/crypto), al servidor solo va la pública, y
   la privada se guarda en este navegador. El código se muestra antes de crear
   la clínica y hay que teclear dos de sus bloques: si no está apuntado, no se
   deja continuar. Una casilla marcada no demuestra que exista el papel. */

type Datos = {
  nombre: string;
  pais: string;
  registroSanitario: string;
  direccion: string;
  adminNombre: string;
  email: string;
  password: string;
};

const VACIO: Datos = {
  nombre: "",
  pais: "PT",
  registroSanitario: "",
  direccion: "",
  adminNombre: "",
  email: "",
  password: "",
};

type Fase =
  | { tipo: "formulario"; error: string | null }
  | { tipo: "creando" }
  | { tipo: "codigo"; correo: string; dominio: string | null }
  | { tipo: "creada"; resultado: CorreoVerificado };

const b64 = (b: Uint8Array) => {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
};

const normalizarBloque = (s: string) =>
  s.toUpperCase().replace(/\s/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");

function errores(d: Datos) {
  const e: Partial<Record<keyof Datos, string>> = {};
  if (d.nombre.trim().length < 2) e.nombre = "Falta el nombre de la clínica.";
  if (d.adminNombre.trim().length < 2) e.adminNombre = "Falta tu nombre.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) e.email = "Revisa el correo.";
  if (d.password.length < 12) e.password = "Mínimo 12 caracteres.";
  return e;
}

export function FormularioRegistro() {
  const [datos, setDatos] = useState<Datos>(VACIO);
  const [codigo, setCodigo] = useState<CodigoRecuperacion | null>(null);
  // Los dos bloques que hay que teclear, elegidos al azar al cargar.
  const [pedidos, setPedidos] = useState<[number, number] | null>(null);
  const [confirmacion, setConfirmacion] = useState(["", ""]);
  const [apuntado, setApuntado] = useState(false);
  const [intentado, setIntentado] = useState(false);
  const [fase, setFase] = useState<Fase>({ tipo: "formulario", error: null });
  const [emailUsado, setEmailUsado] = useState<string | null>(null);
  const ids = useId();

  // El código se genera una vez y se mantiene si el alta falla y se reintenta:
  // puede que ya esté apuntado.
  useEffect(() => {
    void nuevoCodigo().then((c) => {
      setCodigo(c);
      const a = crypto.getRandomValues(new Uint32Array(1))[0] % 8;
      const b = (a + 1 + (crypto.getRandomValues(new Uint32Array(1))[0] % 7)) % 8;
      setPedidos(a < b ? [a, b] : [b, a]);
    });
  }, []);

  const e = intentado ? errores(datos) : {};
  if (intentado && emailUsado && emailUsado === datos.email.trim().toLowerCase())
    e.email = "Ya hay una cuenta con este correo. Entra con ella o usa otro.";
  const confirmado =
    !!codigo &&
    !!pedidos &&
    pedidos.every((p, i) => normalizarBloque(confirmacion[i]) === codigo.bloques[p]);
  const faltaPapel = intentado && (!apuntado || !confirmado);

  const campo = (k: keyof Datos) => ({
    id: `${ids}-${k}`,
    value: datos[k],
    onChange: (ev: { target: { value: string } }) => setDatos((d) => ({ ...d, [k]: ev.target.value })),
    "aria-invalid": e[k] ? true : undefined,
    "aria-describedby": e[k] ? `${ids}-${k}-error` : undefined,
  });
  const error = (k: keyof Datos) =>
    e[k] && (
      <span id={`${ids}-${k}-error`} className={ui.fieldError}>
        {e[k]}
      </span>
    );

  async function alEnviar(ev: FormEvent) {
    ev.preventDefault();
    setIntentado(true);
    const errs = errores(datos);
    const primero = Object.keys(errs)[0];
    if (primero) {
      document.getElementById(`${ids}-${primero}`)?.focus();
      return;
    }
    if (!apuntado || !confirmado || !codigo) {
      document.getElementById(`${ids}-confirmar-0`)?.focus();
      return;
    }

    setFase({ tipo: "creando" });
    try {
      const cripto = await cargarCripto(fetch(CRYPTO_WASM_URL));
      const clinica = claveDeClinica(cripto, codigo.semilla);
      const dispositivo = crypto.getRandomValues(new Uint8Array(32));

      const hecho = await registrarClinica({
        nombre: datos.nombre.trim(),
        pais: datos.pais,
        registroSanitario: datos.registroSanitario.trim() || undefined,
        direccion: datos.direccion.trim() || undefined,
        pubKey: b64(clinica.publica),
        admin: {
          nombre: datos.adminNombre.trim(),
          email: datos.email.trim().toLowerCase(),
          password: datos.password,
          devicePubKey: b64(cripto.publica(dispositivo)),
        },
      });

      await guardarClaves({
        clinicId: hecho.clinicId,
        clinica: clinica.secreta,
        dispositivo,
        guardada: new Date().toISOString(),
      });
      setFase({ tipo: "codigo", correo: hecho.correo, dominio: hecho.dominio });
      window.scrollTo({ top: 0 });
    } catch (err) {
      if (err instanceof ErrorApi && err.estado === 409) {
        setEmailUsado(datos.email.trim().toLowerCase());
        setFase({ tipo: "formulario", error: null });
        document.getElementById(`${ids}-email`)?.focus();
        return;
      }
      setFase({
        tipo: "formulario",
        error:
          err instanceof ErrorApi && err.estado === 0
            ? "No hay conexión con Bark & Meow. El código de recuperación sigue siendo el mismo: vuelve a intentarlo."
            : "No se ha podido crear la clínica. Revisa los datos y vuelve a intentarlo; el código de recuperación no cambia.",
      });
    }
  }

  if (fase.tipo === "codigo")
    return (
      <VerificarCorreo
        correo={fase.correo}
        dominio={fase.dominio}
        onHecho={(resultado) => {
          setFase({ tipo: "creada", resultado });
          window.scrollTo({ top: 0 });
        }}
      />
    );
  if (fase.tipo === "creada") return <ClinicaCreada resultado={fase.resultado} />;

  const creando = fase.tipo === "creando";

  return (
    <main className={ui.reading}>
      <form className={ui.formContents} onSubmit={alEnviar} noValidate>
        <div className={ui.readingMain}>
          <div>
            <h1 className={ui.pageTitle}>Registrar la clínica</h1>
            <p className={ui.lede}>
              Cuatro pasos. El último es el importante: la clave de la clínica es lo
              que los dueños autorizan, y sin ella no hay acceso a ninguna ficha.
            </p>
          </div>

          <section className={ui.panel}>
            <h2 className={ui.panelTitle}>La clínica</h2>
            <div className={ui.field}>
              <Label htmlFor={`${ids}-nombre`}>Nombre</Label>
              <Input type="text" placeholder="Clínica Veterinaria…" autoComplete="organization" {...campo("nombre")} />
              {error("nombre")}
            </div>
            <div className={ui.fieldRow}>
              <Label className={ui.field}>
                País
                <Select value={datos.pais} onValueChange={(v) => setDatos((d) => ({ ...d, pais: v }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ES">España</SelectItem>
                    <SelectItem value="PT">Portugal</SelectItem>
                    <SelectItem value="FR">Francia</SelectItem>
                  </SelectContent>
                </Select>
              </Label>
              <Label className={ui.field} htmlFor={`${ids}-registroSanitario`}>
                Número de registro sanitario
                <Input className="font-mono" type="text" {...campo("registroSanitario")} />
              </Label>
            </div>
            <Label className={ui.field} htmlFor={`${ids}-direccion`}>
              Dirección
              <Input type="text" autoComplete="street-address" {...campo("direccion")} />
            </Label>
          </section>

          <section className={ui.panel}>
            <h2 className={ui.panelTitle}>Tu cuenta de administrador</h2>
            <p className={ui.panelNote}>
              El administrador gestiona el equipo y custodia la clave de la clínica.
              Puede hacer todo lo que hace un veterinario. Te enviaremos un código a este
              correo: con el correo de la clínica (nombre@tuclinica.es), confirmarlo verifica
              también la clínica.
            </p>
            <div className={ui.fieldRow}>
              <div className={ui.field}>
                <Label htmlFor={`${ids}-adminNombre`}>Nombre y apellidos</Label>
                <Input type="text" autoComplete="name" {...campo("adminNombre")} />
                {error("adminNombre")}
              </div>
              <div className={ui.field}>
                <Label htmlFor={`${ids}-email`}>Correo</Label>
                <Input type="email" autoComplete="email" {...campo("email")} />
                {error("email")}
                <PistaCorreo email={datos.email} />
              </div>
            </div>
            <div className={ui.field}>
              <Label htmlFor={`${ids}-password`}>Contraseña</Label>
              <PasswordInput autoComplete="new-password" minLength={12} {...campo("password")} />
              {error("password") ?? <span className={ui.hint}>Mínimo 12 caracteres.</span>}
            </div>
          </section>

          <section className={ui.panel} aria-labelledby={`${ids}-clave`}>
            <h2 id={`${ids}-clave`} className={ui.panelTitle}>
              <IconKey size={20} /> La clave de la clínica
            </h2>
            <p className={ui.panelNote}>
              Se genera en este navegador y no sale de aquí. Cuando un dueño autoriza a tu
              clínica, envuelve la clave de su ficha contra esta. Ni Bark & Meow ni nadie
              más tiene una copia.
            </p>
            <p className={ui.bodyNote}>
              Este código <strong>es</strong> la clave: con él se reconstruye en otro
              navegador. Si pierdes este navegador y el código, se pierden todos los
              permisos concedidos y cada dueño tendría que autorizarte de nuevo, uno por uno.
            </p>

            <div className={ui.recovery} aria-live="polite">
              {codigo ? (
                codigo.bloques.map((bloque, i) => (
                  <span key={i} className={ui.recoveryCell}>
                    <span className="sr-only">Bloque {i + 1}: </span>
                    {bloque}
                  </span>
                ))
              ) : (
                <span className={ui.recoveryCell} style={{ gridColumn: "1 / -1" }}>
                  Generando…
                </span>
              )}
            </div>

            <Label className={ui.check}>
              <Checkbox checked={apuntado} onCheckedChange={(v) => setApuntado(v === true)} />
              He apuntado el código en papel y lo guardo fuera de la clínica.
            </Label>

            {pedidos && (
              <fieldset className={`${ui.field} m-0 min-w-0 border-0 p-0`}>
                <legend className="mb-1.5 text-sm font-medium text-ink">
                  Para comprobarlo, escribe dos bloques del código
                </legend>
                <div className={ui.confirmRow}>
                  {pedidos.map((p, i) => (
                    <Label key={p} className={ui.field} htmlFor={`${ids}-confirmar-${i}`}>
                      Bloque {p + 1}
                      <Input
                        id={`${ids}-confirmar-${i}`}
                        className="font-mono uppercase tracking-[0.08em]"
                        maxLength={4}
                        autoComplete="off"
                        autoCapitalize="characters"
                        spellCheck={false}
                        value={confirmacion[i]}
                        onChange={(ev) =>
                          setConfirmacion((c) => c.map((v, j) => (j === i ? ev.target.value : v)))
                        }
                        aria-invalid={
                          faltaPapel && normalizarBloque(confirmacion[i]) !== codigo?.bloques[p]
                            ? true
                            : undefined
                        }
                      />
                    </Label>
                  ))}
                </div>
              </fieldset>
            )}
            {faltaPapel && (
              <span className={ui.fieldError} role="alert">
                {!apuntado
                  ? "Marca la casilla cuando el código esté apuntado en papel."
                  : "Los bloques no coinciden con el código. Revísalos en el papel."}
              </span>
            )}
          </section>
        </div>

        {/* Lo que la cuenta no hace va al lado del formulario en un monitor:
            se lee mientras se rellena, no después. */}
        <aside className={`${ui.panel} ${ui.panelWarn} ${ui.readingAside}`}>
          <h2 className={ui.panelTitle}>
            <IconAlert size={20} /> Lo que esta cuenta no hace
          </h2>
          <p className={ui.panelNote}>
            Registrarte no te da acceso a ninguna ficha. La cuenta identifica a tu
            clínica; cada paciente sigue necesitando que su dueño te autorice, y puede
            retirarte cuando quiera. Es a propósito: es lo que hace que los dueños
            acepten que estés ahí.
          </p>
        </aside>

        <div className={`${ui.readingActions} flex flex-col gap-3`}>
          {fase.tipo === "formulario" && fase.error && (
            <div className={ui.alertBlock} role="alert">
              <strong>No se ha creado la clínica.</strong>
              {fase.error}
            </div>
          )}
          <div className={ui.actions}>
            <Button type="submit" disabled={creando || !codigo}>
              {creando ? "Creando la clínica…" : "Crear la clínica"}
            </Button>
            <span className={ui.hint}>
              Después te pediremos el código que llegará a tu correo.
            </span>
          </div>
        </div>
      </form>
    </main>
  );
}

/* ── Pista del correo ─────────────────────────────────────── */

function PistaCorreo({ email }: { email: string }) {
  const d = email.includes("@") ? email.split("@")[1]?.trim() : "";
  if (!d || !d.includes(".")) return null;
  const dominio = dominioDeCorreo(email);
  return dominio ? (
    <span className={ui.hint}>
      Al confirmar el código, la clínica quedará verificada con <strong>{dominio}</strong>.
    </span>
  ) : (
    <span className={ui.hint}>
      Es un correo gratuito: funciona, pero la clínica no tendrá el sello de verificada. Si
      la clínica tiene correo propio, usa ese.
    </span>
  );
}

/* ── Código del correo ─────────────────────────────────────── */

function VerificarCorreo({
  correo,
  dominio,
  onHecho,
  recienCreada = true,
}: {
  correo: string;
  dominio: string | null;
  onHecho: (r: CorreoVerificado) => void;
  /** Justo después del registro la clave se acaba de guardar aquí. */
  recienCreada?: boolean;
}) {
  const [codigo, setCodigo] = useState("");
  const [estado, setEstado] = useState<"libre" | "comprobando">("libre");
  const [error, setError] = useState<string | null>(null);
  const [reenvio, setReenvio] = useState<string | null>(null);
  const [espera, setEspera] = useState(60);
  const ids = useId();

  // Cuenta atrás hasta poder pedir otro código (el servidor admite uno por minuto).
  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  async function comprobar(ev: FormEvent) {
    ev.preventDefault();
    const limpio = codigo.toUpperCase().replace(/[\s-]/g, "");
    if (limpio.length !== 8) {
      setError("El código tiene 8 caracteres.");
      return;
    }
    setEstado("comprobando");
    setError(null);
    try {
      onHecho(await verificarCorreo(limpio));
    } catch (e) {
      const datos = e instanceof ErrorApi ? e.datos : {};
      setError(
        datos.motivo === "incorrecto"
          ? `El código no es correcto. Te quedan ${String(datos.intentosRestantes)} intentos.`
          : datos.motivo === "caducado"
            ? "El código ha caducado. Pide uno nuevo."
            : datos.motivo === "demasiados-intentos"
              ? "Demasiados intentos con este código. Pide uno nuevo."
              : "No se ha podido comprobar. Revisa la conexión y vuelve a intentarlo.",
      );
      setEstado("libre");
    }
  }

  async function pedirOtro() {
    setReenvio(null);
    setError(null);
    try {
      await reenviarCodigo();
      setReenvio("Te hemos enviado un código nuevo. El anterior ya no vale.");
      setCodigo("");
      setEspera(60);
    } catch (e) {
      const d = e instanceof ErrorApi ? e.datos : {};
      if (d.motivo === "espera") setEspera(Number(d.segundos) || 60);
      else setError("No se ha podido enviar el correo. Vuelve a intentarlo en un momento.");
    }
  }

  return (
    <main className={ui.reading}>
      <form className={ui.formContents} onSubmit={comprobar} noValidate>
        <div className={ui.readingMain}>
          <div>
            <h1 className={ui.pageTitle}>Revisa tu correo</h1>
            <p className={ui.lede}>
              Hemos enviado un código de 8 caracteres a <strong>{correo}</strong>. Caduca en 15
              minutos.
            </p>
          </div>

          {recienCreada ? (
            <div className={ui.okBlock} role="status">
              <strong>
                <IconCheck /> Clínica creada y clave guardada en este navegador
              </strong>
              Falta confirmar el correo para activarla: hasta entonces no puedes añadir a
              nadie al equipo ni pedir acceso a fichas.
            </div>
          ) : (
            <div className={ui.pendingBlock} role="status">
              Falta confirmar el correo para activar la clínica: hasta entonces no puedes
              añadir a nadie al equipo ni pedir acceso a fichas.
            </div>
          )}

          <section className={ui.panel}>
            <h2 className={ui.panelTitle}>Código de verificación</h2>
            <Label className={ui.field} htmlFor={`${ids}-codigo`}>
              Código
              <Input
                id={`${ids}-codigo`}
                className="h-[52px] max-w-[16rem] font-mono text-lg uppercase tracking-[0.12em]"
                inputMode="text"
                autoComplete="one-time-code"
                autoCapitalize="characters"
                spellCheck={false}
                autoFocus
                maxLength={9}
                placeholder="XXXX-XXXX"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${ids}-codigo-error` : undefined}
              />
            </Label>
            {/* Fuera de la etiqueta: el error no forma parte del nombre del campo. */}
            {error && (
              <span id={`${ids}-codigo-error`} className={ui.fieldError} role="alert">
                {error}
              </span>
            )}
            <p className={ui.panelNote}>
              {dominio ? (
                <>
                  Al confirmarlo, la clínica queda verificada con <strong>{dominio}</strong>: los
                  dueños verán «clínica verificada» junto a su nombre.
                </>
              ) : (
                <>
                  Tu correo es de un proveedor gratuito: se confirmará el correo, pero la clínica
                  no tendrá el sello de verificada.
                </>
              )}
            </p>
          </section>
        </div>

        <aside className={`${ui.panel} ${ui.readingAside}`}>
          <h2 className={ui.panelTitle}>¿No te llega?</h2>
          <p className={ui.panelNote}>
            Mira en la carpeta de correo no deseado. Si sigue sin llegar, pide otro: el
            anterior dejará de valer.
          </p>
          <Button type="button" variant="outline" size="md" disabled={espera > 0} onClick={() => void pedirOtro()}>
            {espera > 0 ? `Pedir otro código (${espera} s)` : "Pedir otro código"}
          </Button>
          {reenvio && (
            <p className={ui.hint} role="status">
              {reenvio}
            </p>
          )}
        </aside>

        <div className={`${ui.readingActions} ${ui.actions}`}>
          <Button type="submit" disabled={estado === "comprobando"}>
            {estado === "comprobando" ? "Comprobando…" : "Confirmar el correo"}
          </Button>
        </div>
      </form>
    </main>
  );
}

/* ── Después de verificar ─────────────────────────────────── */

function ClinicaCreada({ resultado }: { resultado: CorreoVerificado }) {
  return (
    <main className={ui.reading}>
      <div className={ui.readingMain}>
        <div>
          <h1 className={ui.pageTitle}>Clínica activa</h1>
          <p className={ui.lede}>
            Ya puedes entrar en la consola. La clave de la clínica está guardada en este
            navegador y su copia es el código que has apuntado.
          </p>
        </div>

        {resultado.clinicaVerificada ? (
          <div className={ui.okBlock} role="status">
            <strong>
              <IconCheck /> Clínica verificada · {resultado.dominio}
            </strong>
            Los dueños verán «clínica verificada» junto a vuestro nombre cuando pidáis acceso a
            una ficha.
          </div>
        ) : (
          <div className={ui.pendingBlock} role="status">
            Correo confirmado. Como es un correo gratuito, los dueños verán el nombre de la
            clínica con «correo verificado», sin el sello de clínica verificada.
          </div>
        )}

        <div className={ui.okBlock}>
          <strong>
            <IconCheck /> La clave no ha salido de este navegador
          </strong>
          Al servidor solo ha llegado su parte pública, la que los dueños usan para
          autorizaros.
        </div>
      </div>

      <aside className={`${ui.panel} ${ui.readingAside}`}>
        <h2 className={ui.panelTitle}>Siguiente paso</h2>
        <p className={ui.panelNote}>
          Nombra un segundo administrador: si este navegador se pierde, esa persona
          conserva la clave. Recomendado: dos personas, nunca una.
        </p>
        <div className="flex flex-col gap-3">
          <Button asChild>
            <Link href="/equipo">Añadir a un segundo administrador</Link>
          </Button>
          <Button asChild variant="outline" size="md">
            <Link href="/">Ir a la consola</Link>
          </Button>
        </div>
      </aside>
    </main>
  );
}

/** El paso del código fuera del registro: al terminar, a la consola. */
export function VerificarPendiente({ correo, dominio }: { correo: string; dominio: string | null }) {
  const [hecho, setHecho] = useState<CorreoVerificado | null>(null);
  if (hecho) return <ClinicaCreada resultado={hecho} />;
  return <VerificarCorreo correo={correo} dominio={dominio} onHecho={setHecho} recienCreada={false} />;
}
