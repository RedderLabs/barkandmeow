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

**THESIS:** El panel es el estado del tubo que une el software de la clínica con Bark & Meow, no un directorio de pacientes. Rechaza la tabla con buscador que envía cualquier SaaS clínico.

**OWN-WORLD:** El mundo de Bark & Meow sin tocar: papel hueso, hairline de 1px, cero sombras, verde solo en la acción, mono en todo dato. Reconocible con el contenido borrado por la fila de contadores monoespaciados sobre hueso.

**STORY:** La clínica entiende que su software ya habla con Bark & Meow, cree que lo que envía sale cifrado y fuera de su alcance, y actúa enviando el informe de la consulta o resolviendo lo que falló.

**FIRST VIEWPORT:** Cabecera con clínica y estado de conexión. Cuatro contadores en mono. Registro de envíos ocupando ocho columnas a la izquierda; permisos vigentes arriba a la derecha y, debajo, enviar informe en verde como única acción primaria.

**FORM:** Consola de conexión, índice 5 de 7 de mi lista, repartida como lead. Seed 5deb6c20, code-led.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Audiencia y trabajo

Personal de una clínica veterinaria: auxiliares y veterinarios, en un ordenador de mostrador, entre consulta y consulta. El trabajo es de dos tipos y el panel tiene que servir a los dos sin favorecer a uno: **enviar** el informe de una consulta a la ficha del dueño, y **vigilar** que lo que el software de gestión envía solo está llegando.

## Contenido y estado que la pantalla debe mostrar

- Estado de la conexión con el software de gestión, incluido el caso de que no haya ninguno conectado.
- Contadores del día: enviados, en cola, fallidos, permisos de nivel 3 vigentes.
- Registro cronológico de envíos: paciente, hora, estado de cifrado, destino, y el motivo cuando algo falla.
- Permisos vigentes y los que caducan pronto, porque un permiso caducado convierte un envío en un error.

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
