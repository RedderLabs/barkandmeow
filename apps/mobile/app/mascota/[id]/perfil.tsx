import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Alert, View } from "react-native";
import { Boton, Cargando, Campo, Opciones, Pantalla, Seccion, Tarjeta, Texto, Titulo } from "@/components/ui";
import { ErrorApi, guardarPerfil, yo, type Mascota } from "@/lib/api";
import { useCarga } from "@/lib/datos";
import { espacio } from "@/lib/tema";

/* Perfil público: lo que ve quien encuentra al animal (al escanear su placa o
   con el número de chip) y el veterinario dentro de la ficha. Va sin cifrar
   porque su función es verse, así que el dueño decide qué publica. La foto se
   sube desde barkandmeow.app/mi-mascota. */

const TEL = /^\+?[0-9 ()-]{6,20}$/;
const SI_NO = [
  ["si", "Sí, publicarlo"],
  ["no", "No, todavía no"],
] as const;

type Tel = { etiqueta: string; numero: string };

function Editor({ m }: { m: Mascota }) {
  const [nombre, setNombre] = useState(m.perfil.nombre);
  const [bio, setBio] = useState(m.perfil.bio);
  const [telefonos, setTelefonos] = useState<Tel[]>(
    m.perfil.telefonos.length ? m.perfil.telefonos : [{ etiqueta: "", numero: "" }],
  );
  const [publicado, setPublicado] = useState(m.perfil.publicado);
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const rellenos = telefonos.filter((t) => t.numero.trim());
  const malo = (t: Tel) => !!t.numero.trim() && !TEL.test(t.numero.trim());
  const sinContacto = publicado && rellenos.length === 0;
  const cambiar = (i: number, campo: keyof Tel, valor: string) =>
    setTelefonos((ts) => ts.map((t, j) => (j === i ? { ...t, [campo]: valor } : t)));

  async function guardar() {
    setIntentado(true);
    if (telefonos.some(malo) || sinContacto) return;
    setGuardando(true);
    try {
      await guardarPerfil(m.petId, {
        nombre: nombre.trim(),
        bio: bio.trim(),
        telefonos: rellenos.map((t) => ({ etiqueta: t.etiqueta.trim(), numero: t.numero.trim() })),
        publicado,
      });
      router.back();
    } catch (e) {
      Alert.alert(
        "No se ha guardado",
        e instanceof ErrorApi && e.estado === 400 ? "Revisa los teléfonos." : "Revisa la conexión y vuelve a intentarlo.",
      );
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <Seccion titulo="Datos">
        <Campo etiqueta="Cómo se llama" maxLength={60} value={nombre} onChangeText={setNombre} />
        <Campo
          etiqueta={`Para quien la encuentre (${bio.length}/600)`}
          placeholder="Cómo es, qué collar lleva, si se asusta…"
          multiline
          maxLength={600}
          value={bio}
          onChangeText={setBio}
        />
      </Seccion>

      <Seccion titulo="Teléfonos de contacto">
        <Texto tono="suave">Hasta tres. Se muestran a quien encuentre a tu mascota.</Texto>
        {telefonos.map((t, i) => (
          <View key={i} style={{ gap: espacio.sm }}>
            <Campo
              etiqueta={`Teléfono ${i + 1}`}
              datos
              keyboardType="phone-pad"
              placeholder="+34 600 000 000"
              maxLength={20}
              value={t.numero}
              onChangeText={(v) => cambiar(i, "numero", v)}
              error={intentado && malo(t) ? "No parece un teléfono: solo cifras, espacios y +." : null}
            />
            <Campo
              etiqueta="De quién es (opcional)"
              placeholder="Móvil de Ana, casa…"
              maxLength={30}
              value={t.etiqueta}
              onChangeText={(v) => cambiar(i, "etiqueta", v)}
            />
            {telefonos.length > 1 && (
              <Boton variante="secundario" alPulsar={() => setTelefonos((ts) => ts.filter((_, j) => j !== i))}>
                Quitar este teléfono
              </Boton>
            )}
          </View>
        ))}
        {telefonos.length < 3 && (
          <Boton variante="secundario" alPulsar={() => setTelefonos((ts) => [...ts, { etiqueta: "", numero: "" }])}>
            Añadir otro teléfono
          </Boton>
        )}
      </Seccion>

      <Seccion titulo="Publicarlo">
        <Opciones
          etiqueta={`Que lo vea quien encuentre a ${nombre.trim() || "tu mascota"}`}
          opciones={SI_NO}
          valor={publicado ? "si" : "no"}
          alElegir={(v) => setPublicado(v === "si")}
        />
        {intentado && sinContacto && (
          <Tarjeta tono="aviso">
            <Texto>Para publicarlo hace falta al menos un teléfono: es lo que permite que te llamen.</Texto>
          </Tarjeta>
        )}
        <Boton alPulsar={() => void guardar()} ocupado={guardando}>
          Guardar
        </Boton>
      </Seccion>
    </>
  );
}

export default function Perfil() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { carga, refrescar, refrescando } = useCarga(yo);
  const m = carga.estado === "listo" ? carga.datos.mascotas.find((x) => x.petId === id) : undefined;

  return (
    <Pantalla alRefrescar={refrescar} refrescando={refrescando} sinBorde>
      <View style={{ gap: espacio.sm }}>
        <Titulo>Perfil público</Titulo>
        <Texto tono="suave">
          Lo que verá quien encuentre a tu mascota: al escanear su placa, al consultar su chip en una clínica y dentro
          de su ficha. La foto se sube desde barkandmeow.app/mi-mascota.
        </Texto>
      </View>
      {carga.estado === "cargando" && <Cargando texto="Cargando…" />}
      {(carga.estado === "error" || (carga.estado === "listo" && !m)) && (
        <Tarjeta tono="alerta">
          <Texto>No se ha podido cargar. Tira hacia abajo para reintentar.</Texto>
        </Tarjeta>
      )}
      {m && <Editor key={m.petId} m={m} />}
    </Pantalla>
  );
}
