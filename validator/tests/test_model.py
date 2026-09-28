import re

import pytest
from conftest import SCHEMA_TS, raw_house, wall
from pydantic import BaseModel, ValidationError

import model
from model import House


def ts_interfaces(text: str) -> dict[str, dict[str, bool]]:
    """Campos de primer nivel de cada interface de schema.ts -> {campo: opcional}.

    Los objetos inline (House.meta, Style.roof) se registran como "Interface.campo".
    """
    result: dict[str, dict[str, bool]] = {}
    stack: list[str] = []
    for line in text.splitlines():
        code = line.split("//")[0]
        if m := re.match(r"\s*export interface (\w+) \{", code):
            stack = [m.group(1)]
            result[stack[0]] = {}
            continue
        if not stack:
            continue
        if m := re.match(r"\s*(\w+)(\?)?:", code):
            result[stack[-1]][m.group(1)] = bool(m.group(2))
            if inline := re.search(r":\s*\{(.*)\}", code):  # objeto en una línea: roof: { type: ...; material: ... }
                fields = (re.match(r"\s*(\w+)(\?)?:", f) for f in inline.group(1).split(";"))
                result[f"{stack[0]}.{m.group(1)}"] = {f.group(1): bool(f.group(2)) for f in fields if f}
                continue
            if code.rstrip().endswith("{"):
                stack.append(f"{stack[0]}.{m.group(1)}")
                result[stack[-1]] = {}
                continue
        opened, closed = code.count("{"), code.count("}")
        for _ in range(closed - opened):
            stack.pop()
    return result


PYDANTIC = {
    "MaterialRef": model.MaterialRef,
    "Wall": model.Wall,
    "Opening": model.Opening,
    "Room": model.Room,
    "FurnitureItem": model.FurnitureItem,
    "Site": model.Site,
    "Uncertainty": model.Uncertainty,
    "ImageCalibration": model.ImageCalibration,
    "Style": model.Style,
    "Style.roof": model.Roof,
    "House": model.House,
    "House.meta": model.Meta,
}


def test_modelos_sincronizados_con_schema_ts():
    ts = ts_interfaces(SCHEMA_TS.read_text(encoding="utf-8"))
    assert set(ts) == set(PYDANTIC), "interfaces nuevas o borradas en schema.ts"
    for name, cls in PYDANTIC.items():
        py = {f: not info.is_required() for f, info in cls.model_fields.items()}
        assert py == ts[name], f"{name} difiere de schema.ts"


def test_el_ejemplo_parsea(example_raw):
    h = House.model_validate(example_raw)
    assert len(h.walls) == 7 and len(h.furniture) == 4


@pytest.mark.parametrize(
    "mutate",
    [
        lambda h: h["walls"][0].update(thicknes=0.2),  # typo: campo desconocido
        lambda h: h["walls"][0].update(status="nuevo"),
        lambda h: h["walls"][0].update(thickness=0),
        lambda h: h["style"]["facade"].update(color="rojo"),
        lambda h: h.update(version=4),
    ],
)
def test_rechaza_datos_invalidos(mutate):
    raw = raw_house(walls=[wall("w1", (0, 0), (4, 0))])
    mutate(raw)
    with pytest.raises(ValidationError):
        House.model_validate(raw)


def test_todos_los_modelos_prohiben_campos_extra():
    for cls in PYDANTIC.values():
        assert issubclass(cls, BaseModel) and cls.model_config.get("extra") == "forbid"
