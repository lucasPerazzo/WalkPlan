import copy
import json
import sys
from pathlib import Path

import pytest

VALIDATOR = Path(__file__).resolve().parents[1]
ROOT = VALIDATOR.parent
sys.path.insert(0, str(VALIDATOR))

from catalog import load_catalog  # noqa: E402
from model import House  # noqa: E402

EXAMPLE_PATH = ROOT / ".claude" / "skills" / "house-schema" / "assets" / "house.example.json"
SCHEMA_TS = ROOT / ".claude" / "skills" / "house-schema" / "references" / "schema.ts"
MATERIAL = {"material": "plaster", "color": "#eeeeee"}


@pytest.fixture(scope="session")
def catalog():
    return load_catalog()


@pytest.fixture
def example_raw() -> dict:
    return json.loads(EXAMPLE_PATH.read_text(encoding="utf-8"))


def wall(id, start, end, thickness=0.2, height=2.6, kind="exterior", status="existing") -> dict:
    return {"id": id, "start": list(start), "end": list(end), "thickness": thickness,
            "height": height, "kind": kind, "status": status}


def opening(id, wall_id, offset, width=0.9, height=2.1, sill=0.0, type="door", status="existing") -> dict:
    return {"id": id, "wall": wall_id, "type": type, "offset": offset, "width": width,
            "height": height, "sill": sill, "status": status}


def room(id, polygon, status="existing") -> dict:
    return {"id": id, "name": id, "polygon": [list(p) for p in polygon], "floor": MATERIAL, "status": status}


def item(id, catalog_key, position, rotation=0, room_id=None, status="new", **extra) -> dict:
    d = {"id": id, "catalog": catalog_key, "position": list(position), "rotation": rotation,
         "status": status, "source": "suggested", **extra}
    if room_id:
        d["room"] = room_id
    return d


def raw_house(walls=(), openings=(), rooms=(), furniture=(), site=None) -> dict:
    return copy.deepcopy({
        "version": 3,
        "meta": {"source": "test", "scale_reference": "test", "default_wall_height": 2.6, "uncertainties": []},
        "walls": list(walls),
        "openings": list(openings),
        "rooms": list(rooms),
        "furniture": list(furniture),
        "site": site or {"environment": "suburb", "north_deg": 0},
        "style": {
            "facade": MATERIAL, "interior_walls": MATERIAL, "window_frames": MATERIAL, "doors": MATERIAL,
            "roof": {"type": "flat", "material": MATERIAL},
        },
    })


def make_house(**kw) -> House:
    return House.model_validate(raw_house(**kw))


def box_walls(w=4.0, h=3.0, **kw) -> list[dict]:
    """Rectángulo cerrado antihorario de paredes exteriores."""
    return [
        wall("w1", (0, 0), (w, 0), **kw),
        wall("w2", (w, 0), (w, h), **kw),
        wall("w3", (w, h), (0, h), **kw),
        wall("w4", (0, h), (0, 0), **kw),
    ]
