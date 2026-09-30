import type { Metadata } from "next";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { Cabecera } from "@/components/Cabecera";
import { Resolver } from "@/components/Resolver";
import { leerCola, type Reclamacion } from "@/lib/api";
import s from "./ops.module.css";

export const metadata: Metadata = { title: "Reclamaciones · Operador · Bark & Meow" };

const dia = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

const MOTIVO: Record<Reclamacion["motivo"], string> = {
  impugnada: "Impugnada por el titular",
  "vencida-sin-cuenta": "Plazo vencido · el titular no tiene cuenta, nunca se le avisó",
  "en-plazo": "Abierta, en plazo",
  resuelta: "Resuelta",
};

const RESULTADO: Partial<Record<Reclamacion["estado"], string>> = {
  "a-favor-reclamante": "A favor del reclamante",
  "a-favor-titular": "A favor del titular",
};

function Fila({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className={s.fila}>
      <dt className={s.clave}>{k}</dt>
      <dd className={s.valor}>{v || "—"}</dd>
    </div>
  );
}

const correo = (c: string | null, verificado: string | null) =>
  c ? (
    <>
      <a href={`mailto:${c}`}>{c}</a>
      {verificado ? "" : " (sin verificar)"}
    </>
  ) : (
    "Sin cuenta en el portal"
  );

function Tarjeta({ r, decidir }: { r: Reclamacion; decidir: boolean }) {
  const chip = r.titular.chipPista ?? "····";
  return (
    <article className={ui.panel} aria-labelledby={`rec-${r.id}`}>
      <header className={s.cabecera}>
        <h3 id={`rec-${r.id}`} className={ui.panelTitle}>
          Chip ···{chip}
          {r.titular.nombre ? ` · ${r.titular.nombre}` : ""}
        </h3>
        <span className={r.motivo === "impugnada" || r.motivo === "vencida-sin-cuenta" ? s.marcaAviso : s.marca}>
          {RESULTADO[r.estado] ?? MOTIVO[r.motivo]}
        </span>
      </header>

      <div className={s.partes}>
        <dl className={s.parte}>
          <h4 className={s.parteTitulo}>Titular actual</h4>
          <Fila k="Correo" v={correo(r.titular.correo, r.titular.correoVerificado)} />
          <Fila k="Registrado" v={dia(r.titular.registrada)} />
          <Fila k="Activado" v={r.titular.activada ? `${dia(r.titular.activada)} en ${r.titular.activadaPor ?? "?"}` : "—"} />
          <Fila k="Estado" v={r.titular.estado} />
        </dl>
        <dl className={s.parte}>
          <h4 className={s.parteTitulo}>Reclamante</h4>
          <Fila k="Correo" v={correo(r.reclamante.correo, r.reclamante.correoVerificado)} />
          <Fila k="Registrado" v={dia(r.reclamante.registrada)} />
          <Fila k="Nombre que dio" v={r.reclamante.nombre} />
        </dl>
        <dl className={s.parte}>
          <h4 className={s.parteTitulo}>Clínica que la abrió</h4>
          <Fila k="Nombre" v={`${r.clinica.nombre} (${r.clinica.pais})`} />
          <Fila k="Dominio" v={r.clinica.verificada ? `${r.clinica.dominio} · verificado` : "sin verificar"} />
          <Fila k="Registro sanitario" v={r.clinica.registroSanitario} />
          <Fila k="Dirección" v={r.clinica.direccion} />
        </dl>
      </div>

      <p className={ui.panelNote}>
        Abierta el {dia(r.creada)} · plazo hasta el {dia(r.plazo)}
        {r.resuelta ? ` · resuelta el ${dia(r.resuelta)}` : ""}
      </p>
      {r.nota && <p className={s.nota}>Nota: {r.nota}</p>}

      {decidir && <Resolver id={r.id} chip={chip} />}
    </article>
  );
}

export default async function Page() {
  const cola = await leerCola();
  const pendientes = cola.filter((r) => r.motivo === "impugnada" || r.motivo === "vencida-sin-cuenta");
  const enPlazo = cola.filter((r) => r.motivo === "en-plazo");
  const resueltas = cola.filter((r) => r.motivo === "resuelta");

  return (
    <div className={ui.shell}>
      <Cabecera conSesion />
      <main className={ui.reading}>
        <div className={ui.readingMain}>
          <div>
            <h1 className={ui.pageTitle}>Reclamaciones de chip</h1>
            <p className={ui.lede}>
              Antes de resolver, pide a las dos partes la documentación del animal por correo: pasaporte,
              factura de la implantación del chip o registro oficial. La resolución avisa a las dos.
            </p>
          </div>

          <section className="flex flex-col gap-4" aria-labelledby="pendientes">
            <h2 id="pendientes" className={ui.sectionTitle}>
              Esperan tu decisión · {pendientes.length}
            </h2>
            {pendientes.length ? (
              pendientes.map((r) => <Tarjeta key={r.id} r={r} decidir />)
            ) : (
              <p className={ui.panelNote}>No hay nada esperando revisión.</p>
            )}
          </section>

          {enPlazo.length > 0 && (
            <section className="flex flex-col gap-4" aria-labelledby="plazo">
              <h2 id="plazo" className={ui.sectionTitle}>
                En plazo · {enPlazo.length}
              </h2>
              <p className={ui.panelNote}>
                El titular tiene cuenta y está avisado. Si no impugna, el chip pasa solo al vencer el plazo.
              </p>
              {enPlazo.map((r) => (
                <Tarjeta key={r.id} r={r} decidir={false} />
              ))}
            </section>
          )}

          {resueltas.length > 0 && (
            <section className="flex flex-col gap-4" aria-labelledby="resueltas">
              <h2 id="resueltas" className={ui.sectionTitle}>
                Resueltas en los últimos 30 días · {resueltas.length}
              </h2>
              {resueltas.map((r) => (
                <Tarjeta key={r.id} r={r} decidir={false} />
              ))}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
