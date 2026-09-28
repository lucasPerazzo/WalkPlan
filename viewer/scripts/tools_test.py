"""Prueba de las herramientas de la fase 6, con el dev server levantado.

- Selector Actual / Reforma / Cambios: cuenta de elementos y de cambios contra el JSON.
- Medición en planta: una cota de cara a cara de muro (clics a 5 cm de cada cara) da el ancho del
  ambiente, o sea que los extremos se engancharon.
- Medición en primera persona: M frente a un muro ciego, desplazarse de costado ~1 m (D) y M otra vez:
  la distancia es lo que se movió.
- Dudas del plano: abrir el panel y elegir una con elemento lleva a la planta con ese elemento resaltado.
Deja capturas en shots/: herramientas_cota.png, herramientas_dudas.png.

Uso, desde viewer/:  python scripts/tools_test.py [--url http://localhost:5199] [--house public/house.json]
"""

import argparse
import json
import math
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from shots import inside, visible  # noqa: E402

VIEWPORT = {"width": 1280, "height": 800}


def expected_changes(house: dict) -> dict:
    act = visible(house, "actual")
    ref = visible(house, "reforma")
    return {
        "newWalls": sum(w["status"] == "new" for w in ref["walls"]),
        "newOpenings": sum(o["status"] == "new" for o in ref["openings"]),
        "demolishWalls": sum(w["status"] == "demolish" for w in act["walls"]),
        "demolishOpenings": sum(o["status"] == "demolish" for o in act["openings"]),
    }


def box_room(house: dict):
    """Un ambiente rectangular con eje x, para medir su ancho de cara a cara."""
    for r in visible(house, "reforma")["rooms"]:
        poly = r["polygon"]
        xs = sorted({round(p[0], 3) for p in poly})
        ys = sorted({round(p[1], 3) for p in poly})
        if len(poly) == 4 and len(xs) == 2 and len(ys) == 2 and 1.2 < xs[1] - xs[0] < 5 and ys[1] - ys[0] > 1.5:
            return r, xs, ys
    return None


def blind_wall(house: dict, clear: float = 1.3):
    """Punto de fachada con `clear` metros de muro ciego a cada lado: punto y normal hacia afuera.
    Los muros vienen partidos en cada encuentro en T: se juntan los tramos colineales de la misma línea."""
    v = visible(house, "reforma")
    ext = [w for w in v["walls"] if w["kind"] == "exterior"]
    for w in ext:
        (x0, y0), (x1, y1) = w["start"], w["end"]
        L = math.hypot(x1 - x0, y1 - y0)
        dx, dy = (x1 - x0) / L, (y1 - y0) / L
        on_line = lambda p: abs((p[0] - x0) * dy - (p[1] - y0) * dx) < 1e-3  # noqa: E731
        t = lambda p: (p[0] - x0) * dx + (p[1] - y0) * dy  # noqa: E731
        line = [x for x in ext if on_line(x["start"]) and on_line(x["end"])]
        spans = sorted((min(t(x["start"]), t(x["end"])), max(t(x["start"]), t(x["end"]))) for x in line)
        holes = []
        for x in line:
            sx = 1 if t(x["end"]) >= t(x["start"]) else -1
            for o in v["openings"]:
                if o["wall"] == x["id"]:
                    a = t(x["start"]) + sx * o["offset"]
                    b = t(x["start"]) + sx * (o["offset"] + o["width"])
                    holes.append((min(a, b), max(a, b)))
        # Tramos continuos de la línea y, dentro de ellos, un centro con `clear` libre a cada lado.
        runs, (a0, b0) = [], spans[0]
        for a, b in spans[1:]:
            if a <= b0 + 1e-3:
                b0 = max(b0, b)
            else:
                runs.append((a0, b0))
                a0, b0 = a, b
        runs.append((a0, b0))
        for a, b in runs:
            u = a + clear
            while u <= b - clear:
                if not any(h0 < u + clear and h1 > u - clear for h0, h1 in holes):
                    c = (x0 + dx * u, y0 + dy * u)
                    n = (dy, -dx)
                    if inside((c[0] + n[0] * 0.5, c[1] + n[1] * 0.5), v["walls"]):
                        n = (-n[0], -n[1])
                    return c, n
                u += 0.25
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:5199")
    ap.add_argument("--house", default="public/house.json")
    ap.add_argument("--out", default="shots")
    args = ap.parse_args()
    house = json.loads(Path(args.house).read_text(encoding="utf-8"))
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    failures: list[str] = []

    def check(ok: bool, msg: str) -> None:
        print(f"{'ok  ' if ok else 'FAIL'} {msg}")
        if not ok:
            failures.append(msg)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])

        def open_page(query: str):
            page = browser.new_page(viewport=VIEWPORT)
            errors: list[str] = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(f"{args.url}/?test=1&{query}")
            page.wait_for_function("window.__viewer && window.__viewer.ready", timeout=120000)
            return page, errors

        probe = lambda page: page.evaluate("window.__viewer")  # noqa: E731

        def frames(page, n: int = 3) -> None:
            """Espera n cuadros dibujados: lo que se montó recién recibe clics después de un render."""
            page.evaluate("n => new Promise(r => { const f = k => k ? requestAnimationFrame(() => f(k - 1)) : r(); f(n); })", n)

        # --- Actual / Reforma / Cambios
        page, errors = open_page("view=plan")
        page.click("nav[aria-label='Proyecto'] >> text=Cambios")
        page.wait_for_timeout(800)
        pr = probe(page)
        exp = expected_changes(house)
        got = {k: (pr.get("changes") or {}).get(k) for k in exp}
        check(pr.get("mode") == "diff" and got == exp, f"Cambios: {got} (JSON: {exp})")
        page.click("nav[aria-label='Proyecto'] >> text=Actual")
        page.wait_for_timeout(800)
        pr = probe(page)
        n_actual = len(visible(house, "actual")["walls"])
        check(pr.get("mode") == "actual" and pr["stats"]["walls"] == n_actual, f"Actual: {pr['stats']['walls']} muros (JSON: {n_actual})")
        page.click("nav[aria-label='Proyecto'] >> text=Reforma")
        page.wait_for_timeout(800)

        # --- Medición en planta
        room = box_room(house)
        if not room:
            check(False, "no hay un ambiente rectangular para medir")
        else:
            r, xs, ys = room
            width = xs[1] - xs[0]
            screen = lambda x, y: page.evaluate("([x, y]) => window.__planToScreen(x, y)", [x, y])  # noqa: E731
            page.keyboard.press("m")
            page.wait_for_selector("text=Clic en dos puntos", timeout=20000)  # herramienta activa
            frames(page)
            best = None
            # Varias alturas del ambiente: donde hay una ventana el corte de planta no tiene muro que enganchar.
            for f in (0.5, 0.3, 0.7, 0.15, 0.85, 0.08, 0.92):
                y = ys[0] + (ys[1] - ys[0]) * f
                n = len(probe(page)["measure"]["plan"])
                page.mouse.click(*screen(xs[0] + 0.05, y))
                frames(page, 2)
                page.mouse.click(*screen(xs[1] - 0.05, y))
                page.wait_for_function(f"window.__viewer.measure.plan.length > {n}", timeout=20000)
                d = probe(page)["measure"]["plan"][-1]
                best = d if best is None or abs(d - width) < abs(best - width) else best
                if abs(d - width) < 0.02:
                    break
            check(best is not None and abs(best - width) < 0.02,
                  f"cota en {r['id']} ({r['name']}): {best} m, ancho {width:.3f} m (sin enganche daría {width - 0.1:.3f})")
            page.screenshot(path=str(out / "herramientas_cota.png"))
        check(not errors, f"sin errores de página {errors}")
        page.close()

        # --- Medición en primera persona
        wall = blind_wall(house)
        if not wall:
            check(False, "no hay un muro ciego para medir en primera persona")
        else:
            (cx, cy), (nx, ny) = wall
            px, py = cx + nx * 3, cy + ny * 3
            yaw = math.degrees(math.atan2(-ny, -nx))
            page, errors = open_page(f"view=fps&x={px:.2f}&y={py:.2f}&yaw={yaw:.0f}")
            page.keyboard.press("m")
            page.wait_for_function("window.__viewer.measure.marks === 1", timeout=20000)
            a = probe(page)["player"]
            # Se suelta la D a los 0.3 m: con cuadros lentos se pasa algo, y el tramo ciego tiene 1.3 m libres.
            page.keyboard.down("d")
            page.wait_for_function(f"(p => Math.hypot(p.x - {a['x']}, p.y - {a['y']}) > 0.3)(window.__viewer.player)", timeout=60000, polling=50)
            page.keyboard.up("d")
            # Quieto: sin moverse durante medio segundo de tiempo simulado (con render por software dos
            # lecturas separadas por tiempo real pueden caer en el mismo cuadro).
            for _ in range(20):
                p1 = probe(page)["player"]
                page.wait_for_function(f"window.__viewer.player.t >= {p1['t'] + 0.5}", timeout=30000, polling=50)
                b = probe(page)["player"]
                if math.hypot(b["x"] - p1["x"], b["y"] - p1["y"]) < 1e-3:
                    break
            page.keyboard.press("m")
            page.wait_for_function("window.__viewer.measure.fps !== null", timeout=20000)
            moved = math.hypot(b["x"] - a["x"], b["y"] - a["y"])
            d = probe(page)["measure"]["fps"]
            check(d is not None and abs(d - moved) < 0.08, f"primera persona: {d} m medidos, {moved:.3f} m recorridos de costado")
            check(not errors, f"sin errores de página {errors}")
            page.close()

        # --- Dudas del plano
        page, errors = open_page("view=fps")
        pr = probe(page)
        total = len(house["meta"].get("uncertainties", []))
        check(pr["uncertainties"]["total"] == total, f"panel con {pr['uncertainties']['total']} dudas (JSON: {total})")
        page.click(".doubts-head")
        page.wait_for_timeout(300)
        first = page.locator("button.doubt:not([disabled])").first
        label = first.locator(".doubt-target").inner_text()
        first.click()
        page.wait_for_timeout(2500)
        pr = probe(page)
        focused = pr["uncertainties"]["focused"]
        check(focused is not None and focused in label, f"la duda '{label.splitlines()[0]}' resalta {focused}")
        check(page.get_attribute("nav[aria-label='Vista'] >> text=Planta", "aria-pressed") == "true", "lleva a la planta")
        page.screenshot(path=str(out / "herramientas_dudas.png"))
        check(not errors, f"sin errores de página {errors}")
        page.close()
        browser.close()

    print("OK" if not failures else f"{len(failures)} fallas")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
