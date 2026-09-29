"""Genera el logotipo de Bark & Meow para todas las superficies.

Fuente única del símbolo: logos/bark_and_meow_logo_vector.svg (en la raíz).
El texto «Bark & Meow» se convierte a trazos con Fraunces (Bark y Meow en
redonda, el & en cursiva), como en logos/logo_horizontal_*.png. Así el
logotipo es un solo SVG que no depende de que cargue ninguna fuente, y el
color del texto sale de los tokens del tema (tinta y acento), de modo que
funciona en claro, en oscuro y en cualquier tema futuro.

Salidas:
  packages/ui-web/src/marca/logotipo.generated.ts   símbolo + texto en trazos
  apps/<app>/app/icon.svg                            favicon SVG de cada web

Uso (necesita fonttools, brotli y uharfbuzz; las fuentes son las de
@fontsource-variable/fraunces, carpeta files/):
  python packages/ui-web/scripts/logotipo.py --fuentes <carpeta con
      fraunces-latin-full-normal.woff2 y fraunces-latin-full-italic.woff2>
"""

from __future__ import annotations

import argparse
import io
import json
import re
from pathlib import Path

import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

RAIZ = Path(__file__).resolve().parents[3]
FUENTE_SIMBOLO = RAIZ / "logos" / "bark_and_meow_logo_vector.svg"
SALIDA_TS = RAIZ / "packages" / "ui-web" / "src" / "marca" / "logotipo.generated.ts"
APPS = ["vet", "clinic", "portal"]

# Proporciones medidas sobre logos/logo_horizontal_claro.png.
ALTURA_MAYUSCULA = 0.27  # altura de mayúscula del texto / alto del símbolo
SEPARACION = 0.07  # hueco símbolo–texto / alto del símbolo
CENTRO_CABEZA = 0.40  # la mayúscula se centra a esta altura del símbolo (desde arriba)
EJES = {"wght": 700, "opsz": 72, "SOFT": 0, "WONK": 0}
EJES_CURSIVA = {"wght": 600, "opsz": 72, "SOFT": 0}


def num(v: float) -> str:
    return f"{v:.2f}".rstrip("0").rstrip(".")


# ── Símbolo ─────────────────────────────────────────────────────


def leer_simbolo() -> tuple[str, tuple[float, float, float, float]]:
    """El marcado del símbolo sin título ni comentarios, y su caja real."""
    svg = FUENTE_SIMBOLO.read_text(encoding="utf-8")
    cuerpo = re.search(r"<svg[^>]*>(.*)</svg>", svg, re.S).group(1)
    cuerpo = re.sub(r"<title.*?</title>|<desc.*?</desc>|<!--.*?-->", "", cuerpo, flags=re.S)
    cuerpo = re.sub(r">\s+<", "><", cuerpo).strip()

    xs: list[float] = []
    ys: list[float] = []
    for d in re.findall(r' d="([^"]+)"', cuerpo):
        x = y = 0.0
        for cmd, args in re.findall(r"([MLHVCZ])([^MLHVCZ]*)", d):
            n = [float(v) for v in re.findall(r"-?\d+(?:\.\d+)?", args)]
            if cmd in "MLC":
                for i in range(0, len(n), 2):
                    x, y = n[i], n[i + 1]
                    xs.append(x)
                    ys.append(y)
            elif cmd == "H":
                for v in n:
                    x = v
                    xs.append(x)
                    ys.append(y)
            elif cmd == "V":
                for v in n:
                    y = v
                    xs.append(x)
                    ys.append(y)
    for cx, cy, r in re.findall(r'<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"', cuerpo):
        cx, cy, r = float(cx), float(cy), float(r)
        xs += [cx - r, cx + r]
        ys += [cy - r, cy + r]
    return cuerpo, (min(xs), min(ys), max(xs), max(ys))


# ── Texto en trazos ─────────────────────────────────────────────


class Tipo:
    def __init__(self, ruta: Path, ejes: dict[str, float]):
        fuente = TTFont(ruta)
        ejes = {k: v for k, v in ejes.items() if k in {a.axisTag for a in fuente["fvar"].axes}}
        self.fuente = instantiateVariableFont(fuente, ejes)
        self.fuente.flavor = None
        buf = io.BytesIO()
        self.fuente.save(buf)
        self.hb = hb.Font(hb.Face(buf.getvalue()))
        self.upm = self.fuente["head"].unitsPerEm
        self.mayuscula = self.fuente["OS/2"].sCapHeight
        self.glifos = self.fuente.getGlyphSet()
        self.orden = self.fuente.getGlyphOrder()

    def trazar(self, texto: str, x0: float, base: float, escala: float) -> tuple[str, float]:
        """Trazo SVG del texto con su cursor final, en coordenadas del logotipo."""
        buf = hb.Buffer()
        buf.add_str(texto)
        buf.guess_segment_properties()
        hb.shape(self.hb, buf, {"kern": True, "liga": True})
        pen = SVGPathPen(self.glifos, ntos=num)
        x = 0.0
        for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
            nombre = self.orden[info.codepoint]
            t = TransformPen(pen, (escala, 0, 0, -escala, x0 + (x + pos.x_offset) * escala, base))
            self.glifos[nombre].draw(t)
            x += pos.x_advance
        return pen.getCommands(), x0 + x * escala

    def avance(self, caracter: str) -> float:
        return self.glifos[self.fuente.getBestCmap()[ord(caracter)]].width


def componer(fuentes: Path) -> dict:
    simbolo, (sx0, sy0, sx1, sy1) = leer_simbolo()
    alto = sy1 - sy0
    redonda = Tipo(fuentes / "fraunces-latin-full-normal.woff2", EJES)
    cursiva = Tipo(fuentes / "fraunces-latin-full-italic.woff2", EJES_CURSIVA)

    escala = alto * ALTURA_MAYUSCULA / redonda.mayuscula
    base = sy0 + alto * CENTRO_CABEZA + alto * ALTURA_MAYUSCULA / 2
    espacio = redonda.avance(" ") * escala * 0.85

    x = sx1 + alto * SEPARACION
    bark, x = redonda.trazar("Bark", x, base, escala)
    amp, x = cursiva.trazar("&", x + espacio, base, escala)
    meow, x = redonda.trazar("Meow", x + espacio, base, escala)

    # Caja del texto: de la línea de base a la mayúscula, con margen para la
    # cola del &; el símbolo manda en altura.
    ancho = x - sx0
    return {
        "simbolo": {
            "viewBox": " ".join(num(v) for v in (sx0, sy0, sx1 - sx0, alto)),
            "cuerpo": simbolo,
        },
        "horizontal": {
            "viewBox": " ".join(num(v) for v in (sx0, sy0, ancho, alto)),
            "cuerpo": simbolo,
            "tinta": bark + meow,
            "acento": amp,
        },
    }


def escribir(datos: dict) -> None:
    SALIDA_TS.parent.mkdir(parents=True, exist_ok=True)
    SALIDA_TS.write_text(
        "// GENERADO por packages/ui-web/scripts/logotipo.py desde\n"
        "// logos/bark_and_meow_logo_vector.svg y Fraunces. No editar a mano.\n\n"
        f"export const SIMBOLO = {json.dumps(datos['simbolo'], ensure_ascii=False, indent=2)} as const;\n\n"
        f"export const HORIZONTAL = {json.dumps(datos['horizontal'], ensure_ascii=False, indent=2)} as const;\n",
        encoding="utf-8",
    )

    # Favicon: el símbolo en un cuadrado, con aire para que no toque el borde.
    x, y, w, h = (float(v) for v in datos["simbolo"]["viewBox"].split())
    lado = max(w, h) * 1.08
    cx, cy = x + w / 2, y + h / 2
    icono = (
        '<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="{num(cx - lado / 2)} {num(cy - lado / 2)} {num(lado)} {num(lado)}">'
        f"{datos['simbolo']['cuerpo']}</svg>\n"
    )
    for app in APPS:
        (RAIZ / "apps" / app / "app" / "icon.svg").write_text(icono, encoding="utf-8")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--fuentes", type=Path, required=True)
    escribir(componer(p.parse_args().fuentes))
    print(f"logotipo -> {SALIDA_TS.relative_to(RAIZ)} y apps/*/app/icon.svg")
