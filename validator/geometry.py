"""Geometría compartida por correcciones, chequeos y preview. Coordenadas del plano, en metros."""

import math

from shapely import affinity
from shapely.geometry import LineString, Polygon, box
from shapely.geometry.base import BaseGeometry
from shapely.ops import polygonize, unary_union

from catalog import CatalogEntry
from model import FurnitureItem, Opening, Point, Status, Wall

MIN_WALL_LENGTH = 0.05

# Vistas del proyecto: dos elementos pueden chocar solo si se ven juntos en alguna.
VIEWS: tuple[frozenset[str], ...] = (
    frozenset({"existing", "demolish"}),  # Actual
    frozenset({"existing", "new"}),  # Reforma
)


def share_view(a: Status, b: Status) -> bool:
    return any(a in v and b in v for v in VIEWS)


def dist(a: Point, b: Point) -> float:
    return math.hypot(b[0] - a[0], b[1] - a[1])


def wall_length(w: Wall) -> float:
    return dist(w.start, w.end)


def wall_dir(w: Wall) -> Point:
    length = wall_length(w)
    return ((w.end[0] - w.start[0]) / length, (w.end[1] - w.start[1]) / length)


def point_at(w: Wall, u: float) -> Point:
    """Punto sobre el eje a distancia u desde start."""
    dx, dy = wall_dir(w)
    return (w.start[0] + dx * u, w.start[1] + dy * u)


def project(w: Wall, p: Point) -> float:
    """Coordenada u de la proyección de p sobre el eje de w."""
    dx, dy = wall_dir(w)
    return (p[0] - w.start[0]) * dx + (p[1] - w.start[1]) * dy


def signed_area(points: list[Point]) -> float:
    """Positiva si el polígono es antihorario."""
    n = len(points)
    return sum(points[i][0] * points[(i + 1) % n][1] - points[(i + 1) % n][0] * points[i][1] for i in range(n)) / 2


def wall_footprint(w: Wall) -> Polygon:
    return LineString([w.start, w.end]).buffer(w.thickness / 2, cap_style="flat")


def furniture_footprint(item: FurnitureItem, entry: CatalogEntry) -> Polygon:
    """Huella rotada: ancho × profundidad del catálogo × scale, rotación antihoraria en grados."""
    s = item.scale or 1.0
    x, y = item.position
    hw, hd = entry.width * s / 2, entry.depth * s / 2
    return affinity.rotate(box(x - hw, y - hd, x + hw, y + hd), item.rotation, origin=(x, y))


def furniture_front(item: FurnitureItem) -> Point:
    """Dirección del frente: con rotation 0 mira hacia -y del plano."""
    r = math.radians(item.rotation)
    return (math.sin(r), -math.cos(r))


def furniture_z_range(item: FurnitureItem, entry: CatalogEntry) -> tuple[float, float]:
    return entry.base, entry.base + entry.height * (item.scale or 1.0)


def _sector(center: Point, a0: float, a1: float, r: float, steps: int = 16) -> Polygon:
    delta = (a1 - a0 + math.pi) % (2 * math.pi) - math.pi  # barrido corto, ±90°
    arc = [
        (center[0] + r * math.cos(a0 + delta * i / steps), center[1] + r * math.sin(a0 + delta * i / steps))
        for i in range(steps + 1)
    ]
    return Polygon([center, *arc])


def door_swing(opening: Opening, wall: Wall) -> BaseGeometry:
    """Barrido de una puerta: cuarto de círculo de radio = ancho.

    El schema no tiene lado de apertura ni bisagra: se toman ambos lados y ambas jambas.
    """
    dx, dy = wall_dir(wall)
    a = point_at(wall, opening.offset)
    b = point_at(wall, opening.offset + opening.width)
    along = math.atan2(dy, dx)
    back = math.atan2(-dy, -dx)
    parts = []
    for nx, ny in ((dy, -dx), (-dy, dx)):  # derecha e izquierda de start→end
        normal = math.atan2(ny, nx)
        parts.append(_sector(a, along, normal, opening.width))  # bisagra en la jamba de start
        parts.append(_sector(b, back, normal, opening.width))  # bisagra en la jamba de end
    return unary_union(parts)


def exterior_contour(walls: list[Wall]) -> BaseGeometry | None:
    """Unión de las caras cerradas que forman los ejes de las paredes exteriores (todas las status)."""
    lines = [LineString([w.start, w.end]) for w in walls if w.kind == "exterior"]
    if not lines:
        return None
    faces = list(polygonize(unary_union(lines)))
    return unary_union(faces) if faces else None
