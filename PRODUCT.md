# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

Bark & Meow tiene tres superficies sobre dos familias de plataforma. `apps/mobile` es React Native bare para iOS y Android (el dueño). `apps/vet` y `apps/clinic` son web (el veterinario y la clínica). Cada una sigue las convenciones de su plataforma; el sistema de tokens es compartido.

## Users

- **El dueño de la mascota (custodio).** Tiene las claves y decide quién ve qué. Usa la app móvil. Situación típica: de viaje, en una urgencia, con prisa y a veces sin cobertura.
- **El veterinario de guardia, en otra ciudad o país.** No conoce al animal ni a Bark & Meow. Necesita alergias, medicación y antecedentes en segundos, en su idioma, sin instalar nada ni crear cuenta. Llega por QR, NFC o tecleando el número de chip.
- **El veterinario habitual.** Acceso permanente concedido por el dueño. Ve lo que pasó fuera y sube sus propios informes.
- **La clínica como organización** (decidido 2026-09-26). Cuenta, equipo y panel propio en el SaaS: gestiona sus pacientes con permiso de nivel 3 y conecta su software de gestión por API para enviar informes.
- **Quien encuentra al animal perdido.** Solo quiere contactar con el dueño. Llega por el QR o NFC de la placa.

## Product Purpose

Que cualquier veterinario, en cualquier país, vea la ficha de salud actualizada de una mascota en segundos, sin instalar nada y sin que el dueño pierda el control de los datos.

Hoy hay dos piezas y ninguna resuelve el problema: los registros de identificación (RIAC, REIAC, Europetnet) dicen quién es el dueño pero no si el animal es alérgico; el historial de la clínica habitual está completo pero encerrado en el software de esa clínica, y la copia en PDF se pierde, se desactualiza y está en un solo idioma.

Éxito: un veterinario ajeno abre la ficha en menos de 10 segundos (criterio de salida de la Fase 2 del roadmap).

## Positioning

Una ficha clínica que el servidor no puede leer. Los datos viven cifrados con la clave del dueño; el acceso se concede por objeto físico (placa QR/NFC) o por permiso explícito y caducable, nunca por tener una cuenta. Ningún registro de identificación ni software de clínica puede copiar esto sin renunciar a poseer los datos.

El segundo diferencial es la federación: Bark & Meow publica un protocolo abierto (OpenAPI y esquema JSON, CC BY 4.0) para que otras apps, registros y software de clínicas conecten sus chips. Una consulta llega a todas las plataformas conectadas. El dueño puede exportar su ficha completa e irse a otra plataforma.

## Operating Context

- **Urgencia en el extranjero, dueño presente:** el veterinario escanea la placa, ve el resumen en su idioma, el dueño eleva a nivel 2 con un QR temporal, el veterinario escribe la nota de la visita y esa nota vuelve cifrada al dueño.
- **Dueño ausente:** el veterinario lee el chip con su lector, introduce el número y solo obtiene "existe ficha" y un botón para avisar al dueño dejando clínica y teléfono.
- **Vuelta a casa:** el veterinario habitual ve la nota del extranjero y sube sus informes.
- **Hardware real:** microchip subcutáneo ISO 11784/11785 a 134,2 kHz (solo lo leen lectores veterinarios, nunca un móvil); placa de collar con QR impreso y NFC de 13,56 MHz (cualquier móvil); lectores Bluetooth que se comportan como teclado.
- **Condiciones adversas:** mala cobertura, idioma distinto, prisa clínica. La web del veterinario es estática, con objetivo por debajo de 300 KB.

## Capabilities and Constraints

**Niveles de acceso.** 0 Localizar (número de chip: solo "existe ficha" y avisar al dueño) · 1 Emergencia (placa QR/NFC, clave en el fragmento de la URL: alergias, crónicas, medicación, rabia, contacto) · 2 Historial (enlace temporal de 24 h, 72 h o 7 días, revocable) · 3 Veterinario habitual (permanente, revocable, puede subir informes).

**Criptografía.** Núcleo en Rust compilado a WASM, compartido por app y web. XChaCha20-Poly1305 simétrico, documentos en bloques de 1 MB. Par X25519 y Ed25519 del dueño en Keychain/Keystore. El fragmento `#` de la URL nunca llega al servidor. Las notas del veterinario van en sobre sellado X25519 a la clave pública del dueño: escribe pero no lee.

**El SaaS de clínicas no rompe lo anterior** (decidido 2026-09-26). La cuenta identifica a la organización y a su equipo; no es una llave a los datos. Cada paciente requiere permiso de nivel 3 del dueño, y lo que la clínica sube va cifrado a la clave pública del dueño. Bark & Meow almacena bloques que no puede abrir. `apps/api` no depende de `packages/crypto` a propósito: si alguien añade descifrado en el servidor, el grafo de dependencias lo delata en la revisión.

**Estructurado antes que texto libre,** para poder traducir y comparar entre países: ATCvet para principios activos, VeNom para diagnósticos, catálogo propio para especies y razas. Medicamentos siempre por principio activo, nunca por marca comercial. El texto libre se muestra en su idioma original con aviso; la traducción automática es opcional, marcada como tal, y se hace en el navegador del lector.

**Procedencia obligatoria.** Cada registro indica si lo declaró el dueño, si viene de un documento de clínica (con el original enlazado y su hash SHA-256) o si lo escribió un veterinario desde la web. No pesan igual y la interfaz no puede presentarlos igual.

**Protección del número de chip.** El servidor guarda `HMAC-SHA256(pepper, chip)`, con el pepper en un servicio aislado. Límite de consultas por IP, y respuestas de igual tamaño y tiempo exista o no la ficha, para que nadie pueda recorrer números.

**Sin conexión.** La app guarda la ficha completa en el móvil y tiene "modo veterinario": solo lectura, texto grande, selector de idioma. El resumen de emergencia puede ir comprimido dentro del propio QR (hasta unos 2 KB), sin cifrar, opcional y con el dueño eligiendo campos.

**Stack.** Monorepo pnpm y Turborepo. `apps/mobile` React Native bare · `apps/vet` Next.js con export estático · `apps/clinic` web, framework por decidir · `apps/api` Fastify · `packages/crypto` Rust a WASM · `packages/schema` tipos y catálogos con Zod · `packages/db` Drizzle. API en homelab con Docker Compose, PostgreSQL, DragonflyDB y Garage S3; web servida desde Cloudflare. Licencia AGPL-3.0; la especificación de federación, CC BY 4.0.

**Decisiones explícitamente abiertas, no inventar:**

- **Dominio: `barkandmeow.app`** (decidido 2026-09-26, ya en posesión del titular). Cierra la búsqueda de dominio; `hilo.fans` pertenece a otro producto. **Queda una tensión sin resolver:** el nombre del dominio habla de perros y gatos, y el catálogo de especies cubre además hurones, aves, conejos, roedores, reptiles, anfibios y peces ornamentales, que es justo lo que se amplió el mismo día. O el nombre de marca se separa del dominio, o hay que asumir que la marca promete menos de lo que el producto hace.
- **Monetización.** Sin decidir (2026-09-26). El SaaS de clínicas se construye sin cobro, planes ni facturación. No hay precios que mostrar y no deben inventarse.
- **Estado ámbar de "no listo para viajar".** La regla existe (lo contrario de "listo" es ámbar con texto, nunca rojo) pero el color no está definido en `diseno/tokens.json` ni aparece en ninguna pantalla.
- **`apps/clinic` y `apps/mobile` no existen todavía** como workspaces. `packages/crypto` es una carpeta vacía.

## Brand Commitments

- **Nombre: Bark & Meow.** En la interfaz aparece en Fraunces, en color `accent`.
- **Tres fuentes de licencia SIL OFL** (Fraunces, IBM Plex Sans, IBM Plex Mono), empaquetadas con la app y la web. **Prohibido cargar Google Fonts en producción.** Las pantallas del lienzo sí las cargan desde Google Fonts; eso es un artefacto del lienzo, no el objetivo.
- **Sin emojis en la interfaz.** Las banderas de país, cuando hagan falta, van como SVG.
- **Aviso de responsabilidad:** Bark & Meow es información aportada por el dueño, no un registro oficial. Debe quedar claro en la interfaz.

## Evidence on Hand

- `barkandmeow-arquitectura.md` — documento de arquitectura completo, 26/09/2026, aprobado. Fuente de verdad del producto.
- `diseno/tokens.json` — paleta clara y oscura, roles tipográficos, área táctil mínima de 44 px.
- `diseno/fuente-lienzo/*.dc.html` — las 7 pantallas con su CSS exacto. Verdad visual.
- `pantallas/*.png` — las mismas 7 pantallas en PNG a doble resolución.
- `barkandmeow-arquitectura.docx` y `pdf/` — el mismo documento en otros formatos.

**Los datos clínicos, nombres de clínicas y fechas de las pantallas son de ejemplo, y los campos entre corchetes son placeholders.** No hay clínicas piloto, ni usuarios reales, ni testimonios, ni métricas de uso. Nada de eso puede aparecer en ninguna superficie como si existiera.

## Product Principles

1. **El dueño es el custodio.** Los datos viven cifrados y el servidor no puede leerlos. Toda función nueva se diseña contra esta restricción, no alrededor de ella.
2. **Cero fricción para el veterinario de guardia.** Sin cuentas, sin instalación, en su idioma, en segundos. Una cuenta solo aparece donde hay una organización detrás (el SaaS de clínicas), y nunca como puerta a los datos.
3. **El número de chip localiza, nunca abre.** El acceso lo concede un objeto físico o un permiso explícito y caducable.
4. **Estructurado antes que texto libre,** para poder traducir y comparar entre países.
5. **El origen del dato siempre visible.** Lo que declara el dueño no pesa lo mismo que un informe firmado por una clínica, y la interfaz debe hacerlo evidente.
6. **Nadie queda atrapado.** Protocolo abierto, exportación completa y federación con otras plataformas.

## Accessibility & Inclusion

- **WCAG AA como mínimo** en toda pareja de texto y fondo (≥ 4,5:1). La mayoría de las parejas de la paleta superan AAA (≥ 7:1) y esa holgura es deliberada: la interfaz se usa con prisa y con mala luz.
- **Área táctil mínima de 44 × 44 px** en todo control.
- **El significado nunca depende solo del color.** Cada estado lleva icono y texto ("NIVEL 1", "Declarado por el dueño").
- **Verde y rojo no se usan como pareja de estados.** Lo contrario de "listo" es ámbar con texto.
- **Multilingüe por diseño.** La web del veterinario se abre en el idioma de su navegador; es la primera cosa que ve. Idiomas de partida: es, pt, en, fr.
- Modo claro y oscuro; la web del veterinario sigue el modo del sistema operativo.
