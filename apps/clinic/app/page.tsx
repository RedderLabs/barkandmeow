import type { Metadata } from "next";
import Link from "next/link";
import styles from "./console.module.css";
import { AppHeader } from "@barkandmeow/ui-web/parts";
import { CustodiaClave } from "@/components/Custodia";
import { Portada } from "@/components/Portada";
import { apiServidor, exigirSesion } from "@/lib/servidor";
import { api } from "@barkandmeow/schema/api";

export const metadata: Metadata = { title: "Consola · Bark & Meow" };

/* La portada (decidido 2026-10-01): un campo de chip que dice qué toca y,
   debajo, los pacientes. Activar una mascota y pedir un alta ya no son páginas
   aparte: salen del chip que se lee. */
export default async function Page() {
  const yo = await exigirSesion();
  const [{ pacientes }, { claves }, { envios }] = await Promise.all([
    apiServidor(api.clinicas.listarPacientesConsola),
    apiServidor(api.clinicas.listarClavesApi),
    apiServidor(api.clinicas.listarEnvios),
  ]);

  return (
    <div className={styles.shell}>
      <AppHeader active="consola" admin={yo.role === "admin"} />
      <Portada
        clinicId={yo.clinicId}
        pubKeyClinica={yo.clinica.pubKey}
        esAdmin={yo.role === "admin"}
        activa={yo.clinicaActiva}
        pacientes={pacientes}
        envios={envios}
        conexion={{ claves: claves.length, nombre: claves[0]?.nombre ?? null }}
        avisos={
          <>
            {!yo.clinicaActiva && (
              <div className={styles.pendingNote} role="status">
                La clínica aún no está activa: confirma el correo del administrador para activar
                mascotas, pedir altas y añadir gente al equipo. <Link href="/verificar">Confirmar el correo</Link>
              </div>
            )}
            {yo.role === "admin" && (
              <CustodiaClave
                clinicId={yo.clinicId}
                pubKeyClinica={yo.clinica.pubKey}
                claveEnvuelta={yo.claveEnvuelta}
              />
            )}
          </>
        }
      />
    </div>
  );
}
