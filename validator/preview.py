"""Overlay de control: el modelo dibujado sobre la lámina del plano, con meta.image_calibration."""

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.lines import Line2D  # noqa: E402
from matplotlib.patches import Patch  # noqa: E402
from matplotlib.patches import Polygon as MplPolygon  # noqa: E402
from shapely.geometry import Polygon  # noqa: E402

from catalog import CatalogEntry  # noqa: E402
from geometry import door_swing, furniture_footprint, furniture_front, point_at, wall_footprint  # noqa: E402
from model import House, Point  # noqa: E402

# Mismos colores que el resaltado de cambios del visor.
STATUS_COLORS = {"existing": "#1f6fd1", "new": "#1a9e4b", "demolish": "#d62f2f"}
OPENING_COLOR = "#f28c18"
ROOM_COLOR = "#222222"
FURNITURE_COLOR = "#8e44ad"
PT_PER_PX = 72 / 100  # la figura se guarda a 100 dpi


class PreviewError(Exception):
    pass


def render_preview(house: House, catalog: dict[str, CatalogEntry], image_path: Path, out_path: Path) -> None:
    cal = house.meta.image_calibration
    if cal is None:
        raise PreviewError("el JSON no tiene meta.image_calibration")
    if not image_path.exists():
        raise PreviewError(f"no existe {image_path}")

    img = plt.imread(str(image_path))
    h, w = img.shape[:2]
    ox, oy = cal.origin_px
    k = cal.px_per_m

    def px(p: Point) -> Point:
        return (ox + p[0] * k, oy - p[1] * k)  # la y de la imagen crece hacia abajo

    fig = plt.figure(figsize=(w / 100, h / 100), dpi=100)
    ax = fig.add_axes((0, 0, 1, 1))
    ax.imshow(img)
    ax.set_xlim(0, w)
    ax.set_ylim(h, 0)
    ax.axis("off")
    lw = max(0.8, 0.02 * k * PT_PER_PX)  # ~2 cm
    fs = max(6.0, 0.18 * k * PT_PER_PX)  # ~18 cm

    def poly(coords, **kw) -> None:
        ax.add_patch(MplPolygon([px(c) for c in coords], closed=True, **kw))

    for r in house.rooms:
        if len(r.polygon) < 3:
            continue
        poly(r.polygon, fill=False, edgecolor=ROOM_COLOR, linestyle="--", linewidth=lw)
        label = Polygon(r.polygon).representative_point()
        ax.text(*px((label.x, label.y)), f"{r.id} {r.name}", color=ROOM_COLOR, fontsize=fs, ha="center", va="center")

    for wall in house.walls:
        color = STATUS_COLORS[wall.status]
        poly(wall_footprint(wall).exterior.coords, facecolor=color, edgecolor=color, alpha=0.45, linewidth=0)

    walls = {wall.id: wall for wall in house.walls}
    for o in house.openings:
        wall = walls.get(o.wall)
        if wall is None:
            continue
        a, b = px(point_at(wall, o.offset)), px(point_at(wall, o.offset + o.width))
        ax.plot((a[0], b[0]), (a[1], b[1]), color=OPENING_COLOR, linewidth=lw * 3, solid_capstyle="butt")
        if o.type == "door":
            swing = door_swing(o, wall)
            for g in getattr(swing, "geoms", [swing]):
                poly(g.exterior.coords, fill=False, edgecolor=OPENING_COLOR, linestyle=":", linewidth=lw)

    for item in house.furniture:
        entry = catalog.get(item.catalog)
        if entry is None:
            continue
        poly(furniture_footprint(item, entry).exterior.coords, fill=False, edgecolor=FURNITURE_COLOR, linewidth=lw)
        # Marca del frente: del centro al borde frontal.
        (cx, cy), (fx, fy) = item.position, furniture_front(item)
        d = entry.depth * (item.scale or 1.0) / 2
        c, f = px((cx, cy)), px((cx + fx * d, cy + fy * d))
        ax.plot((c[0], f[0]), (c[1], f[1]), color=FURNITURE_COLOR, linewidth=lw * 2)
        ax.text(*c, item.catalog, color=FURNITURE_COLOR, fontsize=fs * 0.7, ha="center", va="bottom")

    handles = [Patch(color=c, alpha=0.45, label=s) for s, c in STATUS_COLORS.items()] + [
        Line2D([], [], color=OPENING_COLOR, linewidth=3, label="aberturas (puntos: barrido)"),
        Line2D([], [], color=ROOM_COLOR, linestyle="--", label="ambientes"),
        Line2D([], [], color=FURNITURE_COLOR, label="muebles (línea al frente)"),
    ]
    ax.legend(handles=handles, loc="lower right", fontsize=max(6.0, fs * 0.8), framealpha=0.85)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=100)
    plt.close(fig)
