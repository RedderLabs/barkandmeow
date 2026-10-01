"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { renderSVG } from "uqr";
import { fichaLista, terminoCronica, terminoReaccion, type FichaDueno } from "@barkandmeow/schema";
import { toast } from "@barkandmeow/ui-web/components/sonner";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { IconAlert, IconCheck } from "@barkandmeow/ui-web/parts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@barkandmeow/ui-web/components/alert-dialog";
import { Button } from "@barkandmeow/ui-web/components/button";
import { Label } from "@barkandmeow/ui-web/components/label";
import { Recuperar } from "@/components/Bandeja";
import { Placa } from "@/components/Placa";
import { quitarPlaca, type Telefono } from "@/lib/api";
import { fecha } from "@/lib/fecha";
import { enlacePlaca, nuevaPlaca, publicarPlaca, useFicha } from "@/lib/ficha";
import s from "./portal.module.css";

/* La placa del collar (nivel 1). Un QR que cualquiera puede escanear con el
   móvil, sin aplicación y sin cuenta: abre el resumen de urgencia en el idioma
   de quien lo lee. La clave va dentro del propio QR, así que el servidor
   entrega un bloque que no puede abrir.

   Quien tenga la placa en la mano ve el resumen: por eso solo lleva lo que
   hace falta en una urgencia, y el teléfono solo si el dueño quiere. */

export function PlacaCollar({
  petId,
  nombre,
  pubKey,
  telefonos,
  hayPlaca,
}: {
  petId: string;
  nombre: string;
  pubKey: string;
  /** Los del perfil público: para elegir cuál enseña la placa. */
  telefonos: Telefono[];
  /** Lo que dice el servidor: si hay una placa viva. */
  hayPlaca: boolean;
}) {
  const router = useRouter();
  const ids = useId();
  const { estado, cambiar, publica, alRecuperar } = useFicha(petId, pubKey, nombre);
  const [telefono, setTelefono] = useState(telefonos[0]?.numero ?? "");
  const [ocupado, setOcupado] = useState(false);
  const reparada = useRef(false);
  const llamar = nombre || "tu mascota";

  const lista = estado.tipo === "lista" ? estado : null;
  const placa = lista?.datos.placa ?? null;

  // La ficha dice que hay placa y el servidor no la tiene (un guardado a medias): se vuelve a subir.
  useEffect(() => {
    if (!lista || !placa || hayPlaca || reparada.current || !fichaLista(lista.datos)) return;
    reparada.current = true;
    void publicarPlaca(lista.c, petId, lista.datos, nombre)
      .then(() => router.refresh())
      .catch(() => undefined);
  }, [lista, placa, hayPlaca, petId, nombre, router]);

  if (estado.tipo === "mirando")
    return (
      <p className={ui.panelNote} role="status">
        Abriendo la ficha…
      </p>
    );
  if (estado.tipo === "falta") return <Recuperar publica={publica} alRecuperar={alRecuperar} que="La ficha" />;
  if (estado.tipo === "error")
    return (
      <div className={ui.alertBlock} role="alert">
        <strong>No se ha podido abrir la ficha.</strong>
        Comprueba la conexión y vuelve a cargar la página.
      </div>
    );

  const f = estado.datos;

  async function crear(sustituir: boolean) {
    setOcupado(true);
    // Guardar la ficha sube también el resumen cifrado: ver useFicha.
    const r = await cambiar((d) => ({ ...d, placa: nuevaPlaca(telefono) }));
    setOcupado(false);
    if (!r) return;
    toast(sustituir ? "Placa sustituida" : "Placa creada", {
      description: sustituir ? "El QR anterior ya no abre nada." : "Ya puedes imprimir su QR.",
    });
    router.refresh();
  }

  async function retirar() {
    setOcupado(true);
    try {
      await quitarPlaca(petId).catch((e) => {
        // Si el servidor ya no la tenía, da igual: lo que importa es que no responda.
        if ((e as { estado?: number }).estado !== 404) throw e;
      });
      await cambiar((d) => ({ ...d, placa: null }));
      toast("Placa retirada", { description: "Su QR ya no abre nada." });
      router.refresh();
    } catch {
      toast("No se ha podido retirar", { description: "Vuelve a intentarlo en un momento." });
    } finally {
      setOcupado(false);
    }
  }

  async function cambiarTelefono(numero: string) {
    const r = await cambiar((d) => (d.placa ? { ...d, placa: { ...d.placa, telefono: numero } } : d));
    if (r) toast(numero ? "La placa enseña ahora ese teléfono" : "La placa ya no enseña ningún teléfono");
  }

  if (!fichaLista(f))
    return (
      <section className={s.vacio}>
        <Placa chip="" tamano={132} />
        <div className="flex flex-col items-start gap-3">
          <h2 className={ui.panelTitle}>Antes, la ficha de salud</h2>
          <p className={s.vacioTexto}>
            La placa enseña el resumen de urgencia de {llamar}: sus alergias, lo que toma y sus
            enfermedades. Escribe primero la ficha; después vuelve aquí y la placa se crea con un
            botón.
          </p>
          <Button asChild size="md">
            <Link href={`/mascota/${petId}/salud`}>Escribir la ficha de salud</Link>
          </Button>
        </div>
      </section>
    );

  const selectorTelefono = (valor: string, alCambiar: (v: string) => void, id: string) => (
    <div className={ui.field}>
      <Label htmlFor={id}>Teléfono que enseña la placa</Label>
      <select id={id} className={s.selector} value={valor} onChange={(e) => alCambiar(e.target.value)}>
        {telefonos.map((t) => (
          <option key={t.numero} value={t.numero}>
            {t.numero}
            {t.etiqueta ? ` · ${t.etiqueta}` : ""}
          </option>
        ))}
        {valor && !telefonos.some((t) => t.numero === valor) && <option value={valor}>{valor}</option>}
        <option value="">Ninguno</option>
      </select>
      <span className={ui.hint}>
        {telefonos.length === 0 ? (
          <>
            No tienes teléfonos en el perfil público. <Link href={`/mascota/${petId}/perfil`}>Añadir uno</Link>
          </>
        ) : (
          "Lo ve cualquiera que escanee la placa. Si prefieres que no, elige «Ninguno»."
        )}
      </span>
    </div>
  );

  if (!placa)
    return (
      <>
        <section className={s.vacio}>
          <Placa chip={f.chip} tamano={132} />
          <div className="flex flex-col gap-2">
            <h2 className={ui.panelTitle}>{llamar[0].toUpperCase() + llamar.slice(1)} aún no tiene placa</h2>
            <p className={s.vacioTexto}>
              Un QR en su collar. Quien lo escanee con el móvil ve el resumen de urgencia en su idioma,
              sin instalar nada: un veterinario de guardia en otro país, o quien la encuentre.
            </p>
          </div>
        </section>
        <section className={ui.panel} aria-labelledby={`${ids}-crear`}>
          <h2 id={`${ids}-crear`} className={ui.panelTitle}>
            Crear la placa
          </h2>
          {selectorTelefono(telefono, setTelefono, `${ids}-tel`)}
          <div className={ui.actions}>
            <Button type="button" disabled={ocupado} onClick={() => void crear(false)}>
              {ocupado ? "Creando…" : "Crear la placa"}
            </Button>
          </div>
        </section>
        <Resumen f={f} petId={petId} nombre={nombre} telefono={telefono} titulo="Esto es lo que enseñará" />
      </>
    );

  const url = enlacePlaca(placa);

  function descargar() {
    const svg = renderSVG(url, { border: 4, ecc: "M" });
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    enlace.download = `placa-${(nombre || "mascota").normalize("NFD").replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}.svg`;
    enlace.click();
    URL.revokeObjectURL(enlace.href);
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      toast("Enlace copiado");
    } catch {
      toast("No se ha podido copiar", { description: "Selecciónalo y cópialo a mano." });
    }
  }

  return (
    <>
      <section className={ui.panel} aria-labelledby={`${ids}-qr`}>
        <h2 id={`${ids}-qr`} className={ui.panelTitle}>
          <IconCheck size={20} /> Placa activa
        </h2>
        <div className={s.qr}>
          {/* El QR se dibuja aquí: el enlace lleva la clave y no sale del navegador. */}
          <div
            className={s.qrImagen}
            role="img"
            aria-label={`Código QR de la placa de ${llamar}`}
            dangerouslySetInnerHTML={{ __html: renderSVG(url, { border: 2, ecc: "M" }) }}
          />
          <div className="flex flex-col gap-3">
            <p className={ui.bodyNote}>
              Imprímelo o grábalo en una chapa y ponlo en su collar. También puedes escribir el
              enlace en una etiqueta NFC con cualquier aplicación de NFC.
            </p>
            <div className={ui.copyBlock}>
              <code className="select-all">{url}</code>
            </div>
            <div className={ui.actions}>
              <Button type="button" size="md" onClick={descargar}>
                Descargar el QR
              </Button>
              <Button type="button" variant="outline" size="md" onClick={() => void copiar()}>
                Copiar el enlace
              </Button>
              <Button asChild variant="ghost" size="md">
                <a href={url} target="_blank" rel="noreferrer">
                  Ver como la verán
                </a>
              </Button>
            </div>
            <p className={ui.panelNote}>
              Creada el <span className={s.dato}>{fecha(placa.creada)}</span>. No hay que cambiarla
              nunca: cuando actualizas la ficha, el mismo QR enseña lo nuevo.
            </p>
          </div>
        </div>
      </section>

      <Resumen f={f} petId={petId} nombre={nombre} telefono={placa.telefono} titulo="Lo que ve quien la escanea">
        {selectorTelefono(placa.telefono, (v) => void cambiarTelefono(v), `${ids}-tel`)}
      </Resumen>

      <section className={ui.panel} aria-labelledby={`${ids}-perdida`}>
        <h2 id={`${ids}-perdida`} className={ui.panelTitle}>
          Si pierdes la placa
        </h2>
        <p className={ui.panelNote}>
          Quien tenga el QR puede ver el resumen de urgencia. Si la placa se pierde o se la queda
          alguien, sustitúyela: se crea un QR nuevo y el anterior deja de abrir nada al momento.
        </p>
        <div className={ui.actions}>
          <Confirmar
            titulo="¿Sustituir la placa?"
            texto="El QR de ahora dejará de funcionar y tendrás que imprimir el nuevo. La ficha de salud no cambia."
            boton="Sustituir la placa"
            confirmar="Sí, crear un QR nuevo"
            ocupado={ocupado}
            alConfirmar={() => crear(true)}
          />
          <Confirmar
            titulo="¿Retirar la placa?"
            texto={`El QR dejará de abrir nada y ${llamar} se quedará sin placa. Puedes crear otra cuando quieras.`}
            boton="Retirar la placa"
            confirmar="Sí, retirarla"
            destructivo
            ocupado={ocupado}
            alConfirmar={retirar}
          />
        </div>
      </section>
    </>
  );
}

function Confirmar({
  titulo,
  texto,
  boton,
  confirmar,
  destructivo = false,
  ocupado,
  alConfirmar,
}: {
  titulo: string;
  texto: string;
  boton: string;
  confirmar: string;
  destructivo?: boolean;
  ocupado: boolean;
  alConfirmar: () => Promise<void>;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant={destructivo ? "destructive" : "outline"} size="md" disabled={ocupado}>
          {boton}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{texto}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>No, volver</AlertDialogCancel>
          <AlertDialogAction onClick={() => void alConfirmar()}>{confirmar}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** El resumen de urgencia tal como sale de la ficha: lo que enseña la placa. */
export function Resumen({
  f,
  petId,
  nombre,
  telefono,
  titulo,
  children,
}: {
  f: FichaDueno;
  nombre: string;
  telefono: string;
  titulo: string;
  children?: ReactNode;
  petId: string;
}) {
  const ids = useId();
  const hoy = new Date().toISOString().slice(0, 10);
  return (
    <section className={ui.panel} aria-labelledby={`${ids}-t`}>
      <h2 id={`${ids}-t`} className={ui.panelTitle}>
        {titulo}
      </h2>

      {f.alergias.length > 0 ? (
        <div className={s.alergias}>
          <p className={s.alergiasEtiqueta}>
            <IconAlert size={16} /> Alergias
          </p>
          <ul className={s.alergiasLista}>
            {f.alergias.map((a) => (
              <li key={a.id} className={s.alergia}>
                <div className={s.alergiaTexto}>
                  <span className={s.alergiaSustancia}>{a.sustancia}</span>
                  <span>{terminoReaccion(a).es}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <dl className={s.datos}>
        {f.alergias.length === 0 && (
          <div>
            <dt>Alergias</dt>
            <dd>Ninguna registrada</dd>
          </div>
        )}
        <div>
          <dt>Medicación</dt>
          <dd>
            {f.medicacion.length
              ? f.medicacion.map((m) => [m.principio, m.dosis].filter(Boolean).join(" ")).join(" · ")
              : "Ninguna"}
          </dd>
        </div>
        <div>
          <dt>Enfermedades crónicas</dt>
          <dd>{f.cronicas.length ? f.cronicas.map((c) => terminoCronica(c).es).join(" · ") : "Ninguna registrada"}</dd>
        </div>
        <div>
          <dt>Rabia</dt>
          <dd>
            {f.rabiaHasta ? (
              <>
                {f.rabiaHasta < hoy ? "Caducó el " : "Válida hasta el "}
                <span className={s.dato}>{fecha(f.rabiaHasta)}</span>
              </>
            ) : (
              "No consta"
            )}
          </dd>
        </div>
        <div>
          <dt>Teléfono</dt>
          <dd>{telefono ? <span className={s.dato}>{telefono}</span> : "No se enseña"}</dd>
        </div>
      </dl>
      {children}
      <p className={ui.panelNote}>
        Además, el nombre, la especie, el sexo, la edad y el peso de {nombre || "tu mascota"}. Lo
        escribes tú: en la pantalla del veterinario sale como información del dueño, no como un
        registro oficial. Para cambiar algo, <Link href={`/mascota/${petId}/salud`}>edita la ficha de salud</Link>.
      </p>
    </section>
  );
}
