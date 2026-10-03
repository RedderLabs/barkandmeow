import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Alert, View } from "react-native";
import { Boton, Cargando, Campo, Opciones, Pantalla, Seccion, Tarjeta, Texto, Titulo } from "@/components/ui";
import { ErrorApi, guardarPerfil, yo, type Mascota } from "@/lib/api";
import { useCarga } from "@/lib/datos";
import { useT, type Clave } from "@/lib/idioma";
import { espacio } from "@/lib/tema";

/* Perfil público: lo que ve quien encuentra al animal (al escanear su placa o
   con el número de chip) y el veterinario dentro de la ficha. Va sin cifrar
   porque su función es verse, así que el dueño decide qué publica. La foto se
   sube desde barkandmeow.app/mi-mascota. */

const TEL = /^\+?[0-9 ()-]{6,20}$/;
const SI_NO = [
  ["si", "perfil.publicarSi"],
  ["no", "perfil.publicarNo"],
] as const satisfies readonly (readonly [string, Clave])[];

type Tel = { etiqueta: string; numero: string };

function Editor({ m }: { m: Mascota }) {
  const t = useT();
  const [nombre, setNombre] = useState(m.perfil.nombre);
  const [bio, setBio] = useState(m.perfil.bio);
  const [telefonos, setTelefonos] = useState<Tel[]>(
    m.perfil.telefonos.length ? m.perfil.telefonos : [{ etiqueta: "", numero: "" }],
  );
  const [publicado, setPublicado] = useState(m.perfil.publicado);
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const rellenos = telefonos.filter((x) => x.numero.trim());
  const malo = (x: Tel) => !!x.numero.trim() && !TEL.test(x.numero.trim());
  const sinContacto = publicado && rellenos.length === 0;
  const cambiar = (i: number, campo: keyof Tel, valor: string) =>
    setTelefonos((ts) => ts.map((x, j) => (j === i ? { ...x, [campo]: valor } : x)));

  async function guardar() {
    setIntentado(true);
    if (telefonos.some(malo) || sinContacto) return;
    setGuardando(true);
    try {
      await guardarPerfil(m.petId, {
        nombre: nombre.trim(),
        bio: bio.trim(),
        telefonos: rellenos.map((x) => ({ etiqueta: x.etiqueta.trim(), numero: x.numero.trim() })),
        publicado,
      });
      router.back();
    } catch (e) {
      Alert.alert(
        t("perfil.errorGuardar"),
        t(e instanceof ErrorApi && e.estado === 400 ? "perfil.revisaTelefonos" : "perfil.revisaConexion"),
      );
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <Seccion titulo={t("perfil.datos")}>
        <Campo etiqueta={t("perfil.nombre")} maxLength={60} value={nombre} onChangeText={setNombre} />
        <Campo
          etiqueta={t("perfil.bio", { n: bio.length })}
          placeholder={t("perfil.bioPista")}
          multiline
          maxLength={600}
          value={bio}
          onChangeText={setBio}
        />
      </Seccion>

      <Seccion titulo={t("perfil.telefonos")}>
        <Texto tono="suave">{t("perfil.telefonosTexto")}</Texto>
        {telefonos.map((x, i) => (
          <View key={i} style={{ gap: espacio.sm }}>
            <Campo
              etiqueta={t("perfil.telefono", { n: i + 1 })}
              datos
              keyboardType="phone-pad"
              placeholder="+34 600 000 000"
              maxLength={20}
              value={x.numero}
              onChangeText={(v) => cambiar(i, "numero", v)}
              error={intentado && malo(x) ? t("perfil.telefonoMal") : null}
            />
            <Campo
              etiqueta={t("perfil.deQuien")}
              placeholder={t("perfil.deQuienPista")}
              maxLength={30}
              value={x.etiqueta}
              onChangeText={(v) => cambiar(i, "etiqueta", v)}
            />
            {telefonos.length > 1 && (
              <Boton variante="secundario" alPulsar={() => setTelefonos((ts) => ts.filter((_, j) => j !== i))}>
                {t("perfil.quitarTelefono")}
              </Boton>
            )}
          </View>
        ))}
        {telefonos.length < 3 && (
          <Boton variante="secundario" alPulsar={() => setTelefonos((ts) => [...ts, { etiqueta: "", numero: "" }])}>
            {t("perfil.otroTelefono")}
          </Boton>
        )}
      </Seccion>

      <Seccion titulo={t("perfil.publicar")}>
        <Opciones
          etiqueta={nombre.trim() ? t("perfil.queLoVea", { nombre: nombre.trim() }) : t("perfil.queLoVeaSin")}
          opciones={SI_NO.map(([v, k]) => [v, t(k)] as const)}
          valor={publicado ? "si" : "no"}
          alElegir={(v) => setPublicado(v === "si")}
        />
        {intentado && sinContacto && (
          <Tarjeta tono="aviso">
            <Texto>{t("perfil.faltaTelefono")}</Texto>
          </Tarjeta>
        )}
        <Boton alPulsar={() => void guardar()} ocupado={guardando}>
          {t("comun.guardar")}
        </Boton>
      </Seccion>
    </>
  );
}

export default function Perfil() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { carga, refrescar, refrescando } = useCarga(yo);
  const m = carga.estado === "listo" ? carga.datos.mascotas.find((x) => x.petId === id) : undefined;

  return (
    <Pantalla alRefrescar={refrescar} refrescando={refrescando} sinBorde>
      <View style={{ gap: espacio.sm }}>
        <Titulo>{t("comun.pantalla.perfil")}</Titulo>
        <Texto tono="suave">{t("perfil.intro")}</Texto>
      </View>
      {carga.estado === "cargando" && <Cargando texto={t("comun.cargando")} />}
      {(carga.estado === "error" || (carga.estado === "listo" && !m)) && (
        <Tarjeta tono="alerta">
          <Texto>{t("comun.errorCarga")}</Texto>
        </Tarjeta>
      )}
      {m && <Editor key={m.petId} m={m} />}
    </Pantalla>
  );
}
