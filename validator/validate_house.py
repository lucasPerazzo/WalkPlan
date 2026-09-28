"""Valida y corrige un house.json (schema v3, ver skill house-schema).

Uso:
  python validator/validate_house.py <in.json> --out <out.json> [--grid 0.05] [--merge-tol 0.10]
      [--preview <plano.png> --preview-out <overlay.png>]

Errores -> exit 1 y NO se escribe --out (el visor nunca recibe un JSON inválido).
Warnings -> exit 0. El reporte se escribe siempre en report.json, junto a --out.
"""

import argparse
import json
import sys
from pathlib import Path

from pydantic import ValidationError

import checks
import corrections
from catalog import CatalogEntry, load_catalog
from model import House
from report import Issue, Report


def _location(raw: object, loc: tuple) -> tuple[str, str | None]:
    """Ruta legible de un error de pydantic ("walls[3].thickness") y el id del elemento, si lo hay."""
    path, node, element_id = "", raw, None
    for part in loc:
        path += f"[{part}]" if isinstance(part, int) else (f".{part}" if path else str(part))
        try:
            node = node[part]  # type: ignore[index]
        except (KeyError, IndexError, TypeError):
            node = None
        if isinstance(node, dict) and isinstance(node.get("id"), str):
            element_id = node["id"]
    return path, element_id


def parse(raw: dict, report: Report) -> House | None:
    try:
        return House.model_validate(raw)
    except ValidationError as exc:
        for err in exc.errors():
            path, element_id = _location(raw, err["loc"])
            report.errors.append(Issue("schema", f"{path}: {err['msg']}", [element_id] if element_id else []))
        return None


def validate(
    raw: object, catalog: dict[str, CatalogEntry], grid: float = 0.05, merge_tol: float = 0.10
) -> tuple[House | None, Report]:
    report = Report()
    if not isinstance(raw, dict):
        report.errors.append(Issue("schema", "el JSON no es un objeto"))
        return None, report

    raw, fixes = corrections.migrate_v1(raw)
    report.corrections += fixes
    raw, fixes = corrections.migrate_v2(raw)
    report.corrections += fixes
    raw, fixes = corrections.fill_wall_heights(raw)
    report.corrections += fixes
    house = parse(raw, report)
    if house is None:
        return None, report

    house, fixes = corrections.merge_endpoints(house, merge_tol)
    report.corrections += fixes
    house, fixes = corrections.snap_to_grid(house, grid)
    report.corrections += fixes
    house, fixes = corrections.remove_short_walls(house)
    report.corrections += fixes
    house, fixes, errors = corrections.split_t_junctions(house, merge_tol)
    report.corrections += fixes
    report.errors += errors
    house, fixes = corrections.normalize_polygons(house)
    report.corrections += fixes

    for check in checks.ERRORS:
        report.errors += check(house)
    for check in checks.CATALOG_ERRORS:
        report.errors += check(house, catalog)
    for check in checks.WARNINGS:
        report.warnings += check(house)
    for check in checks.CATALOG_WARNINGS:
        report.warnings += check(house, catalog)
    return house, report


def dump_house(house: House) -> str:
    return json.dumps(house.model_dump(mode="json", exclude_none=True), indent=2, ensure_ascii=False) + "\n"


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="replace")  # consola de Windows redirigida
    ap = argparse.ArgumentParser(description="Valida y corrige un house.json (schema v3).")
    ap.add_argument("input", type=Path)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--grid", type=float, default=0.05, help="grilla de snap en metros (0 = sin snap)")
    ap.add_argument("--merge-tol", type=float, default=0.10, help="distancia máxima para unir extremos")
    ap.add_argument("--preview", type=Path, help="imagen de la lámina (requiere meta.image_calibration)")
    ap.add_argument("--preview-out", type=Path)
    args = ap.parse_args(argv)
    if (args.preview is None) != (args.preview_out is None):
        ap.error("--preview y --preview-out van juntos")

    catalog = load_catalog()
    report_path = args.out.with_name("report.json")
    try:
        raw = json.loads(args.input.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        house, report = None, Report(errors=[Issue("read_error", f"no se pudo leer {args.input}: {exc}")])
    else:
        house, report = validate(raw, catalog, args.grid, args.merge_tol)

    written = house is not None and report.ok
    if written:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(dump_house(house), encoding="utf-8")

    preview_note = None
    if args.preview and house is not None:
        from preview import PreviewError, render_preview  # matplotlib solo si hace falta

        try:
            render_preview(house, catalog, args.preview, args.preview_out)
            preview_note = f"Preview: {args.preview_out}"
        except PreviewError as exc:
            preview_note = f"Preview no generado: {exc}"

    data = {"input": str(args.input), "output": str(args.out) if written else None, **report.to_dict()}
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"validate_house: {args.input} -> {args.out}\n")
    print(report.text())
    print()
    if preview_note:
        print(preview_note)
    print(f"OK: se escribió {args.out}" if written else f"CON ERRORES: no se escribió {args.out}")
    print(f"Reporte: {report_path}")
    return 0 if written else 1


if __name__ == "__main__":
    sys.exit(main())
