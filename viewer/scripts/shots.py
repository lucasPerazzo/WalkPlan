"""Capturas de verificación del visor.

Ver .claude/skills/r3f-arch-viz/references/visual-testing.md. Por cada captura chequea:
stats contra el JSON, __viewer.errors vacío, sin errores de consola, canvas no uniforme y, con los
modelos descargados, ningún mueble dibujado como caja (placeholders = 0).

Uso, desde viewer/ (levanta el dev server en 5199 para no chocar con otro en 5173):
  python ../.claude/skills/webapp-testing/scripts/with_server.py \
      --server "npm run dev -- --port 5199 --strictPort" --port 5199 -- python scripts/shots.py
Con el server ya levantado:
  python scripts/shots.py [--url http://localhost:5199] [--house public/house.json] [--out shots]
Por tandas (el render por software usa todos los núcleos): --phases 1,2 y después --phases 3,4,5,6; --pause N
espera N segundos entre capturas. report.json acumula las tandas (reemplaza por nombre de captura).

Convención de yaw (view=fps): grados antihorario desde +x del plano (0 = este de la lámina, 90 = arriba).
"""

import argparse
import json
import math
import re
import sys
import time
from pathlib import Path

from PIL import Image, ImageDraw, ImageStat
from playwright.sync_api import sync_playwright

VISIBLE = {"reforma": {"existing", "new"}, "actual": {"existing", "demolish"}, "diff": {"existing", "new"}}  # Cambios = geometría de la Reforma
MIN_STDDEV = 8.0  # desvío mínimo de gris para considerar que el canvas no está vacío
DESKTOP = {"width": 1280, "height": 800}
PHONE = {"width": 390, "height": 844}


def visible(house: dict, mode: str) -> dict:
    """Mismo filtro que filterByView en el visor."""
    vis = VISIBLE[mode]
    hidden = {w["id"] for w in house["walls"] if w["status"] not in vis}
    return {
        "walls": [w for w in house["walls"] if w["status"] in vis],
        "openings": [o for o in house["openings"] if o["status"] in vis and o["wall"] not in hidden],
        "rooms": [r for r in house["rooms"] if r["status"] in vis],
        "furniture": [f for f in house.get("furniture", []) if f["status"] in vis],
    }


def expected_stats(house: dict, mode: str) -> dict:
    v = visible(house, mode)
    return {k: len(v[k]) for k in ("walls", "openings", "rooms", "furniture")}


def inside(p, walls) -> bool:
    """Rayo hacia +x contra los ejes de los muros exteriores (igual que insideHouse en el visor)."""
    hit = False
    for w in walls:
        if w["kind"] != "exterior":
            continue
        (x0, y0), (x1, y1) = w["start"], w["end"]
        if (y0 > p[1]) != (y1 > p[1]) and x0 + (p[1] - y0) * (x1 - x0) / (y1 - y0) > p[0]:
            hit = not hit
    return hit


def door_geometry(o: dict, walls: dict):
    w = walls[o["wall"]]
    (x0, y0), (x1, y1) = w["start"], w["end"]
    length = math.hypot(x1 - x0, y1 - y0)
    dx, dy = (x1 - x0) / length, (y1 - y0) / length
    u = o["offset"] + o["width"] / 2
    return (x0 + dx * u, y0 + dy * u), (dy, -dx)


def yaw_to(a, b) -> float:
    return math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))


def centroid(poly):
    xs, ys = zip(*poly)
    return sum(xs) / len(xs), sum(ys) / len(ys)


def near_boundary(p, poly, tol=0.35) -> bool:
    for (ax, ay), (bx, by) in zip(poly, poly[1:] + poly[:1]):
        lx, ly = bx - ax, by - ay
        t = max(0.0, min(1.0, ((p[0] - ax) * lx + (p[1] - ay) * ly) / (lx * lx + ly * ly)))
        if math.hypot(ax + lx * t - p[0], ay + ly * t - p[1]) < tol:
            return True
    return False


def room_views(house: dict) -> list[tuple[str, str]]:
    """Una vista por ambiente amueblado: desde su puerta, 0.6 m adentro, mirando al centro."""
    v = visible(house, "reforma")
    walls = {w["id"]: w for w in v["walls"]}
    furnished = {f.get("room") for f in v["furniture"]}
    views = []
    for r in v["rooms"]:
        if r["id"] not in furnished:
            continue
        c = centroid(r["polygon"])
        best = None
        for o in v["openings"]:
            if o["type"] not in ("door", "sliding_door", "opening"):
                continue
            center, (nx, ny) = door_geometry(o, walls)
            if not near_boundary(center, r["polygon"]):
                continue
            s = 1 if (c[0] - center[0]) * nx + (c[1] - center[1]) * ny > 0 else -1
            p = (center[0] + nx * s * 0.6, center[1] + ny * s * 0.6)
            d = math.hypot(c[0] - p[0], c[1] - p[1])
            if best is None or d > best[0]:  # la puerta más lejana al centro muestra más ambiente
                best = (d, p)
        if best is None:
            xs, ys = zip(*r["polygon"])
            best = (0, (c[0], min(ys) + 0.6))
        p = best[1]
        slug = re.sub(r"[^a-z0-9]+", "-", r["name"].lower()).strip("-")
        views.append((f"fps_{r['id']}_{slug}", f"view=fps&x={p[0]:.2f}&y={p[1]:.2f}&yaw={yaw_to(p, c):.0f}"))
    return views


CATALOG_MD = Path(__file__).resolve().parents[2] / ".claude/skills/house-schema/references/furniture-catalog.md"
SHEET_ROW, SHEET_GAP = 6, 1.0  # claves por lámina y separación entre muebles
SHEET_VIEW = {"width": 1600, "height": 900}
ENVIRONMENT_IDS = ["forest", "city", "suburb", "countryside", "beach"]  # src/environment/presets.ts
FOV_V = 70  # grados, cámara de primera persona


def catalog_widths() -> dict[str, float]:
    return {k: w for k, w in catalog_rows()}


def catalog_keys() -> list[str]:
    return [k for k, _ in catalog_rows()]


def catalog_rows() -> list[tuple[str, float]]:
    rows = []
    for line in CATALOG_MD.read_text(encoding="utf-8").splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) >= 4 and re.fullmatch(r"[a-z_0-9]+", cells[0]) and re.fullmatch(r"[\d.]+", cells[1]):
            rows.append((cells[0], float(cells[1])))
    return rows


def catalog_sheet(path: Path, keys: list[str], viewport: dict) -> tuple[str, list[tuple[str, float]], float]:
    """Casa sintética con una fila de claves del catálogo, frente hacia -y, vista de frente desde el sur en
    primera persona. Muros de 0.30 m para que no tapen. Devuelve la query de la vista, (clave, x) para
    rotular y la distancia de la cámara a la fila."""
    widths = catalog_widths()
    xs, x = [], SHEET_GAP
    for k in keys:
        xs.append(x + widths[k] / 2)
        x += widths[k] + SHEET_GAP
    w, h = x, 3.5
    half_fov = viewport["width"] / 2 / (viewport["height"] / 2 / math.tan(math.radians(FOV_V / 2)))
    back = w / 2 / half_fov + 0.5
    corners = [(0, 0), (w, 0), (w, h), (0, h)]
    walls = [{"id": f"w{i + 1}", "start": list(a), "end": list(corners[(i + 1) % 4]), "thickness": 0.2, "height": 0.3,
              "kind": "exterior", "status": "existing"} for i, a in enumerate(corners)]
    example = json.loads((Path(__file__).resolve().parents[1] / "public/house.example.json").read_text(encoding="utf-8"))
    house = {
        "version": 3,
        "meta": {"source": "lámina de catálogo", "scale_reference": "grilla", "default_wall_height": 2.6, "uncertainties": []},
        "walls": walls,
        "openings": [],
        "rooms": [{"id": "r1", "name": "Catálogo", "polygon": [[0.1, 0.1], [w - 0.1, 0.1], [w - 0.1, h - 0.1], [0.1, h - 0.1]],
                   "floor": {"material": "concrete", "color": "#d8d4cc"}, "status": "existing"}],
        "furniture": [{"id": f"f{i + 1}", "room": "r1", "catalog": k, "position": [round(x, 3), h / 2], "rotation": 0,
                       "status": "existing", "source": "suggested"} for i, (k, x) in enumerate(zip(keys, xs))],
        "site": {"environment": "suburb", "north_deg": 0, "latitude": -35.0},
        "style": example["style"],
    }
    path.write_text(json.dumps(house, indent=2, ensure_ascii=False), encoding="utf-8")
    query = f"house={path.name}&view=fps&x={w / 2:.2f}&y={h / 2 - back:.2f}&yaw=90"
    return query, list(zip(keys, xs)), back


def label_sheet(png: Path, labels: list[tuple[str, float]], cx: float, depth: float, viewport: dict) -> None:
    """Rotula cada clave debajo de su mueble (proyección de la cámara de primera persona)."""
    img = Image.open(png).convert("RGB")
    draw = ImageDraw.Draw(img)
    f = viewport["height"] / 2 / math.tan(math.radians(FOV_V / 2))
    top = viewport["height"] / 2 + 1.6 / (depth - 1) * f + 6  # bajo el piso de la fila (ojos a 1.60 m)
    for key, x in labels:
        px = viewport["width"] / 2 + (x - cx) / depth * f
        tw = draw.textlength(key)
        draw.rectangle([px - tw / 2 - 4, top, px + tw / 2 + 4, top + 16], fill=(255, 255, 255))
        draw.text((px - tw / 2, top + 2), key, fill=(20, 20, 20))
    img.save(png)


def main_door(house: dict, spawn_door: str):
    """Centro de la puerta de llegada y su normal hacia afuera."""
    v = visible(house, "reforma")
    walls = {w["id"]: w for w in v["walls"]}
    o = next(o for o in v["openings"] if o["id"] == spawn_door)
    center, (nx, ny) = door_geometry(o, walls)
    if inside((center[0] + nx * 0.5, center[1] + ny * 0.5), v["walls"]):
        nx, ny = -nx, -ny
    return center, (nx, ny)


def main_door_view(house: dict, spawn_door: str, dist: float) -> str:
    center, (nx, ny) = main_door(house, spawn_door)
    p = (center[0] + nx * dist, center[1] + ny * dist)
    return f"view=fps&x={p[0]:.2f}&y={p[1]:.2f}&yaw={yaw_to(p, center):.0f}"


def outward_view(house: dict, spawn_door: str, dist: float) -> str:
    """Parado frente a la puerta de llegada, de espaldas a la casa (se ve el entorno y la calle)."""
    center, (nx, ny) = main_door(house, spawn_door)
    p = (center[0] + nx * dist, center[1] + ny * dist)
    return f"view=fps&x={p[0]:.2f}&y={p[1]:.2f}&yaw={math.degrees(math.atan2(ny, nx)):.0f}"


def back_view(house: dict, spawn_door: str, beyond: float) -> str:
    """Del lado opuesto a la entrada (en la playa, el mar), `beyond` metros más allá de la casa, mirando hacia afuera."""
    _, (nx, ny) = main_door(house, spawn_door)
    pts = [p for r in house["rooms"] for p in r["polygon"]] + [p for w in house["walls"] for p in (w["start"], w["end"])]
    cx = (min(p[0] for p in pts) + max(p[0] for p in pts)) / 2
    cy = (min(p[1] for p in pts) + max(p[1] for p in pts)) / 2
    reach = max(-((p[0] - cx) * nx + (p[1] - cy) * ny) for p in pts)
    p = (cx - nx * (reach + beyond), cy - ny * (reach + beyond))
    return f"view=fps&x={p[0]:.2f}&y={p[1]:.2f}&yaw={math.degrees(math.atan2(-ny, -nx)):.0f}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:5199")
    ap.add_argument("--house", default="public/house.json")
    ap.add_argument("--out", default="shots")
    ap.add_argument("--phases", default="1,2,3,4,5,6", help="fases a capturar, ej. 1,2")
    ap.add_argument("--pause", type=float, default=0, help="segundos de pausa entre capturas")
    args = ap.parse_args()
    phases = {int(f) for f in args.phases.split(",")}

    house = json.loads(Path(args.house).read_text(encoding="utf-8"))
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    report, failed = [], False

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
        )

        models = (Path(args.house).parent / "models" / "kenney").is_dir()

        def shoot(name, query, mode="reforma", viewport=DESKTOP, actions=None, expect=None):
            nonlocal failed
            page = browser.new_page(viewport=viewport)
            console_errors: list[str] = []
            page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: console_errors.append(str(e)))
            page.goto(f"{args.url}/?test=1&{query}")
            problems: list[str] = []
            try:
                page.wait_for_function("window.__viewer && window.__viewer.ready", timeout=90000)
            except Exception:
                problems.append("timeout esperando __viewer.ready")
            for key, wait in actions or []:
                page.keyboard.press(key)
                page.wait_for_timeout(wait)
            probe = page.evaluate("window.__viewer") or {}
            path = out / f"{name}.png"
            page.screenshot(path=str(path), timeout=120000)  # render por software: un cuadro puede tardar
            page.close()

            stats = probe.get("stats", {})
            expected = dict(expect or expected_stats(house, mode))
            if models:  # con los modelos descargados, ningún mueble queda como caja
                expected["placeholders"] = 0
            for key, value in expected.items():
                if stats.get(key) != value:
                    problems.append(f"stats.{key} = {stats.get(key)}, se esperaba {value}")
            env = re.search(r"env=(\w+)", query)
            if env and (probe.get("environment") or {}).get("id") != env.group(1):
                problems.append(f"entorno {probe.get('environment')}, se esperaba {env.group(1)}")
            if probe.get("errors"):
                problems.append(f"__viewer.errors: {probe['errors']}")
            if console_errors:
                problems.append(f"consola: {console_errors}")
            stddev = ImageStat.Stat(Image.open(path).convert("L")).stddev[0]
            if stddev < MIN_STDDEV:
                problems.append(f"captura casi uniforme (desvío {stddev:.1f})")

            failed |= bool(problems)
            report.append({"shot": name, "query": query, "stats": stats, "stddev": round(stddev, 1),
                           "spawnDoor": probe.get("spawnDoor"), "problems": problems})
            print(f"{'FAIL' if problems else 'ok  '} {name:<34} desvío={stddev:5.1f}  {query}")
            for pr in problems:
                print(f"      - {pr}")
            time.sleep(args.pause)
            return probe

        # Fase 1: planta y maqueta
        xs = [p[0] for w in house["walls"] for p in (w["start"], w["end"])]
        ys = [p[1] for w in house["walls"] for p in (w["start"], w["end"])]
        x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        d = max(x1 - x0, y1 - y0, 4) * 0.9
        if 1 in phases:
            shoot("plan", "view=plan")
            shoot("plan_actual", "view=plan&mode=actual", mode="actual")
            for name, (x, y) in {"abajo-izq": (x0 - d, y0 - d), "abajo-der": (x1 + d, y0 - d),
                                 "arriba-der": (x1 + d, y1 + d), "arriba-izq": (x0 - d, y1 + d)}.items():
                shoot(f"orbit_{name}", f"view=orbit&x={x:.2f}&y={y:.2f}")

        # Fase 2: primera persona
        views = room_views(house)
        if 2 in phases:
            probe = shoot("fps_llegada", "view=fps")
            shoot("plan_con_marcador", "view=fps", actions=[("Digit3", 2500)])
            spawn_door = probe.get("spawnDoor")
            if spawn_door:
                q = main_door_view(house, spawn_door, 1.2)
                shoot("fps_puerta_cerrada", q)
                shoot("fps_puerta_abierta", q, actions=[("e", 1500)])
            else:
                failed = True
                print("FAIL sin puerta de llegada (spawnDoor)")
            for name, q in views:
                shoot(name, q)

        # Fase 3: sol orientado (hacia dónde caen las sombras respecto del norte) y estaciones
        if 3 in phases:
            corner = f"view=orbit&x={x0 - d:.2f}&y={y0 - d:.2f}"
            shoot("orbit_techo_09h", f"{corner}&roof=1&hour=9")
            shoot("orbit_techo_17h", f"{corner}&roof=1&hour=17")
            shoot("plan_sombras_09h", "view=plan&hour=9")
            living = next((q for n, q in views if "living" in n), None)
            if living:
                shoot("fps_living_verano_12h", f"{living}&hour=12&season=summer")
                shoot("fps_living_invierno_12h", f"{living}&hour=12&season=winter")
            shoot("fps_celular", "view=fps&mobile=1", viewport=PHONE)

        # Fase 4: lámina de catálogo, todas las claves con el frente hacia la cámara (la planta con
        # huellas es "plan"; la selección del editor la captura scripts/editor_test.py)
        sheet = Path(args.house).parent / "catalog-sheet.house.json"
        if 4 in phases:
            keys = catalog_keys()
            for i in range(0, len(keys), SHEET_ROW):
                row = keys[i:i + SHEET_ROW]
                query, labels, back = catalog_sheet(sheet, row, SHEET_VIEW)
                name = f"catalogo_{i // SHEET_ROW + 1}"
                shoot(name, query, viewport=SHEET_VIEW, expect={"walls": 4, "openings": 0, "rooms": 1, "furniture": len(row)})
                label_sheet(out / f"{name}.png", labels, float(query.split("&x=")[1].split("&")[0]), back, SHEET_VIEW)
        sheet.unlink(missing_ok=True)

        # Fase 5: por entorno, maqueta y primera persona desde la llegada mirando hacia afuera; en la playa, el mar.
        if 5 in phases:
            for env in ENVIRONMENT_IDS:
                probe = shoot(f"entorno_{env}_maqueta", f"view=orbit&env={env}&x={x0 - d:.2f}&y={y0 - d:.2f}")
                door = probe.get("spawnDoor")
                if door:
                    shoot(f"entorno_{env}_afuera", f"{outward_view(house, door, 3)}&env={env}")
                    if env == "beach":
                        shoot("entorno_beach_mar", f"{back_view(house, door, 6)}&env={env}")

        # Fase 6: Actual / Cambios (Reforma es el default de todas las anteriores) y techo a cuatro aguas
        if 6 in phases:
            corner = f"view=orbit&x={x0 - d:.2f}&y={y0 - d:.2f}"
            living = next((q for n, q in room_views(house) if "living" in n), None)
            for mode, label in (("actual", "actual"), ("diff", "cambios")):
                shoot(f"{label}_planta", f"view=plan&mode={mode}", mode=mode)
                shoot(f"{label}_maqueta", f"{corner}&mode={mode}", mode=mode)
                if living:
                    shoot(f"{label}_living", f"{living}&mode={mode}", mode=mode)
            probe = shoot("techo_maqueta", f"{corner}&roof=1&env=countryside")
            door = probe.get("spawnDoor")
            if door:
                shoot("techo_frente", f"{main_door_view(house, door, 14)}&env=countryside")
        browser.close()

    # Acumula tandas: las capturas de esta corrida reemplazan a las de igual nombre.
    path = out / "report.json"
    previous = json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
    names = {r["shot"] for r in report}
    report = [r for r in previous if r["shot"] not in names] + report
    path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
