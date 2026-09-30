# Conector del software de gestión

Lee vacunas y consultas del programa de gestión de la clínica (ezyVet, Provet Cloud o QVET) y las envía a la bandeja del dueño en Bark & Meow, **firmadas por la clínica y selladas para el dueño**.

## Dónde corre y por qué

Corre **en la clínica**: en su servidor o en un PC de recepción que esté encendido. Allí tiene las tres cosas que necesita:

- las credenciales del programa de gestión, con las que lee las fichas en claro;
- la clave de API de Bark & Meow (`bmk_…`);
- la clave de firma de la conexión (`bmf_…`), que nació en el navegador del administrador y nunca ha pasado por Bark & Meow.

Cada registro se firma con Ed25519 y se sella con `crypto_box_seal` para la clave pública del dueño **antes de salir de la clínica**. A la API solo llegan bytes sellados que no puede abrir. Es el mismo camino que `apps/api/scripts/enviar-registro.ts`, el script de referencia, convertido en un servicio.

## MODO_ALOJADO (apagado)

Si algún día Bark & Meow ejecutara el conector en sus servidores en nombre de una clínica, tendría a la vez el acceso a las fichas en claro y la clave de firma de la clínica. **El cifrado de extremo a extremo dejaría de serlo**: el operador del servicio podría leer los datos y firmar registros en nombre de la clínica.

Por eso existe la bandera `MODO_ALOJADO`. Está apagada y el conector no arranca con ella encendida salvo que se den las tres condiciones:

1. `MODO_ALOJADO=si`;
2. `MODO_ALOJADO_ROMPE_E2E=entendido`;
3. `CONSENTIMIENTO_ALOJADO`: la ruta al **consentimiento escrito y firmado por la clínica**, que tiene que existir.

Aun así, avisa en cada vuelta. No hay ningún plan de alojarlo: la bandera existe para que nadie lo haga por descuido.

## Puesta en marcha

```sh
cp .env.example .env        # rellenar BM_API_KEY, BM_FIRMA y la fuente
pnpm --filter @barkandmeow/conector start      # cada CONECTOR_INTERVALO_MIN minutos (15)
pnpm --filter @barkandmeow/conector una-vez    # una vuelta y termina (Programador de tareas de Windows, cron)
```

La clave de API y la de firma se crean en la consola de la clínica, en «Conexión del software de gestión». Al arrancar, el conector comprueba la clave con `GET /clinics/v1/api/me`.

## Qué envía y a quién

Solo a los pacientes cuyo dueño dio el **nivel 3** a la clínica: por cada chip, `POST /clinics/v1/api/patients/search`. Si la respuesta es 404 (chip desconocido o sin permiso, la API no dice cuál), el registro se salta y queda en el log con la referencia de origen y los 4 últimos dígitos del chip. No se reintenta: si el dueño da el permiso más tarde, lo anterior no le llega.

| Del programa | A Bark & Meow |
|---|---|
| Vacuna con fecha de revacunación, o con una regla de validez | `vacuna`, que el pasaporte cuenta como certificado |
| Vacuna sin fecha de revacunación ni regla | `informe` («Vacunación: …»), solo como constancia |
| Consulta con motivo, diagnóstico, tratamiento o notas | `informe` |

Si un registro no cabe en los 16 KiB del sobre firmado, se acortan primero las observaciones y después el tratamiento.

### Estado y repeticiones

El estado vive en `CONECTOR_ESTADO` (`./estado-conector.json`): el cursor de cada fuente y la huella SHA-256 de cada registro enviado. No guarda contenido clínico. Un registro con la misma huella no se vuelve a enviar. Si un registro cambia en el programa, cambia su huella y se envía la versión nueva: el dueño verá las dos.

El cursor solo avanza si la vuelta termina sin fallos de red ni de la API. Si falla, la vuelta siguiente relee desde el mismo punto y las huellas evitan duplicar lo que sí salió. El estado se guarda después de cada envío.

### Reglas (`CONECTOR_REGLAS`)

Es un JSON como `reglas.ejemplo.json`:

- `validez`: meses de validez por producto (una expresión regular sobre el nombre del producto o de la enfermedad). Solo se aplica cuando el programa no da la fecha de revacunación. **Lo decide la clínica con la ficha técnica y la normativa del país.** Lo que se firma es un certificado, así que el conector no se inventa plazos. Los números del ejemplo son de muestra y hay que comprobarlos.
- `qvet`: separador, codificación y nombres de columna propios.

## Fuentes

### ezyVet

Documentación oficial: <https://developers.ezyvet.com> (referencia OpenAPI en la propia página), filtros: <https://developers.ezyvet.com/guides/api-filtering.html>.

- Token: `POST {EZYVET_URL}/v1/oauth/access_token` con `partner_id`, `client_id`, `client_secret`, `grant_type=client_credentials`, `scope` y, opcionalmente, `site_uid`. Dura 12 h y el conector lo renueva a las 11 h, o antes si recibe un 401.
- Listas `{"meta": {"items_page_total"…}, "items": [{"<recurso>": {…}}]}` de hasta 200 elementos (`limit=200&page=N`). Filtros `campo={"gt":…}` en JSON.
- Límites: unas 60 llamadas por minuto por endpoint y 180 por base de datos. Ante un 429, el conector espera lo que indique `retry-after` o `x-ratelimit-reset`.
- Lee:
  - `/v1/vaccination` modificadas desde la última vuelta. Van al animal por `consult_id` → `/v1/consult` → `animal_id` → `/v1/animal.microchip_number`, y el nombre del producto sale de `/v1/product`.
  - `/v1/consult` cuya `date` quedó atrás hace más de `EZYVET_ESPERA_HORAS` horas (24). ezyVet no marca una consulta como cerrada, así que se espera a que deje de editarse. `description` va como motivo y los `comments` de `/v1/history` como observaciones.

**No verificado contra una cuenta real:**

- el formato exacto de `scope` (el conector usa scopes separados por comas; la documentación solo dice que hay que pedir todos los de la integración);
- que `date` de la consulta sea epoch, como el resto de fechas;
- que `active` llegue como `"1"`/`"0"`;
- que `/v1/history` admita `consult_id={"in":[…]}`;
- el significado de `expires_in`: la documentación dice que va en epoch y su ejemplo, 1209600, no cuadra con 12 horas.

La vacunación de ezyVet no tiene campo de lote, así que el lote va vacío. No se leen los nombres de los veterinarios (`vet_id`).

### Provet Cloud

Documentación oficial: <https://developers.provetcloud.com/restapi/>. La esquema OpenAPI 0.1 está en <https://developers.provetcloud.com/restapi/0.1/openapi-schema-01.json> y de ahí salen los campos y filtros. Además: [OAuth 2.0](https://developers.provetcloud.com/restapi/authentication_oauth2.html), [filtros](https://developers.provetcloud.com/restapi/filtering.html), [paginación](https://developers.provetcloud.com/restapi/pagination.html) y [consultas](https://developers.provetcloud.com/restapi/howto_consultations.html).

- Token: OAuth 2.0 `client_credentials` en `{PROVET_URL}/oauth2/token/` con `scope=restapi`, y después `Authorization: Bearer …`. El token de API antiguo (`Authorization: Token …`) está retirado por Provet; `PROVET_TOKEN` queda solo para instalaciones que aún lo tengan.
- Paginación `{count, next, previous, results}`: el conector sigue `next`. Filtros `campo__gt=AAAA-MM-DD hh:mm+00:00`.
- Lee:
  - vacunas: `/consultation_items/medicine/?vaccination__is=true` modificadas desde la última vuelta, con `name`, `batch_number` (lote), `vaccination_disease`, `used` y `patient`, y de ahí `/patient/{id}/.microchip`. Provet no guarda la fecha de revacunación en la línea de la vacuna: la pone una regla de validez o la vacuna viaja como informe;
  - consultas con `ended` desde la última vuelta, una por paciente: `complaint` como motivo, `/consultation/{id}/consultationdiagnosis/` como diagnóstico, `/consultation/{id}/consultationnote/` como observaciones y las medicinas que no son vacunas como tratamiento.

**No verificado contra una cuenta real:**

- el formato de los filtros booleanos (`vaccination__is=true`);
- el campo de texto de las notas en la respuesta de lista (la guía usa `text` y la esquema de `Note` usa `note`; el conector acepta los dos);
- que `ended` esté relleno en todas las consultas cerradas.

### QVET

QVET no tiene API pública. El conector vigila una carpeta (`QVET_CARPETA`) donde la clínica guarda los listados exportados de QVET (vacunas administradas, consultas) en **CSV**:

- qué es cada archivo lo dicen sus columnas: con columna de vacuna, es de vacunas; si no, de consultas;
- las columnas se reconocen sin tildes ni mayúsculas (`Fecha`, `Nº Chip`/`Microchip`, `Vacuna`/`Producto`, `Lote`, `Próxima vacunación`, `Veterinario`, `Motivo`, `Diagnóstico`, `Tratamiento`, `Observaciones`…), y se pueden añadir otras en `reglas.qvet.columnas`;
- el separador se adivina (`;` en Excel en español) y la codificación también (UTF-8 o Windows-1252);
- un archivo se lee cuando lleva un minuto sin cambiar. Al terminar la vuelta pasa a `procesados/`, o a `errores/` si no tiene columnas de fecha y chip;
- un `.xlsx` no se lee: se avisa para que se guarde como «CSV (delimitado por punto y coma)».

**Por qué no la base de datos de QVET:** es SQL Server y se podría leer en solo lectura, pero su estructura no está publicada, cambia con las actualizaciones y acceder a ella puede chocar con el contrato de soporte de QVET. La exportación funciona con cualquier versión y no toca nada.

**No verificado contra QVET real:** los nombres de columna de sus exportaciones ni si QVET puede programar la exportación automática a una carpeta. Si no puede, alguien de la clínica la exporta a mano (por ejemplo, a diario).

## Pruebas

```sh
pnpm --filter @barkandmeow/conector test
pnpm --filter @barkandmeow/conector typecheck
```

- `test/ezyvet.test.ts` y `test/provet.test.ts`: cada adaptador contra un servidor falso con las formas de la documentación (token, paginación, filtros, 401, 429).
- `test/qvet.test.ts`: CSV en Windows-1252 con comillas y saltos de línea, carpeta, archivos a medio escribir, `procesados` y `errores`.
- `test/extremo.test.ts`: contra una API de Bark & Meow falsa por HTTP. El test hace de dueño, abre el sellado con su clave secreta, comprueba la firma Ed25519 de la conexión, que no se repite nada y que el cursor no avanza si la API falla. También cubre `MODO_ALOJADO`.
