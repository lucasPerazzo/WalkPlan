"""Correcciones automáticas. Funciones puras: no mutan la entrada y devuelven (resultado, correcciones).

Cuando una corrección mueve el start de una pared, sus aberturas conservan su posición en el plano
y se recalcula el offset.
"""

import copy
import re

from geometry import MIN_WALL_LENGTH, dist, point_at, project, signed_area, wall_dir, wall_length
from model import House, Point, Wall
from report import Issue, id_key

DECIMALS = 6
PARALLEL_SIN = 0.1  # ~6°: por debajo, dos paredes se consideran paralelas y no forman una T


def _r(p: Point) -> Point:
    return (round(p[0], DECIMALS) + 0.0, round(p[1], DECIMALS) + 0.0)  # +0.0 evita -0.0


def _fmt(p: Point) -> str:
    return f"({p[0]:.2f}, {p[1]:.2f})"


def _move_wall(house: House, wall: Wall, start: Point, end: Point) -> None:
    """Mueve la pared (sobre una copia) y reproyecta el offset de sus aberturas."""
    start, end = _r(start), _r(end)
    if start == tuple(wall.start) and end == tuple(wall.end):
        return
    old = wall.model_copy()
    wall.start, wall.end = start, end
    if wall_length(wall) < 1e-9 or wall_length(old) < 1e-9:
        return  # pared degenerada: la elimina remove_short_walls
    for o in house.openings:
        if o.wall == wall.id:
            o.offset = round(project(wall, point_at(old, o.offset)), DECIMALS) + 0.0


# --- Sobre el JSON crudo, antes de parsear ---


def migrate_v1(raw: dict) -> tuple[dict, list[Issue]]:
    if raw.get("version") != 1:
        return raw, []
    out = copy.deepcopy(raw)
    out["version"] = 2
    added = []
    if "furniture" not in out:
        out["furniture"] = []
        added.append("furniture = []")
    if "site" not in out:
        out["site"] = {"environment": "suburb", "north_deg": 0}
        added.append("site: suburb, north_deg 0")
    detail = f" ({'; '.join(added)})" if added else ""
    return out, [Issue("migrate_v1", f"JSON v1 migrado a v2{detail}")]


def migrate_v2(raw: dict) -> tuple[dict, list[Issue]]:
    """v2 -> v3: solo se agrega el campo opcional site.latitude, así que alcanza con cambiar version."""
    if raw.get("version") != 2:
        return raw, []
    out = copy.deepcopy(raw)
    out["version"] = 3
    return out, [Issue("migrate_v2", "JSON v2 migrado a v3 (site.latitude queda sin cargar)")]


def fill_wall_heights(raw: dict) -> tuple[dict, list[Issue]]:
    meta = raw.get("meta")
    default = meta.get("default_wall_height") if isinstance(meta, dict) else None
    walls = raw.get("walls")
    if default is None or not isinstance(walls, list):
        return raw, []
    missing = [i for i, w in enumerate(walls) if isinstance(w, dict) and w.get("height") is None]
    if not missing:
        return raw, []
    out = copy.deepcopy(raw)
    for i in missing:
        out["walls"][i]["height"] = default
    ids = [str(walls[i].get("id", f"walls[{i}]")) for i in missing]
    return out, [Issue("fill_wall_height", f"height faltante completado con default_wall_height = {default}", ids)]


# --- Sobre el modelo ---


def merge_endpoints(house: House, tol: float) -> tuple[House, list[Issue]]:
    """Une extremos a menos de tol: clustering (single linkage) y cada cluster va a su promedio."""
    h = house.model_copy(deep=True)
    ends = [(wi, key) for wi in range(len(h.walls)) for key in ("start", "end")]
    pts = [tuple(getattr(h.walls[wi], key)) for wi, key in ends]
    parent = list(range(len(ends)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i in range(len(pts)):
        for j in range(i + 1, len(pts)):
            if dist(pts[i], pts[j]) <= tol + 1e-9:
                parent[find(i)] = find(j)

    clusters: dict[int, list[int]] = {}
    for i in range(len(ends)):
        clusters.setdefault(find(i), []).append(i)

    targets: dict[tuple[int, str], Point] = {}
    corrections = []
    for members in clusters.values():
        cpts = [pts[i] for i in members]
        if len(members) < 2 or all(p == cpts[0] for p in cpts):
            continue
        c = _r((sum(p[0] for p in cpts) / len(cpts), sum(p[1] for p in cpts) / len(cpts)))
        for i in members:
            targets[ends[i]] = c
        moved = max(dist(p, c) for p in cpts)
        ids = sorted({h.walls[ends[i][0]].id for i in members}, key=id_key)
        corrections.append(Issue("merge_endpoints", f"extremos unidos en {_fmt(c)} (desvío máx {moved:.3f} m)", ids))

    for wi, w in enumerate(h.walls):
        _move_wall(h, w, targets.get((wi, "start"), w.start), targets.get((wi, "end"), w.end))
    return h, corrections


def _snap(v: float, grid: float) -> float:
    return round(round(v / grid) * grid, DECIMALS) + 0.0


def _snap_pt(p: Point, grid: float) -> Point:
    return (_snap(p[0], grid), _snap(p[1], grid))


def snap_to_grid(house: House, grid: float) -> tuple[House, list[Issue]]:
    """Paredes, rooms y sitio a la grilla. Los muebles no se tocan."""
    if grid <= 0:
        return house, []
    h = house.model_copy(deep=True)
    corrections = []

    def log(what: str, ids: list[str], moved: float) -> None:
        if ids:
            msg = f"{what} ajustados a la grilla de {grid} m (desvío máx {moved:.3f} m)"
            corrections.append(Issue("snap_grid", msg, ids))

    ids, moved = [], 0.0
    for w in h.walls:
        s, e = _snap_pt(w.start, grid), _snap_pt(w.end, grid)
        d = max(dist(s, w.start), dist(e, w.end))
        if d > 1e-9:
            ids.append(w.id)
            moved = max(moved, d)
            _move_wall(h, w, s, e)
    log("extremos de paredes", ids, moved)

    ids, moved = [], 0.0
    for r in h.rooms:
        snapped = [_snap_pt(p, grid) for p in r.polygon]
        d = max((dist(a, b) for a, b in zip(snapped, r.polygon)), default=0.0)
        if d > 1e-9:
            ids.append(r.id)
            moved = max(moved, d)
            r.polygon = snapped
    log("polígonos de ambientes", ids, moved)

    moved = 0.0
    if h.site.lot:
        snapped = [_snap_pt(p, grid) for p in h.site.lot]
        moved = max(dist(a, b) for a, b in zip(snapped, h.site.lot))
        h.site.lot = snapped
    if h.site.street_edge:
        snapped = (_snap_pt(h.site.street_edge[0], grid), _snap_pt(h.site.street_edge[1], grid))
        moved = max(moved, *(dist(a, b) for a, b in zip(snapped, h.site.street_edge)))
        h.site.street_edge = snapped
    log("lot y street_edge", ["site"] if moved > 1e-9 else [], moved)
    return h, corrections


def remove_short_walls(house: House, min_length: float = MIN_WALL_LENGTH) -> tuple[House, list[Issue]]:
    short = [w for w in house.walls if wall_length(w) < min_length]
    if not short:
        return house, []
    h = house.model_copy(deep=True)
    h.walls = [w for w in h.walls if wall_length(w) >= min_length]
    return h, [
        Issue("remove_short_wall", f"pared eliminada (largo {wall_length(w):.3f} m < {min_length} m)", [w.id])
        for w in short
    ]


def _line_intersection(p1: Point, p2: Point, p3: Point, p4: Point) -> Point | None:
    d1 = (p2[0] - p1[0], p2[1] - p1[1])
    d2 = (p4[0] - p3[0], p4[1] - p3[1])
    den = d1[0] * d2[1] - d1[1] * d2[0]
    if abs(den) < 1e-12:
        return None
    t = ((p3[0] - p1[0]) * d2[1] - (p3[1] - p1[1]) * d2[0]) / den
    return (p1[0] + t * d1[0], p1[1] + t * d1[1])


def _next_wall_id(walls: list[Wall]) -> str:
    nums = [int(m.group(1)) for w in walls if (m := re.fullmatch(r"w(\d+)", w.id))]
    return f"w{max(nums, default=0) + 1}"


def _find_t(h: House, tol: float) -> tuple[Wall, str, Wall, Point, float] | None:
    """Primer extremo de una pared (tallo) que termina sobre el eje de otra (pasante), o cerca.

    Tolerancia: max(tol, espesor de la pasante / 2 + 2 cm), para atrapar tallos dibujados hasta la cara.
    """
    for a in h.walls:
        for key in ("start", "end"):
            e = tuple(getattr(a, key))
            other = tuple(a.end if key == "start" else a.start)
            for b in h.walls:
                if b is a or dist(e, b.start) < 1e-9 or dist(e, b.end) < 1e-9:
                    continue
                (ax, ay), (bx, by) = wall_dir(a), wall_dir(b)
                if abs(ax * by - ay * bx) < PARALLEL_SIN:
                    continue
                p = _line_intersection(a.start, a.end, b.start, b.end)
                if p is None:
                    continue
                u = project(b, p)
                if not MIN_WALL_LENGTH <= u <= wall_length(b) - MIN_WALL_LENGTH:
                    continue
                if dist(e, p) > max(tol, b.thickness / 2 + 0.02) + 1e-9:
                    continue
                # p tiene que quedar del mismo lado que e visto desde el otro extremo (extender o recortar, no invertir)
                if (p[0] - other[0]) * (e[0] - other[0]) + (p[1] - other[1]) * (e[1] - other[1]) <= 0:
                    continue
                if dist(other, p) < MIN_WALL_LENGTH:
                    continue
                return a, key, b, _r(p), u
    return None


def split_t_junctions(house: House, tol: float) -> tuple[House, list[Issue], list[Issue]]:
    """Parte la pared pasante en cada encuentro en T y reasigna sus aberturas.

    Devuelve (casa, correcciones, errores): una abertura que cruza el nodo es un error y se quita.
    """
    h = house.model_copy(deep=True)
    corrections: list[Issue] = []
    errors: list[Issue] = []
    while found := _find_t(h, tol):
        a, key, b, p, u = found
        e = tuple(getattr(a, key))
        other = tuple(a.end if key == "start" else a.start)
        moved = dist(e, p)
        if moved > 1e-9:
            # Todas las paredes que comparten ese nodo se mueven juntas.
            for w in h.walls:
                start = p if dist(w.start, e) < 1e-9 else w.start
                end = p if dist(w.end, e) < 1e-9 else w.end
                _move_wall(h, w, start, end)

        new = b.model_copy(update={"id": _next_wall_id(h.walls), "start": p})
        b.end = p  # b conserva su start: los offsets de su primera mitad no cambian
        h.walls.insert(next(i for i, w in enumerate(h.walls) if w is b) + 1, new)
        for o in [o for o in h.openings if o.wall == b.id]:
            if o.offset + o.width <= u + 1e-6:
                continue
            if o.offset >= u - 1e-6:
                o.wall = new.id
                o.offset = round(o.offset - u, DECIMALS) + 0.0
            else:
                msg = f"cruza el encuentro en T de {a.id} con {b.id} en {_fmt(p)}; se quita"
                errors.append(Issue("opening_crosses_t", msg, [o.id]))
                h.openings = [x for x in h.openings if x is not o]

        msg = f"{a.id} termina en {b.id}: {b.id} partida en {_fmt(p)}, nueva {new.id}"
        if moved > 1e-9:
            verb = "extendida" if dist(other, p) > dist(other, e) else "recortada"
            msg += f"; {a.id} {verb} {moved:.3f} m hasta el eje"
        corrections.append(Issue("split_t", msg, [a.id, b.id, new.id]))
    return h, corrections, errors


def _normalize(points: list[Point]) -> tuple[list[Point], int, bool]:
    """Sin puntos repetidos ni cierre duplicado, antihorario. Devuelve (puntos, quitados, invertido)."""
    out: list[Point] = []
    for p in points:
        if not out or dist(p, out[-1]) > 1e-9:
            out.append(tuple(p))
    if len(out) > 1 and dist(out[0], out[-1]) < 1e-9:
        out.pop()
    flipped = len(out) >= 3 and signed_area(out) < 0
    if flipped:
        out.reverse()
    return out, len(points) - len(out), flipped


def normalize_polygons(house: House) -> tuple[House, list[Issue]]:
    h = house.model_copy(deep=True)
    corrections = []

    def log(element_id: str, removed: int, flipped: bool) -> None:
        what = []
        if removed:
            what.append(f"{removed} punto(s) repetido(s) o de cierre quitado(s)")
        if flipped:
            what.append("orientado antihorario")
        if what:
            corrections.append(Issue("normalize_polygon", "; ".join(what), [element_id]))

    for r in h.rooms:
        r.polygon, removed, flipped = _normalize(r.polygon)
        log(r.id, removed, flipped)
    if h.site.lot:
        h.site.lot, removed, flipped = _normalize(h.site.lot)
        log("site.lot", removed, flipped)
    return h, corrections
