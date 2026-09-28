"""Prueba de marcha en primera persona: paredes y puertas cerradas frenan; una puerta abierta deja pasar.

Uso (server levantado): python scripts/walk_test.py [--url http://localhost:5199] [--house public/house.json]
Toma la puerta de llegada que informa el visor (__viewer.spawnDoor) y camina hacia ella con W.
"""

import argparse
import json
import math
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from shots import door_geometry, inside, visible  # noqa: E402

SIM_SECONDS = 3.0  # se mide en tiempo simulado: el render por software congela cuadros sueltos


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:5199")
    ap.add_argument("--house", default="public/house.json")
    args = ap.parse_args()
    house = json.loads(Path(args.house).read_text(encoding="utf-8"))
    v = visible(house, "reforma")
    walls = {w["id"]: w for w in v["walls"]}
    failed = False

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])

        def walk(query, keys_before=()):
            page = browser.new_page(viewport={"width": 800, "height": 500})
            page.goto(f"{args.url}/?test=1&{query}")
            page.wait_for_function("window.__viewer && window.__viewer.ready", timeout=90000)
            for k in keys_before:
                page.keyboard.press(k)
                page.wait_for_timeout(600)
            start = page.evaluate("window.__viewer.player")
            page.keyboard.down("w")
            # La velocidad se mide desde que arranca: con render por software la tecla tarda uno o dos cuadros
            # (hasta ~0.7 s simulados) en llegar, y ese tiempo quieto bajaría el promedio.
            page.wait_for_function(
                f"(p => Math.hypot(p.x - {start['x']}, p.y - {start['y']}) > 0.05 || p.t - {start['t']} >= {SIM_SECONDS})"
                "(window.__viewer.player)", timeout=60000, polling=50)
            start = page.evaluate("window.__viewer.player")
            page.wait_for_function(f"window.__viewer.player.t - {start['t']} >= {SIM_SECONDS}", timeout=60000, polling=50)
            # Leer antes de soltar W: después, el tiempo simulado sigue corriendo con el jugador ya parado
            # (con render por software un cuadro puede durar medio segundo) y la velocidad sale subestimada.
            end = page.evaluate("window.__viewer.player")
            page.keyboard.up("w")
            spawn_door = page.evaluate("window.__viewer.spawnDoor")
            page.close()
            return start, end, spawn_door

        # Puerta de llegada: geometría y normal exterior.
        _, _, door_id = walk("view=fps")
        o = next(o for o in v["openings"] if o["id"] == door_id)
        (cx, cy), (nx, ny) = door_geometry(o, walls)
        if inside((cx + nx * 0.5, cy + ny * 0.5), v["walls"]):
            nx, ny = -nx, -ny
        px, py = cx + nx * 1.2, cy + ny * 1.2
        yaw = math.degrees(math.atan2(-ny, -nx))
        q = f"view=fps&x={px:.2f}&y={py:.2f}&yaw={yaw:.0f}"

        def depth(pt):  # cuánto avanzó más allá del eje de la pared, hacia adentro
            return -((pt["x"] - cx) * nx + (pt["y"] - cy) * ny)

        checks = []
        s, e, _ = walk(q)
        checks.append(("puerta cerrada frena", depth(e) < -0.2, f"quedó a {-depth(e):.2f} m del eje"))
        s, e, _ = walk(q, keys_before=("e",))
        checks.append(("puerta abierta deja pasar", depth(e) > 0.8, f"entró {depth(e):.2f} m"))
        dist = math.hypot(e["x"] - s["x"], e["y"] - s["y"])
        speed = dist / (e["t"] - s["t"])
        checks.append(("velocidad de caminata ~1.4 m/s", 1.1 < speed < 1.5, f"{speed:.2f} m/s ({dist:.2f} m en {e['t'] - s['t']:.1f} s simulados)"))
        # Pared ciega: el centro de un tramo de fachada sin aberturas cerca, acercándose desde afuera.
        for w in v["walls"]:
            if w["kind"] != "exterior":
                continue
            (x0, y0), (x1, y1) = w["start"], w["end"]
            L = math.hypot(x1 - x0, y1 - y0)
            u = L / 2
            if L < 1.2 or any(op["wall"] == w["id"] and op["offset"] - 0.5 < u < op["offset"] + op["width"] + 0.5 for op in v["openings"]):
                continue
            dx, dy = (x1 - x0) / L, (y1 - y0) / L
            wx, wy = x0 + dx * u, y0 + dy * u
            wnx, wny = dy, -dx
            if inside((wx + wnx * 0.5, wy + wny * 0.5), v["walls"]):
                wnx, wny = -wnx, -wny
            s, e, _ = walk(f"view=fps&x={wx + wnx * 1.2:.2f}&y={wy + wny * 1.2:.2f}&yaw={math.degrees(math.atan2(-wny, -wnx)):.0f}")
            d = -((e["x"] - wx) * wnx + (e["y"] - wy) * wny)
            checks.append((f"pared frena ({w['id']})", d < -0.2, f"quedó a {-d:.2f} m del eje"))
            break
        browser.close()

    for name, ok, detail in checks:
        failed |= not ok
        print(f"{'ok  ' if ok else 'FAIL'} {name:<32} {detail}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
