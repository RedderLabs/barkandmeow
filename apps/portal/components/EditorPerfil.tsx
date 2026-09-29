"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FormEvent } from "react";
import { toast } from "@barkandmeow/ui-web/components/sonner";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { Button } from "@barkandmeow/ui-web/components/button";
import { Checkbox } from "@barkandmeow/ui-web/components/checkbox";
import { Input } from "@barkandmeow/ui-web/components/input";
import { Label } from "@barkandmeow/ui-web/components/label";
import { Textarea } from "@barkandmeow/ui-web/components/textarea";
import { ErrorApi, guardarPerfil, quitarFoto, subirFoto, type Telefono } from "@/lib/api";
import s from "./portal.module.css";

/* Perfil público: lo que ve quien encuentra al animal (escaneando la placa o
   con el número de chip) y el veterinario dentro de la ficha. Va sin cifrar
   porque su función es verse, así que el dueño decide qué publica, y la
   vista previa enseña exactamente eso. */

const TEL = /^\+?[0-9 ()-]{6,20}$/;
const FOTO_MAX = 2 * 1024 * 1024;

export function EditorPerfil({
  petId,
  inicial,
}: {
  petId: string;
  inicial: { nombre: string; bio: string; telefonos: Telefono[]; publicado: boolean; foto: string | null };
}) {
  const router = useRouter();
  const [nombre, setNombre] = useState(inicial.nombre);
  const [bio, setBio] = useState(inicial.bio);
  const [telefonos, setTelefonos] = useState<Telefono[]>(
    inicial.telefonos.length ? inicial.telefonos : [{ etiqueta: "", numero: "" }],
  );
  const [publicado, setPublicado] = useState(inicial.publicado);
  const [foto, setFoto] = useState(inicial.foto);
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [intentado, setIntentado] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);
  const ids = useId();

  const rellenos = telefonos.filter((t) => t.numero.trim());
  const telMalos = telefonos.map((t) => !!t.numero.trim() && !TEL.test(t.numero.trim()));
  const sinContacto = publicado && rellenos.length === 0;

  async function elegirFoto(f: File | undefined) {
    if (!f) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type))
      return toast("Formato no admitido", { description: "Usa una foto JPEG, PNG o WebP." });
    if (f.size > FOTO_MAX) return toast("Foto demasiado grande", { description: "Como mucho 2 MB." });
    setSubiendo(true);
    try {
      const r = await subirFoto(petId, f);
      setFoto(`/mi-mascota/api${r.foto}`);
    } catch {
      toast("No se ha podido subir la foto", { description: "Vuelve a intentarlo en un momento." });
    } finally {
      setSubiendo(false);
      if (archivo.current) archivo.current.value = "";
    }
  }

  async function borrarFoto() {
    try {
      await quitarFoto(petId);
      setFoto(null);
    } catch {
      toast("No se ha podido quitar la foto");
    }
  }

  async function guardar(ev: FormEvent) {
    ev.preventDefault();
    setIntentado(true);
    if (telMalos.some(Boolean) || sinContacto) return;
    setGuardando(true);
    try {
      await guardarPerfil(petId, {
        nombre: nombre.trim(),
        bio: bio.trim(),
        telefonos: rellenos.map((t) => ({ etiqueta: t.etiqueta.trim(), numero: t.numero.trim() })),
        publicado,
      });
      toast(publicado ? "Perfil publicado" : "Perfil guardado sin publicar", {
        description: publicado
          ? "Ya lo ve quien encuentre a tu mascota."
          : "Nadie lo ve hasta que lo publiques.",
      });
      router.refresh();
    } catch (e) {
      toast("No se ha guardado", {
        description: e instanceof ErrorApi && e.estado === 400 ? "Revisa los teléfonos." : "Vuelve a intentarlo.",
      });
    } finally {
      setGuardando(false);
    }
  }

  const cambiarTel = (i: number, campo: keyof Telefono, valor: string) =>
    setTelefonos((ts) => ts.map((t, j) => (j === i ? { ...t, [campo]: valor } : t)));

  return (
    <main className={ui.reading}>
      <form className={ui.formContents} onSubmit={guardar} noValidate>
        <div className={ui.readingMain}>
          <div>
            <h1 className={ui.pageTitle}>Perfil público</h1>
            <p className={ui.lede}>
              Lo que verá quien encuentre a {nombre.trim() || "tu mascota"}: al escanear su
              placa, al consultar su chip en una clínica y dentro de su ficha.
            </p>
          </div>

          <section className={ui.panel}>
            <h2 className={ui.panelTitle}>Foto</h2>
            <div className="flex items-center gap-4">
              {foto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className={s.foto} src={foto} alt={`Foto de ${nombre || "tu mascota"}`} width={64} height={64} />
              ) : (
                <span className={`${s.foto} ${s.fotoVacia}`} aria-hidden="true">
                  ?
                </span>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={subiendo}
                  onClick={() => archivo.current?.click()}
                >
                  {subiendo ? "Subiendo…" : foto ? "Cambiar la foto" : "Subir una foto"}
                </Button>
                {foto && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => void borrarFoto()}>
                    Quitar
                  </Button>
                )}
              </div>
              <input
                ref={archivo}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => void elegirFoto(e.target.files?.[0])}
              />
            </div>
            <p className={ui.hint}>Una foto de frente y reciente ayuda a reconocerla. JPEG, PNG o WebP de hasta 2 MB.</p>
          </section>

          <section className={ui.panel}>
            <h2 className={ui.panelTitle}>Datos</h2>
            <div className={ui.field}>
              <Label htmlFor={`${ids}-nombre`}>Cómo se llama</Label>
              <Input id={`${ids}-nombre`} maxLength={60} value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </div>
            <div className={ui.field}>
              <Label htmlFor={`${ids}-bio`}>Para quien la encuentre</Label>
              <Textarea
                id={`${ids}-bio`}
                rows={4}
                maxLength={600}
                placeholder="Carácter, cómo acercarse, si toma medicación…"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
              />
              <span className={s.contador}>{bio.length}/600</span>
            </div>
          </section>

          <section className={ui.panel}>
            <h2 className={ui.panelTitle}>Teléfonos de contacto</h2>
            <p className={ui.panelNote}>Hasta tres. Se muestran a quien encuentre a tu mascota.</p>
            {telefonos.map((t, i) => (
              <div key={i} className={s.telefonoFila}>
                <div className={ui.field}>
                  <Label htmlFor={`${ids}-et${i}`}>Quién</Label>
                  <Input
                    id={`${ids}-et${i}`}
                    maxLength={30}
                    placeholder="Móvil, casa…"
                    value={t.etiqueta}
                    onChange={(e) => cambiarTel(i, "etiqueta", e.target.value)}
                  />
                </div>
                <div className={ui.field}>
                  <Label htmlFor={`${ids}-num${i}`}>Número</Label>
                  <Input
                    id={`${ids}-num${i}`}
                    type="tel"
                    autoComplete="tel"
                    className="font-mono tabular-nums"
                    placeholder="+34 …"
                    value={t.numero}
                    onChange={(e) => cambiarTel(i, "numero", e.target.value)}
                    aria-invalid={intentado && telMalos[i] ? true : undefined}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Quitar el teléfono ${i + 1}`}
                  disabled={telefonos.length === 1}
                  onClick={() => setTelefonos((ts) => ts.filter((_, j) => j !== i))}
                >
                  Quitar
                </Button>
              </div>
            ))}
            {intentado && telMalos.some(Boolean) && (
              <p className={ui.fieldError} role="alert">
                Revisa los números: solo cifras, espacios y el prefijo con +.
              </p>
            )}
            {telefonos.length < 3 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => setTelefonos((ts) => [...ts, { etiqueta: "", numero: "" }])}
              >
                Añadir teléfono
              </Button>
            )}
          </section>

          <section className={ui.panel}>
            <Label className={ui.check}>
              <Checkbox checked={publicado} onCheckedChange={(v) => setPublicado(v === true)} />
              Publicar el perfil: que lo vea quien encuentre a {nombre.trim() || "mi mascota"}.
            </Label>
            {intentado && sinContacto && (
              <p className={ui.fieldError} role="alert">
                Para publicarlo, añade al menos un teléfono: es lo que permite que te llamen.
              </p>
            )}
          </section>
        </div>

        <aside className={`${s.previa} ${ui.readingAside}`} aria-label="Vista previa">
          <span className={s.previaEtiqueta}>{publicado ? "Así lo verán" : "Sin publicar · nadie lo ve"}</span>
          <div className="flex items-center gap-3">
            {foto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={s.foto} src={foto} alt="" width={64} height={64} />
            ) : (
              <span className={`${s.foto} ${s.fotoVacia}`} aria-hidden="true">
                ?
              </span>
            )}
            <span className={s.nombre}>{nombre.trim() || "Sin nombre"}</span>
          </div>
          {bio.trim() && <p className={s.previaBio}>{bio.trim()}</p>}
          {rellenos.map((t, i) => (
            <div key={i} className={s.telefono}>
              <span className={s.filaEtiqueta}>{t.etiqueta || "Teléfono"}</span>
              <span className={s.telefonoNumero}>{t.numero}</span>
            </div>
          ))}
        </aside>

        <div className={`${ui.readingActions} ${ui.actions}`}>
          <Button type="submit" disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </form>
    </main>
  );
}
