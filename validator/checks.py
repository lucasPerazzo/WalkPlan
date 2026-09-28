"""Chequeos. Cada función es pura y devuelve una lista de Issue.

ERRORS: invariantes del skill house-schema (exit 1). WARNINGS: avisos que no bloquean (exit 0).
"""

from collections import Counter

from shapely.geometry import LineString, Polygon
from shapely.validation import explain_validity

from catalog import CatalogEntry
from geometry import (
    MIN_WALL_LENGTH,
    door_swing,
    exterior_contour,
    furniture_footprint,
    furniture_z_range,
    project,
    share_view,
    signed_area,
    wall_dir,
    wall_footprint,
    wall_length,
)
from model import FurnitureItem, House, Point, Wall
from report import Issue, id_key

TOL = 1e-6
AREA_EPS = 1e-4  # 1 cm²: debajo de esto, dos cosas solo se tocan
MIN_ROOM_AREA = 1.0
THICKNESS_RANGE = (0.08, 0.45)
HEIGHT_RANGE = (2.2, 4.0)
ROOM_OUTSIDE_TOL = 0.3
FURNITURE_OUTSIDE_TOL = 0.05

Catalog = dict[str, CatalogEntry]


def _f(x: float) -> str:
    return f"{x:.2f}"


def _fmt(p: Point) -> str:
    return f"({p[0]:.2f}, {p[1]:.2f})"


def _walls_by_id(house: House) -> dict[str, Wall]:
    return {w.id: w for w in house.walls}


def _valid_polygon(points: list[Point]) -> Polygon | None:
    if len(points) < 3:
        return None
    poly = Polygon(points)
    return poly if poly.is_valid else None


# --- Errores ---


def check_unique_ids(house: House) -> list[Issue]:
    out = []
    for name, items in (
        ("walls", house.walls),
        ("openings", house.openings),
        ("rooms", house.rooms),
        ("furniture", house.furniture),
    ):
        for element_id, n in Counter(x.id for x in items).items():
            if n > 1:
                out.append(Issue("duplicate_id", f"id repetido {n} veces en {name}", [element_id]))
    return out


def check_opening_walls(house: House) -> list[Issue]:
    ids = {w.id for w in house.walls}
    return [
        Issue("opening_wall_missing", f"la pared {o.wall} no existe", [o.id])
        for o in house.openings
        if o.wall not in ids
    ]


def check_opening_ranges(house: House) -> list[Issue]:
    walls = _walls_by_id(house)
    out = []
    for o in house.openings:
        w = walls.get(o.wall)
        if w is None:
            continue
        length = wall_length(w)
        if o.offset < -TOL:
            out.append(Issue("opening_out_of_range", f"offset negativo ({_f(o.offset)}) en {w.id}", [o.id, w.id]))
        elif o.offset + o.width > length + TOL:
            msg = f"se sale de {w.id}: offset {_f(o.offset)} + ancho {_f(o.width)} > largo {_f(length)}"
            out.append(Issue("opening_out_of_range", msg, [o.id, w.id]))
    return out


def check_opening_overlaps(house: House) -> list[Issue]:
    """Una abertura demolish y una new en el mismo lugar (se reemplaza) no chocan: no se ven juntas."""
    by_wall: dict[str, list] = {}
    for o in house.openings:
        by_wall.setdefault(o.wall, []).append(o)
    out = []
    for wall_id, ops in by_wall.items():
        ops.sort(key=lambda o: o.offset)
        for i, a in enumerate(ops):
            for b in ops[i + 1 :]:
                overlap = min(a.offset + a.width, b.offset + b.width) - max(a.offset, b.offset)
                if overlap > TOL and share_view(a.status, b.status):
                    out.append(Issue("openings_overlap", f"se superponen {_f(overlap)} m en la pared {wall_id}", [a.id, b.id]))
    return out


def check_opening_heights(house: House) -> list[Issue]:
    walls = _walls_by_id(house)
    out = []
    for o in house.openings:
        w = walls.get(o.wall)
        if w is not None and o.sill + o.height > w.height + TOL:
            msg = f"antepecho {_f(o.sill)} + alto {_f(o.height)} = {_f(o.sill + o.height)} > altura de {w.id} ({_f(w.height)})"
            out.append(Issue("opening_too_tall", msg, [o.id, w.id]))
    return out


def check_door_sills(house: House) -> list[Issue]:
    return [
        Issue("door_sill", f"{o.type} con antepecho {_f(o.sill)} (debe ser 0)", [o.id])
        for o in house.openings
        if o.type in ("door", "sliding_door") and abs(o.sill) > TOL
    ]


def check_room_polygons(house: House) -> list[Issue]:
    out = []
    for r in house.rooms:
        if len(r.polygon) < 3:
            out.append(Issue("room_polygon", "polígono con menos de 3 puntos", [r.id]))
            continue
        poly = Polygon(r.polygon)
        if not poly.is_valid:
            out.append(Issue("room_polygon", f"polígono inválido: {explain_validity(poly)}", [r.id]))
            continue
        if poly.area < MIN_ROOM_AREA:
            out.append(Issue("room_area", f"área {poly.area:.2f} m² < {MIN_ROOM_AREA} m²", [r.id]))
        if signed_area(r.polygon) < 0:
            out.append(Issue("room_orientation", "polígono en sentido horario", [r.id]))
    return out


def _dist_to_axis(w: Wall, p: Point) -> float:
    dx, dy = wall_dir(w)
    return abs(dx * (p[1] - w.start[1]) - dy * (p[0] - w.start[0]))


def check_duplicate_walls(house: House) -> list[Issue]:
    """Colineales superpuestas y visibles en la misma vista. demolish + new en el mismo lugar es válido."""
    out = []
    walls = house.walls
    for i, a in enumerate(walls):
        for b in walls[i + 1 :]:
            if not share_view(a.status, b.status):
                continue
            (ax, ay), (bx, by) = wall_dir(a), wall_dir(b)
            if abs(ax * by - ay * bx) > 0.02 or _dist_to_axis(a, b.start) > 0.01 or _dist_to_axis(a, b.end) > 0.01:
                continue
            u0, u1 = sorted((project(a, b.start), project(a, b.end)))
            overlap = min(u1, wall_length(a)) - max(u0, 0.0)
            if overlap > MIN_WALL_LENGTH:
                out.append(Issue("duplicate_wall", f"paredes colineales superpuestas {_f(overlap)} m", [a.id, b.id]))
    return out


def check_lot_contains_house(house: House) -> list[Issue]:
    """Se chequean los ejes de las paredes exteriores: una medianera sobre el límite es válida."""
    lot = house.site.lot
    if not lot:
        return []
    poly = _valid_polygon(lot)
    if poly is None:
        return [Issue("lot_polygon", "lot con menos de 3 puntos o autointersectado", ["site.lot"])]
    zone = poly.buffer(1e-6)
    outside = [
        w.id for w in house.walls if w.kind == "exterior" and not zone.covers(LineString([w.start, w.end]))
    ]
    if not outside:
        return []
    return [Issue("lot_excludes_house", "paredes exteriores fuera del terreno (site.lot)", sorted(outside, key=id_key))]


def check_furniture_refs(house: House, catalog: Catalog) -> list[Issue]:
    rooms = {r.id for r in house.rooms}
    out = []
    for item in house.furniture:
        if item.catalog not in catalog:
            out.append(Issue("furniture_catalog", f"clave '{item.catalog}' no está en furniture-catalog.md", [item.id]))
        if item.room is not None and item.room not in rooms:
            out.append(Issue("furniture_room", f"el ambiente {item.room} no existe", [item.id]))
    return out


# --- Warnings ---


def _node(p: Point) -> tuple[float, float]:
    return (round(p[0], 6), round(p[1], 6))


def check_loose_exterior_ends(house: House) -> list[Issue]:
    ext = [w for w in house.walls if w.kind == "exterior"]
    degree = Counter(_node(p) for w in ext for p in (w.start, w.end))
    return [
        Issue("loose_exterior_end", f"extremo suelto en {_fmt(p)}", [w.id])
        for w in ext
        for p in (w.start, w.end)
        if degree[_node(p)] == 1
    ]


def check_exterior_contour(house: House) -> list[Issue]:
    if not any(w.kind == "exterior" for w in house.walls):
        return [Issue("exterior_contour_open", "no hay paredes exteriores")]
    if exterior_contour(house.walls) is None:
        return [Issue("exterior_contour_open", "las paredes exteriores no forman un contorno cerrado")]
    return []


def check_rooms_inside_contour(house: House) -> list[Issue]:
    contour = exterior_contour(house.walls)
    if contour is None:
        return []  # ya lo avisa check_exterior_contour
    zone = contour.buffer(ROOM_OUTSIDE_TOL, join_style="mitre")
    out = []
    for r in house.rooms:
        poly = _valid_polygon(r.polygon)
        if poly is None:
            continue
        outside = poly.difference(zone).area
        if outside > AREA_EPS:
            msg = f"se sale del contorno exterior más de {ROOM_OUTSIDE_TOL} m ({outside:.2f} m² afuera)"
            out.append(Issue("room_outside_contour", msg, [r.id]))
    return out


def check_wall_thickness(house: House) -> list[Issue]:
    lo, hi = THICKNESS_RANGE
    return [
        Issue("wall_thickness", f"espesor {_f(w.thickness)} fuera de {lo}-{hi} m", [w.id])
        for w in house.walls
        if not lo <= w.thickness <= hi
    ]


def check_wall_height(house: House) -> list[Issue]:
    lo, hi = HEIGHT_RANGE
    return [
        Issue("wall_height", f"altura {_f(w.height)} fuera de {lo}-{hi} m", [w.id])
        for w in house.walls
        if not lo <= w.height <= hi
    ]


def check_new_openings_in_demolished_walls(house: House) -> list[Issue]:
    walls = _walls_by_id(house)
    return [
        Issue("new_opening_in_demolished_wall", f"abertura nueva en la pared {o.wall}, que se demuele", [o.id, o.wall])
        for o in house.openings
        if o.status == "new" and o.wall in walls and walls[o.wall].status == "demolish"
    ]


def _placed(house: House, catalog: Catalog) -> list[tuple[FurnitureItem, CatalogEntry, Polygon]]:
    return [
        (item, catalog[item.catalog], furniture_footprint(item, catalog[item.catalog]))
        for item in house.furniture
        if item.catalog in catalog
    ]


def _z_overlap(a: tuple[float, float], b: tuple[float, float]) -> bool:
    return a[0] < b[1] - TOL and b[0] < a[1] - TOL


def check_furniture_in_rooms(house: House, catalog: Catalog) -> list[Issue]:
    rooms = {r.id: r for r in house.rooms}
    out = []
    for item, _, footprint in _placed(house, catalog):
        room = rooms.get(item.room) if item.room else None
        poly = _valid_polygon(room.polygon) if room else None
        if poly is None:
            continue
        outside = footprint.difference(poly.buffer(FURNITURE_OUTSIDE_TOL, join_style="mitre")).area
        if outside > AREA_EPS:
            msg = f"{item.catalog} se sale de {room.id} más de {FURNITURE_OUTSIDE_TOL} m ({outside:.2f} m² afuera)"
            out.append(Issue("furniture_outside_room", msg, [item.id, room.id]))
    return out


def check_furniture_overlaps(house: House, catalog: Catalog) -> list[Issue]:
    """Entre muebles y contra paredes. Sin collider (rug) no cuenta; se compara también la altura
    (kitchen_upper cuelga a 1.50 m y no choca con la mesada de abajo)."""
    placed = [p for p in _placed(house, catalog) if p[1].collider]
    walls = [(w, wall_footprint(w)) for w in house.walls]
    out = []
    for i, (a, ea, fa) in enumerate(placed):
        za = furniture_z_range(a, ea)
        for b, eb, fb in placed[i + 1 :]:
            if (
                share_view(a.status, b.status)
                and _z_overlap(za, furniture_z_range(b, eb))
                and fa.intersection(fb).area > AREA_EPS
            ):
                out.append(Issue("furniture_overlap", f"{a.catalog} y {b.catalog} se superponen", [a.id, b.id]))
        for w, fw in walls:
            if share_view(a.status, w.status) and _z_overlap(za, (0.0, w.height)) and fa.intersection(fw).area > AREA_EPS:
                out.append(Issue("furniture_wall_overlap", f"{a.catalog} se mete en la pared {w.id}", [a.id, w.id]))
    return out


def check_furniture_door_swings(house: House, catalog: Catalog) -> list[Issue]:
    walls = _walls_by_id(house)
    swings = [(o, door_swing(o, walls[o.wall])) for o in house.openings if o.type == "door" and o.wall in walls]
    out = []
    for item, entry, footprint in _placed(house, catalog):
        if not entry.collider:
            continue
        z = furniture_z_range(item, entry)
        for o, zone in swings:
            if (
                share_view(item.status, o.status)
                and _z_overlap(z, (o.sill, o.sill + o.height))
                and footprint.intersection(zone).area > AREA_EPS
            ):
                out.append(Issue("furniture_in_door_swing", f"{item.catalog} dentro del barrido de la puerta {o.id}", [item.id, o.id]))
    return out


ERRORS = (
    check_unique_ids,
    check_opening_walls,
    check_opening_ranges,
    check_opening_overlaps,
    check_opening_heights,
    check_door_sills,
    check_room_polygons,
    check_duplicate_walls,
    check_lot_contains_house,
)
CATALOG_ERRORS = (check_furniture_refs,)
WARNINGS = (
    check_loose_exterior_ends,
    check_exterior_contour,
    check_rooms_inside_contour,
    check_wall_thickness,
    check_wall_height,
    check_new_openings_in_demolished_walls,
)
CATALOG_WARNINGS = (check_furniture_in_rooms, check_furniture_overlaps, check_furniture_door_swings)
