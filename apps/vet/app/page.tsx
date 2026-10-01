import type { Metadata } from "next";
import Link from "next/link";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@barkandmeow/ui-web/components/accordion";
import { Button } from "@barkandmeow/ui-web/components/button";
import { Input } from "@barkandmeow/ui-web/components/input";
import { Logotipo } from "@barkandmeow/ui-web/marca";
import s from "./sitio.module.css";

export const metadata: Metadata = {
  title: "Bark & Meow · Ficha de salud portátil para mascotas",
  description:
    "Cualquier veterinario ve la ficha actualizada en segundos, sin instalar nada. Los datos viven cifrados: el servidor no puede leerlos.",
};

function Tick() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      className={s.tick}
      aria-hidden="true"
    >
      <path d="M5 12.5 9.5 17 19 7.5" />
    </svg>
  );
}

const NIVELES = [
  {
    cls: s.lvl0,
    etiqueta: "NIVEL 0",
    que: "Número de chip",
    ve: "Solo si existe ficha, y un botón para avisar al dueño",
    vida: "—",
  },
  {
    cls: s.lvl1,
    etiqueta: "NIVEL 1",
    que: "Placa del collar (QR o NFC)",
    ve: "Alergias, crónicas, medicación, rabia y contacto",
    vida: "Hasta rotar la placa",
  },
  {
    cls: s.lvl2,
    etiqueta: "NIVEL 2",
    que: "Enlace temporal del dueño",
    ve: "Todo: visitas, analíticas y documentos originales",
    vida: "24 h · 72 h · 7 días",
  },
  {
    cls: s.lvl3,
    etiqueta: "NIVEL 3",
    que: "Alta desde el panel de la clínica",
    ve: "Todo, y puede subir informes firmados",
    vida: "Hasta que el dueño lo retire",
  },
];

const PREGUNTAS = [
  {
    q: "¿Tengo que crear una cuenta para ver una ficha en una urgencia?",
    a: "No. La web del veterinario de guardia se abre desde el QR o el NFC de la placa, en el idioma de tu navegador, sin cuenta y sin instalar nada. La cuenta solo existe para las clínicas que quieren una relación continuada con sus pacientes.",
  },
  {
    q: "¿Qué veis vosotros de los datos clínicos?",
    a: "Nada. El contenido viaja cifrado con la clave del dueño y el servidor solo guarda bloques que no puede abrir, además de identificadores aleatorios, tamaños y fechas. El número de chip tampoco se guarda en claro: se guarda su HMAC, y el pepper vive en otro servicio.",
  },
  {
    q: "Si doy de baja a alguien de mi equipo, ¿pierde el acceso?",
    a: "Deja de poder pedir fichas nuevas en el momento. Lo que ya se descargó en su navegador no se puede retirar, y preferimos decirlo que fingir lo contrario.",
  },
  {
    q: "¿Sirve para algo más que perros y gatos?",
    a: "Sí. El catálogo cubre también hurones, aves, conejos, roedores, reptiles, anfibios y peces ornamentales. Como muchas de esas especies no llevan microchip, un animal se identifica con una lista: chip ISO, chip antiguo, anilla, tatuaje o ninguno.",
  },
  {
    q: "¿Me quedo atrapado si un día quiero irme?",
    a: "No. El dueño puede exportar la ficha completa como paquete cifrado en formato abierto. La especificación de federación es pública con licencia CC BY 4.0 y el código es AGPL-3.0.",
  },
];

export default function Presentacion() {
  return (
    <div className={s.page}>
      <header className={s.bar}>
        <div className={s.brand}>
          <Logotipo alto={40} className={s.brandLogo} />
        </div>
        <nav className={s.barLinks}>
          <a className={`${s.barLink} ${s.barAnchor}`} href="#niveles">
            Niveles de acceso
          </a>
          <a className={`${s.barLink} ${s.barAnchor}`} href="#clinicas">
            Para clínicas
          </a>
          <a className={`${s.barLink} ${s.barAnchor}`} href="#cifrado">
            Cómo se protege
          </a>
          <a className={s.barLink} href="/clinica/registro">
            Registrar clínica
          </a>
        </nav>
      </header>

      <section className={s.hero}>
        <div>
          <h1 className={s.headline}>
            La ficha que un veterinario abre en segundos.{" "}
            <span className={s.headlineQuiet}>
              Y que nuestro servidor no puede leer.
            </span>
          </h1>
          <p className={s.sub}>
            Los registros de identificación dicen quién es el dueño, no si el
            animal es alérgico. El historial de la clínica habitual está completo,
            pero encerrado en su software y en un solo idioma. Bark & Meow es la pieza que
            falta: alergias, medicación y antecedentes, en el idioma del
            veterinario que atiende, esté donde esté.
          </p>
          <div className={s.heroActions}>
            <Button asChild>
              <a href="/clinica/registro">Registrar mi clínica</a>
            </Button>
            <Button asChild variant="outline">
              <a href="/clinica">Ver el panel por dentro</a>
            </Button>
          </div>
        </div>

        {/* Sin JS también funciona: es un GET a /chip, que consulta al cargar. */}
        <form className={s.lookup} action="/chip" method="get">
          <h2 className={s.lookupTitle}>¿Has leído un chip?</h2>
          <label className={s.srOnly} htmlFor="chip">
            Número de microchip
          </label>
          <div className={s.lookupRow}>
            <Input
              id="chip"
              name="n"
              className="h-[52px] border-2 border-brand font-mono text-lg tracking-[0.04em] tabular-nums hover:border-brand"
              type="text"
              inputMode="numeric"
              enterKeyHint="search"
              autoComplete="off"
              placeholder="724 098 100 001 234"
              aria-describedby="chip-nota"
            />
            <Button type="submit">Consultar</Button>
          </div>
          <p id="chip-nota" className={s.lookupNote}>
            Compatible con lectores Bluetooth de 134,2 kHz. El número solo sirve
            para saber si existe ficha y avisar al dueño: nunca abre los datos de
            salud por sí solo.
          </p>
        </form>
      </section>

      <section id="niveles" className={s.section}>
        <h2 className={s.h2}>Cuatro niveles, y el dueño decide en cada uno</h2>
        <p className={s.lead}>
          El acceso no lo da tener una cuenta. Lo da un objeto físico o un permiso
          explícito que caduca y se puede retirar.
        </p>
        <div className={s.ladder}>
          {NIVELES.map((n) => (
            <div key={n.etiqueta} className={s.rung}>
              <span className={`${s.rungLevel} ${n.cls}`}>{n.etiqueta}</span>
              <span className={s.rungWhat}>{n.que}</span>
              <span className={s.rungSees}>{n.ve}</span>
              <span className={s.rungLife}>{n.vida}</span>
            </div>
          ))}
        </div>
      </section>

      <section id="clinicas" className={`${s.section} ${s.sectionAlt}`}>
        <div className={s.sectionInner}>
          <h2 className={s.h2}>Dos formas de usarlo, según quién seas</h2>
          <div className={s.audience}>
            <div className={s.pane}>
              <h3 className={s.paneTitle}>Veterinario de guardia</h3>
              <p className={s.paneBody}>
                Llega un animal que no conoces, con un dueño que no habla tu idioma.
                Escaneas la placa y tienes lo que necesitas antes de quitarte los
                guantes.
              </p>
              <ul className={s.paneList}>
                <li className={s.paneItem}>
                  <Tick />
                  Sin cuenta, sin instalar nada
                </li>
                <li className={s.paneItem}>
                  <Tick />
                  En el idioma de tu navegador
                </li>
                <li className={s.paneItem}>
                  <Tick />
                  Pensada para cargar con mala cobertura
                </li>
                <li className={s.paneItem}>
                  <Tick />
                  Puedes dejar la nota de la visita, cifrada al dueño
                </li>
              </ul>
              <div className={s.paneActions}>
                <Button asChild variant="outline" size="md">
                  <Link href="/chip">Ver la web de urgencias</Link>
                </Button>
              </div>
            </div>

            <div className={s.pane}>
              <h3 className={s.paneTitle}>Clínica</h3>
              <p className={s.paneBody}>
                Tu software de gestión ya tiene los datos. Conéctalo y cada informe
                sale cifrado a la ficha del dueño, que lo lleva encima cuando viaja.
              </p>
              <ul className={s.paneList}>
                <li className={s.paneItem}>
                  <Tick />
                  Cuentas de equipo con tres roles
                </li>
                <li className={s.paneItem}>
                  <Tick />
                  Altas de nivel 3 aprobadas por el dueño con un número de
                  comparación
                </li>
                <li className={s.paneItem}>
                  <Tick />
                  Fichas preparadas para dueños que aún no usan Bark & Meow
                </li>
                <li className={s.paneItem}>
                  <Tick />
                  API para tu software de gestión
                </li>
              </ul>
              <div className={s.paneActions}>
                <Button asChild size="md">
                  <a href="/clinica/registro">Registrar mi clínica</a>
                </Button>
                <Button asChild variant="outline" size="md">
                  <a href="/clinica/equipo">Ver la gestión de equipo</a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="cifrado" className={s.section}>
        <h2 className={s.h2}>Cómo puede un servidor guardar algo que no puede leer</h2>
        <div className={s.steps}>
          <div className={s.step}>
            <span className={s.stepN}>01</span>
            <span className={s.stepTitle}>La clave vive en el móvil del dueño</span>
            <p className={s.stepBody}>
              Un par de claves en el Keychain o el Keystore. Nosotros nunca la
              vemos, y por eso no podemos entregarla a nadie que la pida.
            </p>
          </div>
          <div className={s.step}>
            <span className={s.stepN}>02</span>
            <span className={s.stepTitle}>El permiso envuelve, no copia</span>
            <p className={s.stepBody}>
              Al autorizarte, su app envuelve la clave de la ficha contra la de tu
              clínica. Nosotros movemos un sobre cerrado de un lado a otro.
            </p>
          </div>
          <div className={s.step}>
            <span className={s.stepN}>03</span>
            <span className={s.stepTitle}>Se descifra en tu navegador</span>
            <p className={s.stepBody}>
              La ficha se abre en tu equipo. La nota que escribes vuelve sellada
              contra la clave del dueño: escribes, pero no te quedas con nada.
            </p>
          </div>
        </div>

        <p className={s.honest}>
          <strong>Lo que esto no hace.</strong> Revocar borra la copia del
          servidor, no lo que alguien ya descargó. Si el dueño pierde su clave y su
          código de recuperación, la ficha no se puede recuperar: no tenemos una
          copia con la que ayudarle. Son las dos consecuencias de que los datos sean
          suyos de verdad, y preferimos escribirlas aquí que en una nota al pie.
        </p>
      </section>

      <section className={`${s.section} ${s.sectionAlt}`}>
        <div className={s.sectionInner}>
          <h2 className={s.h2}>Preguntas</h2>
          <Accordion
            type="multiple"
            defaultValue={[PREGUNTAS[0].q]}
            className={s.faq}
          >
            {PREGUNTAS.map((p) => (
              <AccordionItem key={p.q} value={p.q}>
                <AccordionTrigger>{p.q}</AccordionTrigger>
                <AccordionContent>{p.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <footer className={s.footer}>
        <div className={s.footerInner}>
          <div>
            <Logotipo alto={36} className={s.footerLogo} />
            barkandmeow.app
            <br />
            Código AGPL-3.0 · Especificación de federación CC BY 4.0
          </div>
          <div>
            Bark & Meow es información aportada por el dueño, no un registro oficial.
            <br />
            Proyecto en desarrollo: las pantallas de demostración usan datos de
            ejemplo.
          </div>
        </div>
      </footer>
    </div>
  );
}
