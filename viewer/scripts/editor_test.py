"""Prueba del editor de muebles en planta (fase 4), con el dev server levantado.

Arrastra un mueble, lo gira con la manija (encaja a 90°) y con Q (+15°), borra otro con Supr, agrega uno
desde el catálogo y exporta el JSON. Deja una captura de la planta con la selección en shots/.
Chequea que el export tenga esos cambios (source "user", room recalculado, id nuevo), que el resto de la
casa no cambie, que la vista no se haya desplazado durante el arrastre y que el validador dé 0 errores.

Uso, desde viewer/:  python scripts/editor_test.py [--url http://localhost:5199] [--house public/house.json]
"""

import argparse
import json
import math
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
VISIBLE = {"existing", "new"}  # vista Reforma
DRAG = (-0.5, 0.0)  # metros en el plano
HANDLE_GAP = 0.35  # como en FurnitureEditor.tsx
ADD_KEY = "bench"


def catalog() -> dict[str, tuple[float, float]]:
    sys.path.insert(0, str(ROOT / "validator"))
    from catalog import load_catalog  # noqa: PLC0415

    return {k: (e.width, e.depth) for k, e in load_catalog().items()}


def footprint(item: dict, sizes: dict) -> list[tuple[float, float]]:
    """Igual que footprint() en src/geometry/furnitureEdit.ts."""
    w, d = sizes[item["catalog"]]
    s = item.get("scale") or 1
    hw, hd = w * s / 2, d * s / 2
    r = math.radians(item["rotation"])
    x, y = item["position"]
    return [(x + u * math.cos(r) - v * math.sin(r), y + u * math.sin(r) + v * math.cos(r))
            for u, v in ((-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd))]


def inside(p, poly) -> bool:
    hit = False
    for (xi, yi), (xj, yj) in zip(poly, poly[-1:] + poly[:-1]):
        if (yi > p[1]) != (yj > p[1]) and p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi:
            hit = not hit
    return hit


def area(poly) -> float:
    return abs(sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(poly, poly[1:] + poly[:1]))) / 2


def handle(item: dict, sizes: dict) -> tuple[float, float]:
    """Manija de rotación: sobre el frente, HANDLE_GAP más allá del borde (como handleOf en el editor)."""
    r = math.radians(item["rotation"])
    fx, fy = math.sin(r), -math.cos(r)
    x, y = item["position"]
    reach = max((px - x) * fx + (py - y) * fy for px, py in footprint(item, sizes))
    return x + fx * (reach + HANDLE_GAP), y + fy * (reach + HANDLE_GAP)


def hit(p, items, sizes) -> str | None:
    best = None
    for it in items:
        poly = footprint(it, sizes)
        if inside(p, poly) and (best is None or area(poly) < best[1]):
            best = (it["id"], area(poly))
    return best[0] if best else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:5199")
    ap.add_argument("--house", default="public/house.json")
    ap.add_argument("--out", default="shots")
    args = ap.parse_args()
    Path(args.out).mkdir(parents=True, exist_ok=True)

    house = json.loads(Path(args.house).read_text(encoding="utf-8"))
    sizes = catalog()
    items = [f for f in house["furniture"] if f["status"] in VISIBLE]
    failures: list[str] = []

    def check(ok: bool, msg: str) -> None:
        print(f"{'ok  ' if ok else 'FAIL'} {msg}")
        if not ok:
            failures.append(msg)

    with sync_playwright() as p, tempfile.TemporaryDirectory() as tmp:
        browser = p.chromium.launch(headless=True, args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        page = browser.new_page(viewport={"width": 1280, "height": 800}, accept_downloads=True)
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"{args.url}/?test=1&view=plan")
        page.wait_for_function("window.__viewer && window.__viewer.ready", timeout=120000)

        screen = lambda x, y: page.evaluate("([x, y]) => window.__planToScreen(x, y)", [x, y])  # noqa: E731

        def on_canvas(x, y) -> bool:
            sx, sy = screen(x, y)
            return page.evaluate("([x, y]) => document.elementFromPoint(x, y)?.tagName === 'CANVAS'", [sx, sy])

        # Candidatos: el clic en su centro los elige a ellos (no a otro encima) y cae sobre el canvas.
        clickable = [f for f in items if hit(f["position"], items, sizes) == f["id"] and on_canvas(*f["position"])]
        drag = max(clickable, key=lambda f: area(footprint(f, sizes)))
        gone = next(f for f in clickable if f["id"] != drag["id"] and f["catalog"] == "plant") if any(
            f["catalog"] == "plant" and f["id"] != drag["id"] for f in clickable) else clickable[0]
        print(f"arrastrar {drag['id']} ({drag['catalog']}), borrar {gone['id']} ({gone['catalog']})")

        # Mover: arrastre desde el centro
        anchor = screen(0, 0)
        x0, y0 = drag["position"]
        sx, sy = screen(x0, y0)
        ex, ey = screen(x0 + DRAG[0], y0 + DRAG[1])
        page.mouse.move(sx, sy)
        page.mouse.down()
        page.mouse.move(ex, ey, steps=10)
        page.mouse.up()
        page.wait_for_timeout(300)
        check(max(abs(a - b) for a, b in zip(anchor, screen(0, 0))) < 1, "la vista no se desplaza mientras se arrastra un mueble")
        check(drag["catalog"] in page.inner_text(".editor"), "el panel muestra el mueble seleccionado")

        # Girar con la manija hasta +x del plano (88° encaja en 90°), después Q (+15°)
        now = dict(drag, position=[x0 + DRAG[0], y0 + DRAG[1]])
        hx, hy = handle(now, sizes)
        cx, cy = now["position"]
        a = math.radians(88)
        tx, ty = cx + math.sin(a) * 1.5, cy - math.cos(a) * 1.5
        page.mouse.move(*screen(hx, hy))
        page.mouse.down()
        page.mouse.move(*screen(tx, ty), steps=10)
        page.mouse.up()
        page.wait_for_timeout(200)
        check("90°" in page.inner_text(".editor"), "la manija gira y encaja de a 15° (90°)")
        page.keyboard.press("q")
        page.wait_for_timeout(300)
        page.screenshot(path=str(Path(args.out) / "editor_seleccion.png"))

        # Borrar: clic y Supr
        page.mouse.click(*screen(*gone["position"]))
        page.wait_for_timeout(200)
        check(gone["catalog"] in page.inner_text(".editor"), f"clic selecciona {gone['id']}")
        page.keyboard.press("Delete")
        page.wait_for_timeout(200)

        # Agregar desde el catálogo
        page.select_option(".editor select", ADD_KEY)
        page.click(".editor-add button")
        page.wait_for_timeout(300)
        stats = page.evaluate("window.__viewer.stats")
        check(stats["furniture"] == len(items), f"stats.furniture = {stats['furniture']} (se borró uno y se agregó uno)")

        # Exportar
        check(page.get_attribute("button[data-dirty]", "data-dirty") == "true", "Exportar marca cambios pendientes")
        with page.expect_download() as dl:
            page.click("button[data-dirty]")
        out = Path(tmp) / "house.json"
        dl.value.save_as(out)
        page.wait_for_timeout(200)
        check(page.get_attribute("button[data-dirty]", "data-dirty") == "false", "después de exportar no quedan cambios pendientes")
        check(not errors, f"sin errores de página {errors}")
        browser.close()

        exported = json.loads(out.read_text(encoding="utf-8"))
        by_id = {f["id"]: f for f in exported["furniture"]}
        moved = by_id.get(drag["id"])
        check(moved is not None and all(abs(moved["position"][i] - (drag["position"][i] + DRAG[i])) < 0.05 for i in (0, 1)),
              f"{drag['id']} se movió {DRAG} (quedó en {moved and moved['position']})")
        check(moved is not None and moved["rotation"] == 105, f"{drag['id']} quedó a 105° = 90° de la manija + 15° de Q ({moved and moved['rotation']})")
        check(moved is not None and moved["source"] == "user", f"{drag['id']} tiene source user")
        check(gone["id"] not in by_id, f"{gone['id']} se borró")
        new_id = f"f{max(int(f['id'][1:]) for f in house['furniture'] if f['id'][1:].isdigit()) + 1}"
        added = by_id.get(new_id)
        check(added is not None and added["catalog"] == ADD_KEY and added["status"] == "new" and added["source"] == "user",
              f"se agregó {new_id} ({ADD_KEY}, new, user)")
        untouched = [f for f in house["furniture"] if f["id"] not in (drag["id"], gone["id"])]
        check(all(by_id.get(f["id"]) == f for f in untouched), "los demás muebles no cambian")
        check({k: v for k, v in exported.items() if k != "furniture"} == {k: v for k, v in house.items() if k != "furniture"},
              "el resto de la casa no cambia")

        res = subprocess.run([sys.executable, str(ROOT / "validator/validate_house.py"), str(out), "--out", str(Path(tmp) / "valid.json")],
                             capture_output=True, text=True, encoding="utf-8", errors="replace",
                             env={**os.environ, "PYTHONIOENCODING": "utf-8"})
        check(res.returncode == 0, f"el validador acepta el export (exit {res.returncode})")
        if res.returncode != 0:
            print(res.stdout[-2000:], res.stderr[-2000:])

    print("OK" if not failures else f"{len(failures)} fallas")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
