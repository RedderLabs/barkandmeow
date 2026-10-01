import { useState } from "react";
import { router } from "expo-router";
import * as Crypto from "expo-crypto";
import { Alert, View } from "react-native";
import { Boton, Cargando, Datos, Pantalla, Tarjeta, Texto, Titulo } from "@/components/ui";
import { aprobarAlta, ErrorApi, leerPermisos, rechazarAlta, retirarAlta, yo } from "@/lib/api";
import { leerClave } from "@/lib/almacen";
import { aBase64, claveFicha, deBase64, iguales, publica, sellar } from "@/lib/cripto";
import { useCarga } from "@/lib/datos";
import { espacio, fuente, useColores } from "@/lib/tema";

/* Permisos de nivel 3 en el teléfono: las clínicas que piden acceso permanente
   a la ficha y las que ya lo tienen.

   Aprobar es envolver la clave de la ficha de esa mascota para la clave
   pública de la clínica, aquí en el móvil: al servidor suben bytes que no
   puede abrir. Por eso hace falta la clave del llavero; rechazar y retirar no
   la necesitan. */

type Lista = Awaited<ReturnType<typeof leerPermisos>>;
type Vista = Lista & { clave: Uint8Array | null; nombres: Record<string, string> };

async function cargar(): Promise<Vista> {
  const [yoMismo, clave, lista] = await Promise.all([yo(), leerClave(), leerPermisos()]);
  return {
    ...lista,
    clave: clave && iguales(publica(clave), deBase64(yoMismo.pubKey)) ? clave : null,
    nombres: Object.fromEntries(yoMismo.mascotas.map((m) => [m.petId, m.perfil.nombre])),
  };
}

const dd = (n: number) => String(n).padStart(2, "0");
const hora = (iso: string) => {
  const d = new Date(iso);
  return `${dd(d.getHours())}:${dd(d.getMinutes())}`;
};
const dia = (iso: string) => {
  const d = new Date(iso);
  return `${dd(d.getDate())}/${dd(d.getMonth() + 1)}/${d.getFullYear()}`;
};

export default function Permisos() {
  const c = useColores();
  const { carga, refrescar, refrescando } = useCarga(cargar);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const datos = carga.estado === "listo" ? carga.datos : null;
  const nombre = (petId: string) => datos?.nombres[petId] || "tu mascota";

  async function aprobar(p: Lista["peticiones"][number]) {
    const destino = deBase64(p.vetPubKey);
    if (!datos?.clave || !destino || destino.length !== 32) return;
    setOcupado(p.requestId);
    try {
      const envuelta = sellar(destino, Crypto.getRandomBytes(32), claveFicha(datos.clave, p.petId));
      await aprobarAlta(p.requestId, aBase64(envuelta));
      Alert.alert("Acceso concedido", `${p.clinica.nombre} ya tiene permiso sobre la ficha de ${nombre(p.petId)}.`);
    } catch (e) {
      if (e instanceof ErrorApi && e.estado === 410)
        Alert.alert("La petición ha caducado", "Pide a la clínica que la repita.");
      else Alert.alert("No se ha podido aprobar", "Vuelve a intentarlo en un momento.");
    } finally {
      setOcupado(null);
      await refrescar();
    }
  }

  function confirmarAprobar(p: Lista["peticiones"][number]) {
    Alert.alert(
      `¿Dar acceso a ${p.clinica.nombre}?`,
      `Solo si el número que te dicen es ${p.sas.slice(0, 3)} ${p.sas.slice(3)}. Podrás retirar el permiso cuando quieras, pero lo que la clínica ya haya descargado no vuelve.`,
      [
        { text: "No, volver", style: "cancel" },
        { text: "Sí, coincide", onPress: () => void aprobar(p) },
      ],
    );
  }

  async function rechazar(p: Lista["peticiones"][number]) {
    setOcupado(p.requestId);
    try {
      await rechazarAlta(p.requestId);
    } catch {
      Alert.alert("No se ha podido rechazar", "Puede que ya hubiera caducado.");
    } finally {
      setOcupado(null);
      await refrescar();
    }
  }

  function confirmarRetirar(g: Lista["permisos"][number]) {
    Alert.alert(
      `¿Retirar el acceso de ${g.clinica.nombre}?`,
      "Deja de poder enviarte informes y de ver la ficha desde ahora. Lo que ya descargó no vuelve.",
      [
        { text: "No, volver", style: "cancel" },
        {
          text: "Sí, retirar",
          style: "destructive",
          onPress: () => {
            setOcupado(g.grantId);
            void retirarAlta(g.grantId)
              .catch(() => Alert.alert("No se ha podido retirar", "Vuelve a intentarlo en un momento."))
              .finally(() => {
                setOcupado(null);
                void refrescar();
              });
          },
        },
      ],
    );
  }

  return (
    <Pantalla alRefrescar={refrescar} refrescando={refrescando}>
      <Titulo>Permisos</Titulo>
      {carga.estado === "cargando" && <Cargando texto="Cargando tus permisos…" />}
      {carga.estado === "error" && (
        <Tarjeta tono="alerta">
          <Texto>No se han podido cargar los permisos. Tira hacia abajo para reintentar.</Texto>
        </Tarjeta>
      )}

      {datos && (
        <>
          <Titulo nivel={2}>Peticiones que esperan tu respuesta</Titulo>
          {datos.peticiones.length === 0 && (
            <Texto tono="suave">
              No hay ninguna. Cuando una clínica pida el alta con tu mascota delante, aparecerá aquí durante diez
              minutos. Tira hacia abajo para actualizar.
            </Texto>
          )}
          {datos.peticiones.length > 0 && !datos.clave && (
            <Tarjeta tono="aviso">
              <Texto tono="fuerte">Este móvil no tiene tu clave</Texto>
              <Texto>Para aprobar hace falta. Escribe el código de recuperación que apuntaste en el alta.</Texto>
              <Boton alPulsar={() => router.push("/clave")}>Escribir el código</Boton>
            </Tarjeta>
          )}
          {datos.peticiones.map((p) => (
            <Tarjeta key={p.requestId}>
              <Datos>
                {`${p.clinica.pais} · ${p.clinica.dominio ?? "sin dominio propio"} · CADUCA ${hora(p.caduca)}`}
              </Datos>
              <Texto tono="fuerte">{p.clinica.nombre}</Texto>
              <Texto>Pide acceso permanente a la ficha de {nombre(p.petId)}.</Texto>
              <Texto
                estilo={{ fontFamily: fuente.datos, fontSize: 34, lineHeight: 42, letterSpacing: 4, color: c.ink }}
              >
                {`${p.sas.slice(0, 3)} ${p.sas.slice(3)}`}
              </Texto>
              <Texto tono="suave">
                Pídeles que te digan el número de su pantalla. Si no es este, rechaza la petición.
              </Texto>
              <View style={{ gap: espacio.sm }}>
                <Boton
                  alPulsar={() => confirmarAprobar(p)}
                  ocupado={ocupado === p.requestId}
                  desactivado={!datos.clave}
                >
                  El número coincide: aprobar
                </Boton>
                <Boton variante="secundario" alPulsar={() => void rechazar(p)} desactivado={ocupado === p.requestId}>
                  Rechazar
                </Boton>
              </View>
            </Tarjeta>
          ))}

          <Titulo nivel={2}>Clínicas con acceso</Titulo>
          {datos.permisos.length === 0 && (
            <Texto tono="suave">Ninguna clínica tiene acceso permanente a tus mascotas.</Texto>
          )}
          {datos.permisos.map((g) => (
            <Tarjeta key={g.grantId}>
              <Texto tono="fuerte">{g.clinica.nombre}</Texto>
              <Texto tono="suave">
                Ficha de {nombre(g.petId)} · desde el {dia(g.desde)}
              </Texto>
              <Boton variante="peligro" alPulsar={() => confirmarRetirar(g)} ocupado={ocupado === g.grantId}>
                Retirar el acceso
              </Boton>
            </Tarjeta>
          ))}
        </>
      )}
    </Pantalla>
  );
}
