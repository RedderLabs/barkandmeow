---
name: "Bark & Meow"
description: Ficha de salud portátil para mascotas, con el tono de una cartilla veterinaria de papel que nunca se queda desactualizada.
colors:
  ground: "#F4F1EA"
  surface: "#FFFFFF"
  line: "#DDD7CB"
  divider: "#EEE9DF"
  field-line: "#C8C1B3"
  ink: "#1B2420"
  ink-soft: "#3E4643"
  muted: "#5A625E"
  accent: "#1D6B57"
  accent-soft: "#E3EFE9"
  accent-ink: "#154F40"
  accent-soft-ink: "#2F5A4E"
  alert: "#B4380E"
  alert-soft: "#FBE9E0"
  alert-ink: "#9A2F0B"
  alert-soft-line: "#F0C4AE"
  alert-soft-ink: "#5A3A2C"
  alert-ghost-line: "#C9A796"
  info: "#1F4F8F"
  info-soft: "#E6ECF5"
  owner: "#5A4A2E"
  owner-soft: "#F1EEE6"
  quote-ground: "#F7F5F0"
  dark-ground: "#141A18"
  dark-surface: "#1D2522"
  dark-ink: "#ECE8DF"
  dark-muted: "#A3ABA7"
  dark-accent: "#5FBF9F"
  dark-accent-on: "#0E1412"
  dark-alert: "#C2410C"
  dark-alert-text: "#F2946A"
  dark-info: "#8DB4EA"
typography:
  display:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1.1
  headline:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.2
  title:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    letterSpacing: "0.06em"
  data:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    letterSpacing: "0.02em"
rounded:
  badge: "6px"
  small: "10px"
  control: "12px"
  card: "14px"
  panel: "16px"
  feature: "20px"
  full: "999px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "14px"
  xl: "18px"
  page: "20px"
  section: "24px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.card}"
    height: "52px"
    typography: "{typography.title}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    height: "48px"
  button-destructive:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.alert-ink}"
    rounded: "{rounded.card}"
    height: "48px"
  button-icon:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    width: "44px"
    height: "44px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "14px"
  card-alert-loud:
    backgroundColor: "{colors.alert}"
    textColor: "{colors.surface}"
    rounded: "{rounded.panel}"
    padding: "16px"
  card-alert-quiet:
    backgroundColor: "{colors.alert-soft}"
    textColor: "{colors.alert-soft-ink}"
    rounded: "{rounded.card}"
    padding: "14px 16px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "48px"
    padding: "0 14px"
  input-primary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "52px"
    padding: "0 14px"
  badge-level-1:
    backgroundColor: "{colors.alert-soft}"
    textColor: "{colors.alert-ink}"
    rounded: "{rounded.badge}"
    padding: "4px 8px"
    typography: "{typography.data}"
  badge-level-2:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.badge}"
    padding: "4px 8px"
    typography: "{typography.data}"
  badge-level-3:
    backgroundColor: "{colors.info-soft}"
    textColor: "{colors.info}"
    rounded: "{rounded.badge}"
    padding: "4px 8px"
    typography: "{typography.data}"
  badge-source-owner:
    backgroundColor: "{colors.owner-soft}"
    textColor: "{colors.owner}"
    rounded: "{rounded.badge}"
    padding: "3px 8px"
  badge-source-clinic:
    backgroundColor: "{colors.info-soft}"
    textColor: "{colors.info}"
    rounded: "{rounded.badge}"
    padding: "3px 8px"
  toggle-selected:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.control}"
    height: "44px"
  toggle-unselected:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "44px"
  nav-tab-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.accent}"
    height: "76px"
  nav-tab-rest:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    height: "76px"
---

# Design System: Bark & Meow

## Overview

**Creative North Star: "La cartilla que nunca caduca"**

Todo dueño de una mascota tiene una cartilla veterinaria de papel: hueso, sobria, con sellos de clínicas y números escritos a mano. Funciona porque cualquiera la entiende sin explicación y se lee de un vistazo en un mostrador. Falla porque se pierde, se queda vieja y está en un solo idioma. Bark & Meow es esa cartilla, con la autoridad del papel intacta y sus tres defectos corregidos.

De ahí sale todo el sistema. El fondo es hueso (`ground` #F4F1EA), no blanco de aplicación, y las tarjetas flotan en blanco puro sobre él. Un serif de display (Fraunces) firma el nombre del animal como lo haría una portada impresa, mientras el texto corriente va en un palo seco neutro y **cada número que un humano podría transcribir, comparar o dictar por teléfono va en monoespaciada**. Esa terna —hueso, serif, mono— es la firma reconocible del sistema aunque se borre todo el contenido.

La densidad es de ficha clínica, no de panel de datos: mucha etiqueta pequeña en mayúsculas sobre dato grande, bloques separados por aire en vez de por líneas cuando se puede. Y hay un solo grito en toda la interfaz. El bloque de alergias es el único elemento que se permite un relleno de color saturado a sangre; todo lo demás es hueso, blanco y una hairline. La interfaz se usa con prisa, con mala luz y a veces en un idioma que el lector no domina, así que la jerarquía la lleva el contraste y el tamaño, nunca la decoración.

**Key Characteristics:**

- Fondo hueso con tarjetas blancas y hairlines; cero sombras en todo el sistema.
- Serif editorial solo para nombres y títulos; monoespaciada para todo dato transcribible.
- Un único color saturado a sangre, reservado al bloque de alergias.
- Etiqueta en versalitas sobre dato grande, como una ficha impresa.
- Controles de 44 px o más, sin excepción.
- Cada estado lleva icono y texto además de color.

## Colors

Paleta de consulta veterinaria: papel hueso, verde profundo de marca y un solo rojo que solo aparece cuando algo puede hacer daño.

### Primary

- **Verde Consulta** (#1D6B57): la marca. Wordmark, botón principal, pestaña activa, iconos de requisito cumplido, bordes de selección. Siempre con texto blanco encima (6,4:1).
- **Verde Consulta Tinta** (#154F40): el verde como texto sobre fondos claros, y el estado hover de los enlaces. Nunca como relleno.
- **Verde Hoja** (#E3EFE9): relleno suave para estados positivos, insignias de nivel 2 y el bloque de "lista para viajar".

### Secondary

- **Rojo Alergia** (#B4380E): el único relleno saturado del sistema. Bloque de alergias en la web del veterinario, con texto blanco (6,0:1).
- **Rojo Alergia Suave** (#FBE9E0) con **Rojo Alergia Tinta** (#9A2F0B): la misma alarma en voz baja. Bloque de alergias en la app del dueño, insignias de nivel 1, la acción de revocar.

### Tertiary

- **Azul Informe** (#1F4F8F) con **Azul Informe Suave** (#E6ECF5): documento verificado de clínica, avisos entrantes, insignias de nivel 3. Es el color de la procedencia institucional.
- **Pardo Declarado** (#5A4A2E) con **Pardo Declarado Suave** (#F1EEE6): la etiqueta "declarado por el dueño". Deliberadamente más apagado que el azul: el dato declarado no pesa lo mismo que un informe firmado.

### Neutral

- **Papel Hueso** (#F4F1EA): fondo de la app y del historial de escritorio. Nunca un fondo de tarjeta.
- **Blanco Ficha** (#FFFFFF): tarjetas, barras de navegación y el fondo completo de las dos pantallas de urgencia del veterinario, donde la prioridad es el contraste máximo.
- **Hairline** (#DDD7CB): borde de tarjeta y separador entre bloques.
- **Hairline Interior** (#EEE9DF): separador entre filas *dentro* de una tarjeta. Más claro a propósito, para que la tarjeta se lea como una pieza y no como una tabla.
- **Trazo de Campo** (#C8C1B3): borde de input y textarea. Más oscuro que la hairline porque un campo editable tiene que anunciarse.
- **Tinta** (#1B2420): texto principal (14,1:1 sobre hueso).
- **Tinta Suave** (#3E4643): cuerpo de texto largo dentro de tarjetas en el historial de escritorio.
- **Apagado** (#5A625E): etiquetas, metadatos, pestañas en reposo (5,6:1 sobre hueso).

### Modo oscuro

Inversión tonal completa (`dark-ground` #141A18, `dark-surface` #1D2522, `dark-ink` #ECE8DF), con el verde subiendo a menta (#5FBF9F) para mantener 7,0:1 sobre superficie. **El bloque de alergias conserva su relleno saturado en ambos modos**, para que se reconozca igual a cualquier hora.

### Named Rules

**La Regla del Único Grito.** El rojo de alerta solo marca alergias, interacciones peligrosas y acciones destructivas. En ninguna pantalla debe aparecer más de un elemento con relleno `alert` a sangre. Si aparece en más sitios, deja de llamar la atención y el sistema ha fallado en lo único que no puede fallar.

**La Regla del Doble Canal.** Ningún significado viaja solo en el color. Todo estado lleva además icono y texto literal: "NIVEL 1", "Declarado por el dueño", "Documento de la clínica". Se audita quitando el color de la captura: si el estado sigue siendo legible, pasa.

**La Regla del Ámbar.** Verde y rojo nunca forman pareja de estados. Lo contrario de "listo para viajar" es ámbar con texto, nunca rojo, porque el rojo ya está reservado y porque la pareja verde/rojo desaparece para buena parte de los daltónicos. *El valor ámbar está sin definir: no hay token ni pantalla que lo muestre. Hay que resolverlo con el usuario antes de construir el estado "no listo".*

## Typography

**Display Font:** Fraunces (con Georgia, serif)
**Body Font:** IBM Plex Sans (con system-ui, sans-serif)
**Label/Mono Font:** IBM Plex Mono (con ui-monospace, monospace)

Las tres son de licencia SIL OFL y se empaquetan con la app y la web. **No se carga nada de Google Fonts en producción**, aunque las pantallas del lienzo lo hagan.

**Character:** Fraunces aporta calidez de imprenta —ejes ópticos, un punto de suavidad— y evita que una ficha clínica parezca un formulario de hospital. Plex Sans es el neutro que aguanta cuatro idiomas sin llamar la atención. Plex Mono es funcional, no decorativo: alinea dosis y fechas en columna y hace que un número de chip de 15 dígitos se pueda leer en voz alta sin perder el sitio.

### Hierarchy

- **Display** (Fraunces 600, 26–30px, line-height 1.1): el nombre del animal, y solo eso, más los títulos de pantalla en la app del dueño. Es la voz de portada.
- **Headline** (Fraunces 600, 20–22px, line-height 1.2): wordmark "Bark & Meow", títulos de sección en escritorio, cabecera de panel.
- **Title** (Plex Sans 600, 15–17px): el dato importante de una tarjeta. El valor, no la etiqueta.
- **Body** (Plex Sans 400, 14–15px, line-height 1.45): descripciones, avisos legales, texto de nota clínica.
- **Label** (Plex Sans 600, 12–13px, letter-spacing 0.05–0.06em, mayúsculas, color `muted`): las versalitas que encabezan cada bloque. "RESUMEN DE EMERGENCIA", "AVISAR AL TUTOR", "DURACIÓN".
- **Data** (Plex Mono 400–500, 12–14px): números de chip, dosis, fechas, lotes, códigos ATCvet, cuentas atrás e insignias de nivel.

### Densidad por superficie

El frontmatter lleva un paso representativo por rol; la escala real tiene tres densidades. La superficie de **persuasión** (la presentación pública) añade un paso de display por encima de todo lo demás: `clamp(34px, 4.4vw, 52px)` con `letter-spacing: -0.015em`, y solo para el titular de portada. Es el único sitio del sistema donde la tipografía habla antes que el dato; dentro del producto ese paso no existe.

Las otras dos densidades son de producto. Las superficies de móvil (app del dueño, urgencias del veterinario) van un paso por debajo: cuerpo 14px, título de panel 22px. El escritorio de la clínica y el historial suben un paso: **cuerpo 15px y título de panel 20px**, porque se leen a distancia de mostrador y no a distancia de mano. Ambas densidades son el sistema, no una desviación.

### Named Rules

**La Regla del Monoespaciado.** Todo número que un humano pueda transcribir, comparar, dictar o teclear va en Plex Mono: chip, dosis, fechas, lotes, códigos, caducidades. El texto que solo se lee va en Plex Sans. La duda se resuelve preguntando si alguien lo copiaría a mano.

**La Regla de la Etiqueta Muda.** La etiqueta en versalitas es siempre `muted` y siempre más pequeña que su dato. La etiqueta nombra, el dato habla. Nunca compiten en peso.

## Layout

**Móvil (390 × 844).** Padding de página 20px. Columna vertical con gaps de 14–18px entre bloques. La navegación inferior ocupa 76px fijos con cuatro columnas iguales, y el contenido que la lleva reduce el padding inferior a 0 para que la barra apoye en el borde. Rejilla de dos columnas (`repeat(2, minmax(0, 1fr))`, gap 10px) para las tarjetas de resumen, y de tres para los selectores de duración.

**Escritorio (1280 × 900, historial del veterinario).** Cabecera fija de 64px con padding lateral de 32px, fondo blanco y hairline inferior. Debajo, rejilla de tres columnas `300px minmax(0, 1fr) 360px` con gap de 24px y padding de 28px/32px: identidad y constantes a la izquierda, historial cronológico en el centro, formulario de nota de la visita a la derecha, anclado con `align-self: start`. Es la única pantalla del sistema pensada para un ordenador de mostrador; las otras dos del veterinario son verticales porque se abren desde un móvil.

**Ritmo.** La escala de espaciado real es 6 / 8 / 10 / 12 / 14 / 16 / 18 / 20 / 24 / 28 / 32. El padding interno de tarjeta es 14px en móvil y 16px en bloques destacados; el de las filas dentro de una tarjeta, 12px 14px.

**Densidad.** Las dos pantallas de urgencia van sobre blanco a sangre, sin fondo hueso, y caben enteras sin scroll en un móvil. Es deliberado: el veterinario de guardia no debe tener que desplazarse para ver una alergia.

## Elevation & Depth

**El sistema no tiene sombras.** Ni una `box-shadow` en las siete pantallas. La profundidad se construye con dos recursos: el escalón tonal entre el fondo hueso (#F4F1EA) y la tarjeta blanca (#FFFFFF), y una hairline de 1px (#DDD7CB) que dibuja el borde. Donde hace falta más jerarquía, el borde sube a 2px y toma color —verde en un selector activo, azul en un aviso entrante— en lugar de levantar la pieza del plano.

### Named Rules

**La Regla del Plano Único.** Todo vive en el mismo plano. Para destacar algo se cambia su color de relleno o se engorda su borde a 2px; nunca se le añade sombra ni se le desplaza en Z. Una sombra en este sistema es un error de revisión, no una decisión de estilo.

## Shapes

Escalera de radios ligada al tamaño de la pieza: 6px en insignias y fichas de nivel, 10–12px en controles (inputs, selects, botones de icono de 44px, selectores de duración), 14px en tarjetas y botones de acción, 16px en bloques destacados (alergias, avisos), 20px en la tarjeta del QR, y círculo completo en el avatar de la mascota (64px) y en los discos de icono (36px).

Los bordes son de 1px por defecto. El 2px está reservado a tres casos y solo a tres: el campo de chip enfocado, el selector de duración elegido y la tarjeta de aviso entrante. Nada se recorta ni se enmascara; no hay geometría diagonal ni formas orgánicas en ninguna pantalla.

Los iconos son SVG de trazo, 1.8–2.2 de grosor, con `stroke-linecap: round`, dibujados a 16px (dentro de etiquetas), 20px (dentro de botones) o 22px (navegación y filas de checklist). Siempre heredan `currentColor`.

## Components

### Buttons

- **Shape:** esquinas suaves de 14px (`{rounded.card}`) en las acciones, 12px en los controles pequeños.
- **Primary:** relleno verde (#1D6B57) con texto blanco, 52px de alto, peso 600, 16px. Con icono SVG de 20px a la izquierda y 10px de separación cuando la acción es física ("Llamar al tutor", "Compartir con un veterinario").
- **Secondary:** fondo blanco, hairline de 1px (#DDD7CB), texto tinta, 48px de alto, peso 500. Es la acción alternativa, nunca la principal disfrazada.
- **Destructive (ghost):** fondo blanco, borde #C9A796, texto `alert-ink` (#9A2F0B), 48px, peso 600. Revocar un acceso se ve rojo pero no grita: no es un relleno a sangre.
- **Soft:** relleno `accent-soft` (#E3EFE9) con texto `accent-ink`, 44px. Para la acción positiva dentro de una tarjeta ("Añadir a la ficha"), donde un verde a sangre competiría con el botón principal de la pantalla.
- **Icon:** 44 × 44px exactos, fondo blanco, hairline, radio 12px, icono de 20px heredando `currentColor`. Siempre con `aria-label`.
- **Hover / Focus:** sin definir en las pantallas del lienzo, que son estáticas. *Pendiente de resolver en la implementación: hace falta un anillo de foco visible, dado que la interfaz se opera con prisa y debe ser navegable por teclado.*

### Chips

Dos familias distintas que no deben mezclarse.

- **Insignia de nivel:** Plex Mono 12px, radio 6px, padding 4px 8px, en mayúsculas y con el número escrito ("NIVEL 1", "NÍVEL 2 · ACESSO TEMPORÁRIO"). El color codifica el nivel: 1 rojo suave, 2 verde suave, 3 azul suave.
- **Insignia de procedencia:** Plex Sans 12px, radio 6px, padding 3px 8px. Azul informe para "Documento de la clínica", pardo para "Declarado por el dueño". Aparece en la esquina superior derecha de cada registro del historial, nunca suelta.

### Cards / Containers

- **Corner Style:** 14px estándar, 16px cuando el bloque es destacado, 20px en la tarjeta del QR.
- **Background:** blanco sobre fondo hueso. En las pantallas de urgencia del veterinario, donde el fondo ya es blanco, la tarjeta se define solo por su hairline.
- **Shadow Strategy:** ninguna. Ver Elevation & Depth.
- **Border:** hairline de 1px (#DDD7CB); 2px en color para la tarjeta de aviso entrante.
- **Internal Padding:** 14–16px. Las tarjetas de lista no llevan padding propio: lo lleva cada fila (12px 14px), separada por el hairline interior (#EEE9DF) y sin borde en la última.
- **Lista de filas:** el patrón más repetido del sistema. Etiqueta `muted` de 12px sobre valor de 14–15px en peso 600, con la parte numérica del valor en mono y peso 400 dentro de la misma línea.

### Inputs / Fields

- **Style:** fondo blanco, borde de 1px #C8C1B3, radio 12px, 48px de alto, padding lateral de 14px, texto de 16px para que iOS no haga zoom al enfocar.
- **Campo de chip (destacado):** 52px de alto, borde de 2px verde, Plex Mono 18px con `letter-spacing: 0.04em`. Es el campo protagonista del nivel 0 y se ve desde el otro lado del mostrador.
- **Select:** 44px (40px en la cabecera de escritorio), radio 10px, hairline, contenido en Plex Mono. El selector de idioma es un select nativo a propósito: lo entiende cualquiera y funciona sin JavaScript.
- **Textarea:** mismo trazo y radio, padding 12px 14px, `resize: none`.
- **Checkbox:** 20 × 20px con `accent-color: #1D6B57`, dentro de una fila de 44px mínimos de alto.
- **Error / Disabled:** sin definir en el lienzo. *Pendiente de resolver en la implementación.*

### Navigation

- **App del dueño:** barra inferior de 76px, fondo blanco, hairline superior, cuatro columnas iguales. Cada pestaña apila icono de 22px sobre etiqueta de 12px. Activa en verde con peso 600; en reposo en `muted` con peso normal. El peso además del color cumple la Regla del Doble Canal.
- **Web del veterinario:** no hay navegación. Cada nivel es una pantalla terminal, con el wordmark y el selector de idioma como única cabecera. La ausencia de navegación es la función: el veterinario llega por un enlace y no tiene dónde perderse.
- **Cabecera de escritorio:** 64px, blanco, hairline inferior; wordmark e insignia de nivel a la izquierda, cuenta atrás en mono y selector de idioma a la derecha.

### Bloque de alergias (componente firma)

El elemento más importante del sistema y el único con relleno saturado. Dos registros de voz:

- **Alto (web del veterinario):** relleno #B4380E a sangre, texto blanco, radio 16px, padding 16px. Encabezado en versalitas de 13px con icono de triángulo de 18px, sustancia en 20px peso 600, reacción y gravedad en 14px, y el código ATCvet en mono al pie con opacidad 0.9.
- **Bajo (app del dueño):** relleno #FBE9E0, borde #F0C4AE, encabezado y texto en `alert-ink`, radio 14px. El dueño ya conoce la alergia; no hace falta gritarle.

Ambos conservan su relleno en modo oscuro. Si no hay alergias registradas, el bloque **no** se muestra en rojo: pasa a ser una fila más de la lista de constantes ("Ninguna registrada"), porque un bloque rojo que dice "ninguna" enseña al lector a ignorar el rojo.

## Do's and Don'ts

### Do:

- **Do** poner en Plex Mono todo número transcribible: chip, dosis, fechas, lotes, códigos, cuentas atrás.
- **Do** acompañar cada estado de icono y texto además de color, y auditarlo quitando el color.
- **Do** etiquetar cada registro clínico con su procedencia (azul "Documento de la clínica" o pardo "Declarado por el dueño"), sin excepción.
- **Do** mantener todo control en 44 × 44px o más, incluidas las filas de checkbox.
- **Do** construir la profundidad con el escalón hueso/blanco y una hairline de 1px; subir a 2px en color cuando haga falta más énfasis.
- **Do** dar a las pantallas de urgencia fondo blanco a sangre y que quepan sin scroll.
- **Do** empaquetar las tres fuentes OFL con la app y la web.
- **Do** mostrar el texto libre en su idioma original con aviso, y marcar toda traducción automática como automática.

### Don't:

- **Don't** usar el rojo de alerta para nada que no sea una alergia, una interacción peligrosa o una acción destructiva.
- **Don't** añadir ninguna `box-shadow`. El sistema es plano y eso es una invariante, no una preferencia.
- **Don't** emparejar verde y rojo como estados opuestos. Lo contrario de "listo" es ámbar con texto.
- **Don't** usar emojis en la interfaz. Las banderas de país van como SVG.
- **Don't** cargar Google Fonts en producción, aunque las pantallas del lienzo lo hagan.
- **Don't** nombrar medicamentos por marca comercial: siempre principio activo, porque la marca cambia de un país a otro.
- **Don't** mostrar un bloque de alergias en rojo cuando no hay alergias.
- **Don't** presentar un dato declarado por el dueño con el mismo peso visual que un informe firmado por una clínica.
- **Don't** meter una cuenta, un registro o un muro de sesión en el camino del veterinario de guardia.
- **Don't** inventar precios, planes, clínicas piloto, testimonios ni métricas: no existen.
