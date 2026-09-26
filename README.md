# Bark & Meow

Ficha de salud portátil para mascotas. Cualquier veterinario, en cualquier país, ve la ficha actualizada en segundos, sin instalar nada y sin que el dueño pierda el control de los datos.

Los datos viven cifrados con la clave del dueño. **El servidor guarda bloques que no puede abrir.**

- Especificación: [`barkandmeow-arquitectura.md`](barkandmeow-arquitectura.md) — manda sobre el código
- Producto: [`PRODUCT.md`](PRODUCT.md) · Sistema visual: [`DESIGN.md`](DESIGN.md)
- Dominio: `barkandmeow.app`

## Estructura

```
apps/
  clinic/     SaaS de la clínica: consola, equipo, registro y presentación  (4510)
  vet/        Web del veterinario de guardia, sin cuentas, export estático  (3000)
  api/        Fastify: índice de chips, permisos, bloques cifrados          (4601)
  mobile/     App del dueño en React Native                    (sin crear)
packages/
  tokens/     Fuente única del sistema visual → CSS y TypeScript
  ui-web/     Cabecera, paneles, campos y botones compartidos por las webs
  i18n/       Catálogos en es, pt, en y fr
  spec/       OpenAPI público de la federación (CC BY 4.0)
  config/     tsconfig compartido
  schema/     Contratos Zod, catálogo de especies, identificadores
  db/         Esquema Drizzle y migraciones
  crypto/     Rust → WASM                                      (sin crear)
services/
  pepper/     HMAC del número de chip, aislado en su propio proceso         (4600)
infra/
  compose.yaml   postgres 5443 · dragonfly 6390 · pepper 4600
```

`apps/api` **no depende de `packages/crypto`**, y es deliberado: si alguien añade descifrado en el servidor, el grafo de dependencias lo delata en la revisión.

## Arrancar

```bash
pnpm install
docker compose -f infra/compose.yaml up -d postgres dragonfly
pnpm --filter @barkandmeow/db db:migrate
pnpm dev
```

## Comandos

| Comando | Qué hace |
| --- | --- |
| `pnpm dev` | Levanta los apps que tengan `dev` (turbo omite los que no) |
| `pnpm tokens` | Regenera el sistema visual desde `diseno/tokens.json` |
| `pnpm test` | Pruebas de integración de la API contra PostgreSQL |
| `pnpm typecheck` | `tsc --noEmit` en todo el workspace |
| `pnpm docs` | Regenera el .docx y el .pdf desde el markdown |

**El sistema visual no se edita en CSS.** Se edita `diseno/tokens.json` y se corre `pnpm tokens`, que reescribe `apps/clinic/app/tokens.generated.css` y el objeto TypeScript para la app nativa.

## Estado

Fase 2 del roadmap en curso. Lo que funciona hoy: el SaaS de la clínica con sus cuatro pantallas, la API con altas de nivel 3 y número de comparación, y el índice de chips protegido contra enumeración.

Las pantallas usan **datos de ejemplo etiquetados como tales**. No hay clínicas piloto, ni usuarios reales, ni métricas. Nada de eso puede aparecer en ninguna superficie como si existiera.

## Licencia

Código AGPL-3.0. La especificación de federación y el esquema clínico, CC BY 4.0.
