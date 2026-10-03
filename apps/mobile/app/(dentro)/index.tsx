import { useEffect, useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { enReclamacion, Identidad } from "@/components/Mascota";
import { Boton, Campo, Cargando, CodigoActivacion, Pantalla, Tarjeta, Texto, Titulo } from "@/components/ui";
import { identificar, nuevaMascota, yo, type Mascota } from "@/lib/api";
import { leerToken } from "@/lib/almacen";
import { useCarga } from "@/lib/datos";
import { useT, type T } from "@/lib/idioma";
import { ir } from "@/lib/salud";
import { espacio, fuente, radio, useColores } from "@/lib/tema";

/* «Mis mascotas»: quién es cada una, si le falta algo y qué toca ahora. Toda
   la tarjeta lleva a su pantalla, donde están la ficha de salud, la placa y
   compartir con un veterinario. */

/** Lo siguiente que toca, en una línea. */
function siguiente(m: Mascota, t: T): string | null {
  if (enReclamacion(m)) return t("mascotas.toca.reclamacion");
  if (m.estado !== "activa") return t("mascotas.toca.activar");
  if (!m.perfil.publicado) return t("mascotas.toca.publicar");
  if (m.perfil.telefonos.length === 0) return t("mascotas.toca.telefono");
  if (!m.ficha) return t("mascotas.toca.ficha");
  if (!m.placa) return t("mascotas.toca.placa");
  return null;
}

function Tarjetita({ m, token }: { m: Mascota; token: string | null }) {
  const c = useColores();
  const t = useT();
  const nombre = m.perfil.nombre.trim() || t("comun.tuMascota").toLowerCase();
  const toca = siguiente(m, t);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("mascotas.abrir", { nombre })}
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
          {m.mensajes === 1 ? t("mascotas.mensajes.uno") : t("mascotas.mensajes.varios", { n: m.mensajes })}
        </Texto>
      ) : null}
    </Pressable>
  );
}

/** Añadir otra mascota a la cuenta, en una ventana aparte: queda pendiente
    hasta que una clínica active su chip. */
function Nueva({
  abierta,
  vacia,
  alAnadir,
  alCerrar,
}: {
  abierta: boolean;
  vacia: boolean;
  alAnadir: () => void;
  alCerrar: () => void;
}) {
  const c = useColores();
  const t = useT();
  const [chip, setChip] = useState("");
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [hecho, setHecho] = useState<{
    codigoActivacion: string;
    caduca: string;
    nombre: string;
  } | null>(null);

  async function anadir() {
    const id = identificar(chip);
    if (!id) return setError(t("mascotas.nueva.errorChip"));
    setError(null);
    setOcupado(true);
    try {
      const r = await nuevaMascota(id, nombre.trim());
      setHecho({ ...r, nombre: nombre.trim() });
      setChip("");
      setNombre("");
      alAnadir();
    } catch {
      setError(t("mascotas.nueva.error"));
    } finally {
      setOcupado(false);
    }
  }

  function cerrar() {
    if (ocupado) return;
    setHecho(null);
    setChip("");
    setNombre("");
    setError(null);
    alCerrar();
  }

  return (
    <Modal visible={abierta} animationType="slide" presentationStyle="pageSheet" onRequestClose={cerrar}>
      <Pantalla>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: espacio.md,
          }}
        >
          <View style={{ flex: 1 }}>
            <Titulo>{vacia ? t("mascotas.anadirPrimera") : t("mascotas.anadirOtra")}</Titulo>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("comun.cerrar")}
            onPress={cerrar}
            style={{
              minHeight: 44,
              minWidth: 44,
              justifyContent: "center",
              alignItems: "flex-end",
            }}
          >
            <Texto estilo={{ color: c.accentInk, fontFamily: fuente.textoFuerte }}>{t("comun.cerrar")}</Texto>
          </Pressable>
        </View>
        {hecho ? (
          <>
            <CodigoActivacion codigo={hecho.codigoActivacion} caduca={hecho.caduca} nombre={hecho.nombre} />
            <Boton alPulsar={cerrar}>{t("comun.hecho")}</Boton>
            <Boton variante="secundario" alPulsar={() => setHecho(null)}>
              {t("mascotas.nueva.otraMas")}
            </Boton>
          </>
        ) : (
          <>
            <Texto tono="suave">{t("mascotas.nueva.intro")}</Texto>
            <Campo
              etiqueta={t("mascotas.nueva.chip")}
              datos
              keyboardType="number-pad"
              maxLength={32}
              value={chip}
              onChangeText={setChip}
              error={error}
            />
            <Campo etiqueta={t("mascotas.nueva.nombre")} maxLength={60} value={nombre} onChangeText={setNombre} />
            <Boton alPulsar={() => void anadir()} ocupado={ocupado}>
              {t("mascotas.nueva.boton")}
            </Boton>
          </>
        )}
      </Pantalla>
    </Modal>
  );
}

export default function Mascotas() {
  const t = useT();
  const { carga, refrescar, refrescando } = useCarga(yo);
  const [token, setToken] = useState<string | null>(null);
  const [anadiendo, setAnadiendo] = useState(false);
  useEffect(() => {
    void leerToken().then(setToken);
  }, []);

  return (
    <Pantalla alRefrescar={refrescar} refrescando={refrescando}>
      <View style={{ gap: espacio.sm }}>
        <Titulo>{t("comun.tab.mascotas")}</Titulo>
        <Texto tono="suave">{t("mascotas.intro")}</Texto>
      </View>
      {carga.estado === "cargando" && <Cargando texto={t("mascotas.cargando")} />}
      {carga.estado === "error" && (
        <Tarjeta tono="alerta">
          <Texto>{t("comun.errorCarga")}</Texto>
        </Tarjeta>
      )}
      {carga.estado === "listo" &&
        (carga.datos.mascotas.length === 0 ? (
          <Texto tono="suave">{t("mascotas.vacia")}</Texto>
        ) : (
          carga.datos.mascotas.map((m) => <Tarjetita key={m.petId} m={m} token={token} />)
        ))}
      {carga.estado === "listo" && (
        <>
          <Boton
            variante={carga.datos.mascotas.length === 0 ? "primario" : "secundario"}
            alPulsar={() => setAnadiendo(true)}
          >
            {carga.datos.mascotas.length === 0 ? t("mascotas.anadirPrimera") : t("mascotas.anadirOtra")}
          </Boton>
          <Nueva
            abierta={anadiendo}
            vacia={carga.datos.mascotas.length === 0}
            alAnadir={() => void refrescar()}
            alCerrar={() => setAnadiendo(false)}
          />
        </>
      )}
    </Pantalla>
  );
}
