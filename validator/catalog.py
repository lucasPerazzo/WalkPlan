"""Catálogo de muebles: se lee de la tabla de furniture-catalog.md (el contrato)."""

import re
from dataclasses import dataclass
from pathlib import Path

CATALOG_PATH = (
    Path(__file__).resolve().parents[1]
    / ".claude" / "skills" / "house-schema" / "references" / "furniture-catalog.md"
)


@dataclass(frozen=True)
class CatalogEntry:
    key: str
    width: float  # x local
    depth: float  # z local
    height: float
    base: float = 0.0  # altura de montaje (kitchen_upper: "colgante, base a 1.50 m")
    collider: bool = True  # rug: "sin collider"


def parse_catalog(text: str) -> dict[str, CatalogEntry]:
    entries: dict[str, CatalogEntry] = {}
    for line in text.splitlines():
        if not line.lstrip().startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 4:
            continue
        try:
            width, depth, height = (float(c) for c in cells[1:4])
        except ValueError:
            continue  # encabezado y separador
        notes = cells[4] if len(cells) > 4 else ""
        base = re.search(r"base a (\d+(?:[.,]\d+)?) m", notes)
        entries[cells[0]] = CatalogEntry(
            key=cells[0],
            width=width,
            depth=depth,
            height=height,
            base=float(base.group(1).replace(",", ".")) if base else 0.0,
            collider="sin collider" not in notes,
        )
    return entries


def load_catalog(path: Path = CATALOG_PATH) -> dict[str, CatalogEntry]:
    return parse_catalog(path.read_text(encoding="utf-8"))
