import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { enReclamacion, Identidad } from "@/components/Mascota";
import { Boton, Campo, Cargando, CodigoActivacion, Pantalla, Seccion, Tarjeta, Texto, Titulo } from "@/components/ui";
import { identificar, nuevaMascota, yo, type Mascota } from "@/lib/api";
import { leerToken } from "@/lib/almacen";
import { useCarga } from "@/lib/datos";
import { ir } from "@/lib/salud";
import { espacio, fuente, radio, useColores } from "@/lib/tema";

/* «Mis mascotas»: quién es cada una, si le falta algo y qué toca ahora. Toda
   la tarjeta lleva a su pantalla, donde están la ficha de salud, la placa y
   compartir con un veterinario. */

/** Lo siguiente que toca, en una línea. */
function siguiente(m: Mascota): string | null {
  if (enReclamacion(m)) return "Hay una reclamación abierta sobre su chip.";
  if (m.estado !== "activa") return "Llévala a tu clínica para activar su chip.";
  if (!m.perfil.publicado) return "Publica su perfil para que quien la encuentre vea cómo llamarte.";
  if (m.perfil.telefonos.length === 0) return "Añade un teléfono de contacto.";
  if (!m.ficha) return "Escribe su ficha de salud: alergias, medicación y enfermedades.";
  if (!m.placa) return "Prepara la placa de su collar.";
  return null;
}

function Tarjetita({ m, token }: { m: Mascota; token: string | null }) {
  const c = useColores();
  const nombre = m.perfil.nombre.trim() || "tu mascota";
  const toca = siguiente(m);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Abrir ${nombre}`}
      onPress={() => ir(`/mascota/${m.petId}`)}
      style={({ pressed }) => ({
        backgroundColor: pressed ? c.ground : c.surface,
        borderColor: pressed ? c.accent : c.line,
        borderWidth: 1,
        borderRadius: radio.panel,
        padding: espacio.xl,
        gap: espacio.md,
      })}
    >
      <Identidad m={m} token={token} />
      {toca ? <Texto tono="suave">{toca}</Texto> : null}
      {m.mensajes > 0 ? (
        <Texto estilo={{ color: c.accentInk, fontFamily: fuente.textoFuerte }}>
          {m.mensajes === 1 ? "1 mensaje en la bandeja" : `${m.mensajes} mensajes en la bandeja`}
        </Texto>
      ) : null}
    </Pressable>
  );
}

/** Añadir otra mascota a la cuenta: queda pendiente hasta que una clínica active su chip. */
function Nueva({ vacia, alAnadir }: { vacia: boolean; alAnadir: () => void }) {
  const [chip, setChip] = useState("");
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [hecho, setHecho] = useState<{ codigoActivacion: string; caduca: string; nombre: string } | null>(null);

  async function anadir() {
    const id = identificar(chip);
    if (!id) return setError("Un microchip ISO tiene 15 dígitos.");
    setError(null);
    setOcupado(true);
    try {
      const r = await nuevaMascota(id, nombre.trim());
      setHecho({ ...r, nombre: nombre.trim() });
      setChip("");
      setNombre("");
      alAnadir();
    } catch {
      setError("No se ha podido añadir. Revisa el número y vuelve a intentarlo.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Seccion titulo={vacia ? "Añadir tu mascota" : "Añadir otra mascota"}>
      {hecho ? (
        <>
          <CodigoActivacion codigo={hecho.codigoActivacion} caduca={hecho.caduca} nombre={hecho.nombre} />
          <Boton variante="secundario" alPulsar={() => setHecho(null)}>
            Añadir otra
          </Boton>
        </>
      ) : (
        <>
          <Texto tono="suave">Con el número de su microchip: son 15 cifras y vienen en su pasaporte.</Texto>
          <Campo
            etiqueta="Número del microchip"
            datos
            keyboardType="number-pad"
            maxLength={32}
            value={chip}
            onChangeText={setChip}
            error={error}
          />
          <Campo etiqueta="Cómo se llama" maxLength={60} value={nombre} onChangeText={setNombre} />
          <Boton variante="secundario" alPulsar={() => void anadir()} ocupado={ocupado}>
            Añadir mascota
          </Boton>
        </>
      )}
    </Seccion>
  );
}

export default function Mascotas() {
  const { carga, refrescar, refrescando } = useCarga(yo);
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    void leerToken().then(setToken);
  }, []);

  return (
    <Pantalla alRefrescar={refrescar} refrescando={refrescando}>
      <View style={{ gap: espacio.sm }}>
        <Titulo>Mis mascotas</Titulo>
        <Texto tono="suave">Entra en cada una para ver su ficha de salud, su placa y lo que le falta.</Texto>
      </View>
      {carga.estado === "cargando" && <Cargando texto="Cargando tus mascotas…" />}
      {carga.estado === "error" && (
        <Tarjeta tono="alerta">
          <Texto>No se han podido cargar. Tira hacia abajo para reintentar.</Texto>
        </Tarjeta>
      )}
      {carga.estado === "listo" &&
        (carga.datos.mascotas.length === 0 ? (
          <Texto tono="suave">Tu cuenta aún no tiene ninguna mascota.</Texto>
        ) : (
          carga.datos.mascotas.map((m) => <Tarjetita key={m.petId} m={m} token={token} />)
        ))}
      {carga.estado === "listo" && (
        <Nueva vacia={carga.datos.mascotas.length === 0} alAnadir={() => void refrescar()} />
      )}
    </Pantalla>
  );
}
