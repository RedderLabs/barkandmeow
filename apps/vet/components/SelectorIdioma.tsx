"use client";

import { IDIOMAS, type Idioma } from "@barkandmeow/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@barkandmeow/ui-web/components/select";

/* Código de idioma en mono, 44px: la única navegación de la web del
   veterinario, siempre arriba a la derecha. */
export function SelectorIdioma({
  idioma,
  onCambio,
  etiqueta,
}: {
  idioma: Idioma;
  onCambio: (i: Idioma) => void;
  etiqueta: string;
}) {
  return (
    <Select value={idioma} onValueChange={(v) => onCambio(v as Idioma)}>
      <SelectTrigger size="sm" aria-label={etiqueta} className="shrink-0 font-mono text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end" className="min-w-[5.5rem]">
        {IDIOMAS.map((i) => (
          <SelectItem key={i} value={i} className="font-mono text-sm">
            {i.toUpperCase()}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
