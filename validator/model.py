"""Modelos pydantic del house.json v3.

Espejo de .claude/skills/house-schema/references/schema.ts (fuente de verdad).
tests/test_model.py verifica que los campos coincidan con ese archivo.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

Status = Literal["existing", "new", "demolish"]
MaterialKind = Literal[
    "brick", "plaster", "stone", "concrete", "wood", "tile",
    "ceramic", "metal", "glass", "pvc", "aluminum",
]
EnvironmentPreset = Literal["forest", "city", "suburb", "countryside", "beach"]
Hex = Annotated[str, Field(pattern=r"^#[0-9a-fA-F]{6}$")]
Point = tuple[float, float]


class Model(BaseModel):
    # Campos desconocidos son error: atrapa typos de la extracción.
    model_config = ConfigDict(extra="forbid")


class MaterialRef(Model):
    material: MaterialKind
    color: Hex
    notes: str | None = None


class Wall(Model):
    id: str
    start: Point
    end: Point
    thickness: float = Field(gt=0)
    height: float = Field(gt=0)
    kind: Literal["exterior", "interior"]
    status: Status


class Opening(Model):
    id: str
    wall: str
    type: Literal["door", "window", "sliding_door", "opening"]
    offset: float
    width: float = Field(gt=0)
    height: float = Field(gt=0)
    sill: float = Field(ge=0)
    status: Status


class Room(Model):
    id: str
    name: str
    polygon: list[Point]
    floor: MaterialRef
    status: Status


class FurnitureItem(Model):
    id: str
    room: str | None = None
    catalog: str
    position: Point
    rotation: float
    scale: float | None = Field(default=None, gt=0)
    color: Hex | None = None
    status: Status
    source: Literal["plan", "render", "suggested", "user"]


class Site(Model):
    environment: EnvironmentPreset
    north_deg: float
    latitude: float | None = Field(default=None, ge=-90, le=90)
    street_edge: tuple[Point, Point] | None = None
    lot: list[Point] | None = None


class Uncertainty(Model):
    element_id: str | None = None
    note: str
    confidence: Literal["low", "medium"]


class ImageCalibration(Model):
    sheet: str
    px_per_m: float = Field(gt=0)
    origin_px: Point


class Roof(Model):  # Style.roof en schema.ts
    type: Literal["flat", "gable", "hip", "shed"]
    material: MaterialRef


class Style(Model):
    facade: MaterialRef
    facade_secondary: MaterialRef | None = None
    interior_walls: MaterialRef
    window_frames: MaterialRef
    doors: MaterialRef
    roof: Roof
    exterior_floor: MaterialRef | None = None


class Meta(Model):  # House.meta en schema.ts
    source: str
    scale_reference: str
    default_wall_height: float = Field(gt=0)
    image_calibration: ImageCalibration | None = None
    uncertainties: list[Uncertainty]


class House(Model):
    version: Literal[3]
    meta: Meta
    walls: list[Wall]
    openings: list[Opening]
    rooms: list[Room]
    furniture: list[FurnitureItem]
    site: Site
    style: Style
