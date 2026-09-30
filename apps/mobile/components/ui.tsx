/* Piezas de la app con el sistema de DESIGN.md: suelo cálido, tarjetas
   blancas, un solo verde de acción y ámbar para lo que falta (La Regla del
   Ámbar: lo contrario de «listo» nunca es rojo; el rojo es solo para avisos
   de verdad). Objetivos táctiles de 44 px como mínimo. */

import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { espacio, fuente, radio, toque, useColores } from "@/lib/tema";

export function Pantalla({
  children,
  alRefrescar,
  refrescando = false,
}: {
  children: ReactNode;
  alRefrescar?: () => void;
  refrescando?: boolean;
}) {
  const c = useColores();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.ground }} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={{ padding: espacio.page, gap: espacio.section, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          alRefrescar ? (
            <RefreshControl refreshing={refrescando} onRefresh={alRefrescar} tintColor={c.accent} />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Titulo({ children, nivel = 1 }: { children: ReactNode; nivel?: 1 | 2 }) {
  const c = useColores();
  return (
    <Text
      accessibilityRole="header"
      style={{
        fontFamily: fuente.display,
        fontSize: nivel === 1 ? 26 : 22,
        lineHeight: nivel === 1 ? 29 : 26,
        color: c.ink,
      }}
    >
      {children}
    </Text>
  );
}

export function Texto({
  children,
  tono = "normal",
  estilo,
}: {
  children: ReactNode;
  tono?: "normal" | "suave" | "fuerte";
  estilo?: TextStyle;
}) {
  const c = useColores();
  return (
    <Text
      style={[
        {
          fontFamily: tono === "fuerte" ? fuente.textoFuerte : fuente.texto,
          fontSize: tono === "fuerte" ? 16 : 14,
          lineHeight: tono === "fuerte" ? 21 : 20,
          color: tono === "suave" ? c.muted : c.ink,
        },
        estilo,
      ]}
    >
      {children}
    </Text>
  );
}

export function Datos({ children }: { children: ReactNode }) {
  const c = useColores();
  return (
    <Text style={{ fontFamily: fuente.datos, fontSize: 12, letterSpacing: 0.24, color: c.muted }}>{children}</Text>
  );
}

export function Tarjeta({ children, tono = "normal" }: { children: ReactNode; tono?: "normal" | "aviso" | "alerta" }) {
  const c = useColores();
  const borde = tono === "aviso" ? c.warnLine : tono === "alerta" ? c.alertSoftLine : c.line;
  const fondo = tono === "aviso" ? c.warnSoft : tono === "alerta" ? c.alertSoft : c.surface;
  return (
    <View
      style={{
        backgroundColor: fondo,
        borderColor: borde,
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderRadius: radio.card,
        padding: espacio.lg,
        gap: espacio.md,
      }}
    >
      {children}
    </View>
  );
}

export function Insignia({ tono, children }: { tono: "listo" | "aviso"; children: ReactNode }) {
  const c = useColores();
  return (
    <View
      style={{
        alignSelf: "flex-start",
        backgroundColor: tono === "listo" ? c.accentSoft : c.warnSoft,
        borderRadius: radio.badge,
        paddingHorizontal: espacio.sm,
        paddingVertical: 3,
      }}
    >
      <Text
        style={{
          fontFamily: fuente.textoFuerte,
          fontSize: 13,
          letterSpacing: 0.4,
          color: tono === "listo" ? c.accentSoftInk : c.warnInk,
        }}
      >
        {children}
      </Text>
    </View>
  );
}

export function Campo({
  etiqueta,
  error,
  datos = false,
  ...props
}: TextInputProps & { etiqueta: string; error?: string | null; datos?: boolean }) {
  const c = useColores();
  return (
    <View style={{ gap: espacio.xs }}>
      <Text style={{ fontFamily: fuente.textoFuerte, fontSize: 13, letterSpacing: 0.4, color: c.inkSoft }}>
        {etiqueta}
      </Text>
      <TextInput
        placeholderTextColor={c.muted}
        accessibilityLabel={etiqueta}
        {...props}
        style={{
          minHeight: 48,
          borderWidth: 1,
          borderColor: error ? c.alert : c.fieldLine,
          borderRadius: radio.control,
          backgroundColor: c.surface,
          paddingHorizontal: espacio.md,
          fontFamily: datos ? fuente.datos : fuente.texto,
          fontSize: datos ? 15 : 16,
          letterSpacing: datos ? 1 : 0,
          color: c.ink,
        }}
      />
      {error ? (
        <Text accessibilityRole="alert" style={{ fontFamily: fuente.texto, fontSize: 13, color: c.alertInk }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function Boton({
  children,
  alPulsar,
  variante = "primario",
  ocupado = false,
  desactivado = false,
}: {
  children: string;
  alPulsar: () => void;
  variante?: "primario" | "secundario" | "peligro";
  ocupado?: boolean;
  desactivado?: boolean;
}) {
  const c = useColores();
  const primario = variante === "primario";
  const apagado = desactivado || ocupado;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: apagado, busy: ocupado }}
      disabled={apagado}
      onPress={alPulsar}
      style={({ pressed }) => ({
        minHeight: primario ? 52 : 48,
        minWidth: toque,
        borderRadius: radio.card,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: espacio.xl,
        backgroundColor: primario ? (pressed ? c.accentPress : c.accent) : c.surface,
        borderWidth: primario ? 0 : 1,
        borderColor: variante === "peligro" ? c.alertGhostLine : c.line,
        opacity: apagado ? 0.55 : 1,
      })}
    >
      {ocupado ? (
        <ActivityIndicator color={primario ? c.accentOn : c.accent} />
      ) : (
        <Text
          style={{
            fontFamily: fuente.textoFuerte,
            fontSize: 16,
            color: primario ? c.accentOn : variante === "peligro" ? c.alertInk : c.ink,
          }}
        >
          {children}
        </Text>
      )}
    </Pressable>
  );
}

export function Cargando({ texto }: { texto: string }) {
  const c = useColores();
  return (
    <View accessibilityRole="progressbar" style={{ padding: espacio.section, alignItems: "center", gap: espacio.md }}>
      <ActivityIndicator color={c.accent} />
      <Texto tono="suave">{texto}</Texto>
    </View>
  );
}
