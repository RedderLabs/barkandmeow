import { HORIZONTAL, SIMBOLO } from "./logotipo.generated";

/* El logotipo de Bark & Meow, el mismo en todas las superficies.

   Fuente única: logos/bark_and_meow_logo_vector.svg. Se regenera con
   scripts/logotipo.py; nunca se redibuja a mano ni se sustituye por texto.

   El símbolo conserva sus colores de marca en cualquier tema. El texto va en
   trazos (no depende de que cargue Fraunces) y toma el color del tema:
   --logo-tinta para «Bark» y «Meow», --logo-acento para el «&». Por defecto
   son la tinta y el acento del sistema, así que claro y oscuro funcionan sin
   hacer nada, y un tema futuro solo tiene que redefinir esas dos variables. */

type Props = {
  /** horizontal: símbolo + «Bark & Meow». simbolo: solo la cabeza con la placa. */
  variante?: "horizontal" | "simbolo";
  /** Alto en px; el ancho sale de la proporción. */
  alto?: number;
  className?: string;
  /** Nombre accesible. Vacío si ya hay texto visible que nombra la marca. */
  titulo?: string;
};

export function Logotipo({ variante = "horizontal", alto = 44, className, titulo = "Bark & Meow" }: Props) {
  const d = variante === "horizontal" ? HORIZONTAL : SIMBOLO;
  const [, , ancho, altoCaja] = d.viewBox.split(" ").map(Number);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={d.viewBox}
      width={Math.round((alto * ancho) / altoCaja)}
      height={alto}
      className={className}
      role={titulo ? "img" : undefined}
      aria-label={titulo || undefined}
      aria-hidden={titulo ? undefined : true}
      focusable="false"
    >
      {/* Marcado estático generado desde el SVG del repositorio. */}
      <g dangerouslySetInnerHTML={{ __html: d.cuerpo }} />
      {variante === "horizontal" && (
        <>
          <path d={HORIZONTAL.tinta} fill="var(--logo-tinta, var(--ink))" />
          <path d={HORIZONTAL.acento} fill="var(--logo-acento, var(--accent))" />
        </>
      )}
    </svg>
  );
}
