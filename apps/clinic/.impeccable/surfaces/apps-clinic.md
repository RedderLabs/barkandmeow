---
version: 1
slug: "apps-clinic"
primary_target: "apps/clinic"
related_targets: []
---

# Superficie: panel diario de la clínica (`apps/clinic`)

**Alcance:** la pantalla donde el personal de una clínica vive cada día. No cubre el alta de la clínica, la gestión del equipo ni la documentación de la API: son superficies hermanas que heredan de esta.

**Modo:** Operate. La clínica viene a completar una tarea, y la expresión nunca puede tapar el estado ni la acción.

## Direction contract

**THESIS:** (Cambiada por el usuario el 2026-10-01.) La portada es el mostrador: un solo campo de chip que dice qué toca —activar con el código del dueño, pedir el alta de nivel 3 o «ya es paciente»— y, debajo, los pacientes. La tesis anterior («el estado del tubo, no un directorio de pacientes») dejaba a la clínica sin saber por dónde empezar y sin reconocer a nadie.

**OWN-WORLD:** El mundo de Bark & Meow sin tocar: papel hueso, hairline de 1px, cero sombras, verde solo en la acción, mono en todo dato. Reconocible con el contenido borrado por el campo de chip de 52px con borde verde de 2px sobre una tarjeta blanca.

**STORY:** La clínica lee un chip y la consola responde en una línea qué pasa y qué toca; el paciente se reconoce por el nombre que la propia clínica le puso, que el servidor no puede leer.

**FIRST VIEWPORT:** Cabecera con la navegación (Consola, Equipo, Conexión). A la izquierda, el mostrador con el campo de chip y su respuesta; debajo, la lista de pacientes con buscador. A la derecha, en la columna de 360px, el software de gestión: conectado o no, últimos envíos y la nota de que van sellados. El registro entero de envíos vive en Conexión.

**FORM:** Consola de conexión, índice 5 de 7 de mi lista, repartida como lead. Seed 5deb6c20, code-led.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Audiencia y trabajo

Personal de una clínica veterinaria: auxiliares y veterinarios, en un ordenador de mostrador, entre consulta y consulta. El trabajo es de dos tipos y el panel tiene que servir a los dos sin favorecer a uno: **enviar** el informe de una consulta a la ficha del dueño, y **vigilar** que lo que el software de gestión envía solo está llegando.

## Contenido y estado que la pantalla debe mostrar

- El campo de chip y su respuesta: sin registro, pendiente de activar, activo sin permiso, con reclamación abierta, ya es paciente; y los pasos que salen de ahí (código de activación, reclamación de 14 días, número de comparación del alta).
- Pacientes con nivel 3 vivo: nombre que pone la clínica (cifrado en su navegador), final del chip, fecha del alta, último informe y caducidad si la hay.
- Qué ve un navegador sin la clave de la clínica: que hay nombre, pero no lo que dice.
- Estado de la conexión con el software de gestión y sus últimos envíos, sellados y sin vista previa.

## El momento memorable

La pieza que esta superficie tiene que hacer bien es **decirle a una clínica que acaba de subir datos que no va a poder volver a leerlos sin permiso del dueño**, y que eso no se lea como un fallo del producto sino como la razón de usarlo. Ocurre en la fila del registro: el informe enviado se muestra sellado, con su insignia de cifrado y sin vista previa del contenido. No es un estado de error ni un candado decorativo; es la prueba visible de que Bark & Meow cumple lo que promete.

## Restricciones

- **La cuenta no es una llave.** Estar dentro del panel no da acceso a ningún dato clínico: cada paciente exige un permiso de nivel 3 concedido por el dueño. La interfaz no puede sugerir lo contrario en ningún punto.
- **Nada de precios, planes ni facturación.** La monetización está sin decidir.
- **Sin clínicas de ejemplo con nombre real, sin métricas inventadas.** Los datos de demostración van etiquetados como tales.
- Escritorio primero, porque es un ordenador de mostrador, pero tiene que aguantar una tablet.

## Decisiones sin resolver

- **El estado ámbar** (conexión degradada, permiso a punto de caducar) no tiene color definido en el sistema. Es el mismo hueco que DESIGN.md registra para «no listo para viajar». Hay que resolverlo con el usuario.
- **Framework de `apps/clinic`.** PRODUCT.md lo deja abierto. Asumo Next por coherencia con `apps/vet` y con el monorepo; si se decide otra cosa, la composición no cambia.
- **El camino manual.** Es el riesgo declarado de esta dirección: la clínica sin software conectado no puede encontrarse un panel vacío. Necesita enviar un informe a mano como camino de primera clase, no como estado vacío de cortesía.
