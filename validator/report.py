"""Reporte: errores (exit 1), warnings (exit 0) y correcciones aplicadas."""

import re
from dataclasses import asdict, dataclass, field


def id_key(element_id: str) -> list:
    """Orden natural de ids: w2 < w10."""
    return [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", element_id)]


@dataclass
class Issue:
    code: str  # identificador estable, ej. "opening_out_of_range"
    message: str
    ids: list[str] = field(default_factory=list)

    def line(self) -> str:
        ids = f"[{', '.join(self.ids)}] " if self.ids else ""
        return f"{ids}{self.code}: {self.message}"


@dataclass
class Report:
    errors: list[Issue] = field(default_factory=list)
    warnings: list[Issue] = field(default_factory=list)
    corrections: list[Issue] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors

    def to_dict(self) -> dict:
        return {
            "ok": self.ok,
            "counts": {
                "errors": len(self.errors),
                "warnings": len(self.warnings),
                "corrections": len(self.corrections),
            },
            "errors": [asdict(i) for i in self.errors],
            "warnings": [asdict(i) for i in self.warnings],
            "corrections": [asdict(i) for i in self.corrections],
        }

    def text(self) -> str:
        # Solo caracteres de cp1252: la consola de Windows redirigida no soporta más.
        out = []
        for title, items in (
            ("ERRORES", self.errors),
            ("WARNINGS", self.warnings),
            ("CORRECCIONES", self.corrections),
        ):
            out.append(f"{title} ({len(items)})")
            out.extend(f"  - {i.line()}" for i in items)
        return "\n".join(out)
