import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import ui from "@barkandmeow/ui-web/ui.module.css";
import { AppHeader, IconKey } from "@barkandmeow/ui-web/parts";
import { NuevaClave, RetirarClave } from "@/components/ClavesApi";
import { diaHora } from "@/lib/chip";
import { apiServidor, exigirSesion } from "@/lib/servidor";
import { api } from "@barkandmeow/schema/api";

export const metadata: Metadata = {
  title: "Conexión · Bark & Meow",
  description: "Claves de API para que el software de gestión de la clínica envíe informes a los dueños.",
};

const fecha = (iso: string) => {
  const d = new Date(iso);
  const dd = (n: number) => String(n).padStart(2, "0");
  return `${dd(d.getDate())}/${dd(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const kb = (bytes: number) => (bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`);

/* Lo que el software de gestión necesita saber, con la dirección real de esta
   instalación: el SaaS reenvía /clinica/api a la API en su mismo origen. */
const ENDPOINTS = [
  ["GET", "/clinics/v1/api/me", "Comprueba la clave: devuelve el nombre de la clínica."],
  ["GET", "/clinics/v1/api/patients", "Pacientes con acceso permanente y la clave pública de su dueño."],
  ["POST", "/clinics/v1/api/patients/search", "El paciente de un chip: { identificador: { tipo: \"iso\", valor } }."],
  ["POST", "/clinics/v1/reports", "Envía un registro firmado y sellado, con hasta tres PDF sellados aparte: { petId, sellado, adjuntos? }."],
] as const;

const EJEMPLO = `{
  "version": 1,
  "tipo": "vacuna",
  "chip": "724098100001234",
  "fecha": "2026-09-29",
  "clinica": "Clínica Veterinaria Ruiz",
  "veterinario": "Dra. Ruiz",
  "enfermedad": "rabia",
  "producto": "Rabisin",
  "lote": "L2231",
  "validaHasta": "2027-09-29"
}`;

const SOBRE = `{
  "version": 1,
  "tipo": "firmado",
  "registro": "<el JSON de arriba, como texto>",
  "firma": "<Ed25519 de ese texto, base64>",
  "clave": "<clave pública de firma, base64>"
}`;

async function direccionApi() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}/clinica/api`;
}

export default async function Conexion() {
  const yo = await exigirSesion();
  const [{ claves }, { envios }, base] = await Promise.all([
    apiServidor(api.clinicas.listarClavesApi),
    apiServidor(api.clinicas.listarEnvios),
    direccionApi(),
  ]);
  const esAdmin = yo.role === "admin";

  return (
    <div className={ui.shell}>
      <AppHeader active="conexion" />

      <main className={ui.grid}>
        <section>
          <div className={ui.sectionHead}>
            <h1 className={ui.sectionTitle}>Software de gestión</h1>
            <span className={ui.sectionMeta}>
              {claves.length === 0
                ? "Sin conectar"
                : `${claves.length} ${claves.length === 1 ? "clave activa" : "claves activas"}`}
            </span>
          </div>

          {!yo.clinicaActiva && (
            <div className={`${ui.pendingBlock} ${ui.stacked}`} role="status">
              La clínica aún no está activa: confirma el correo del administrador para poder
              crear claves. <Link href="/verificar">Confirmar el correo</Link>
            </div>
          )}

          <div className={`${ui.panel} ${ui.stacked}`}>
            {claves.length === 0 ? (
              <p className={ui.panelNote}>
                Todavía no hay ninguna clave. Con una, vuestro software de gestión envía los
                informes de la consulta a la bandeja del dueño, cifrados para él, sin que nadie
                tenga que copiarlos a mano.
              </p>
            ) : (
              <div className={ui.rowList}>
                {claves.map((k) => (
                  <div key={k.id} className={ui.row}>
                    <div>
                      <div className={ui.rowName}>{k.nombre}</div>
                      <div className={ui.rowMeta}>
                        <code>{k.prefijo}…</code> · creada el {fecha(k.creada)} ·{" "}
                        {k.ultimoUso ? `último uso el ${fecha(k.ultimoUso)}` : "sin usar todavía"}
                        {!k.firma && " · sin clave de firma: créala de nuevo para certificar lo que envía"}
                      </div>
                    </div>
                    {esAdmin && (
                      <div className={ui.actions}>
                        <RetirarClave id={k.id} nombre={k.nombre} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* El registro entero: la portada solo enseña los últimos. */}
          <div className={`${ui.panel} ${ui.stacked}`} id="envios">
            <h2 className={ui.panelTitle}>Registro de envíos</h2>
            {envios.length === 0 ? (
              <p className={ui.panelNote}>
                Todavía no se ha enviado nada. Los informes solo llegan a los dueños que os dieron
                acceso permanente.
              </p>
            ) : (
              <>
                <div className={ui.rowList}>
                  {envios.map((e) => (
                    <div key={e.id} className={ui.row}>
                      <div>
                        {/* El servidor no sabe el nombre ni lo que dice el informe. */}
                        <div className={ui.rowName}>
                          Informe · chip <code>···{e.chipPista ?? "····"}</code>
                        </div>
                        <div className={ui.rowMeta}>
                          {e.clave ?? "Clave retirada"} · {kb(e.bytes)}
                        </div>
                      </div>
                      <time className={ui.rowMeta} dateTime={e.fecha}>
                        <code>{diaHora(e.fecha)}</code>
                      </time>
                    </div>
                  ))}
                </div>
                <p className={ui.panelNote}>
                  Los últimos {envios.length}. Cada uno va sellado para su dueño: ni Bark &amp; Meow ni
                  esta consola pueden leerlo.
                </p>
              </>
            )}
          </div>

          <div className={ui.panel}>
            <h2 className={ui.panelTitle}>Cómo se conecta</h2>
            <p className={ui.panelNote}>
              Para quien configure el software. Cada petición lleva la clave en la cabecera{" "}
              <code>Authorization: Bearer bmk_…</code>, contra esta dirección:
            </p>
            <div className={ui.copyBlock}>
              <code className="select-all">{base}</code>
            </div>

            <div className={ui.rowList}>
              {ENDPOINTS.map(([metodo, ruta, que]) => (
                <div key={ruta} className={ui.row}>
                  <div>
                    <div className={ui.rowName}>
                      <code>
                        {metodo} {ruta}
                      </code>
                    </div>
                    <div className={ui.rowMeta}>{que}</div>
                  </div>
                </div>
              ))}
            </div>

            <p className={ui.panelNote}>
              Cada registro es un JSON: una vacuna como esta, una desparasitación
              (<code>&quot;tipo&quot;: &quot;desparasitacion&quot;</code>, con hora), un análisis de anticuerpos
              (<code>&quot;titulacion&quot;</code>) o un informe (<code>&quot;informe&quot;</code>). Lleva el chip
              completo: ata el registro al animal.
            </p>
            <pre className={ui.copyBlock}>
              <code>{EJEMPLO}</code>
            </pre>
            <p className={ui.panelNote}>
              El software firma ese texto con la clave de firma (<code>BM_FIRMA</code>,
              Ed25519, <code>crypto_sign_detached</code> de libsodium), lo mete en este sobre, y
              sella el sobre con <code>crypto_box_seal</code> para la clave pública del dueño. Se
              envía en base64 como <code>sellado</code>, hasta 64 KB. Bark &amp; Meow lo guarda
              sin poder leerlo; el dueño lo abre en su navegador, comprueba la firma y lo guarda
              en su pasaporte de viaje. Quien lo reciba en una frontera también comprueba la
              firma, así que nadie puede cambiar una fecha o un lote sin que se note.
            </p>
            <pre className={ui.copyBlock}>
              <code>{SOBRE}</code>
            </pre>
            <p className={ui.panelNote}>
              Si el dueño retira el acceso, la API responde 404 y el informe no se entrega.
            </p>
          </div>
        </section>

        <aside className={ui.panel}>
          <h2 className={ui.panelTitle}>
            <IconKey size={20} /> Nueva clave
          </h2>
          {esAdmin ? (
            <NuevaClave activa={yo.clinicaActiva} />
          ) : (
            <p className={ui.panelNote}>Solo un administrador puede crear y retirar claves.</p>
          )}
        </aside>
      </main>
    </div>
  );
}
