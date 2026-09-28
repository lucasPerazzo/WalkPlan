import pytest
from conftest import box_walls, item, make_house, opening, raw_house, room, wall

from corrections import (
    fill_wall_heights,
    merge_endpoints,
    migrate_v1,
    migrate_v2,
    normalize_polygons,
    remove_short_walls,
    snap_to_grid,
    split_t_junctions,
)
from geometry import point_at


def by_id(items, id):
    return next(x for x in items if x.id == id)


# --- JSON crudo ---


def test_migrate_v1_agrega_furniture_y_site():
    raw = raw_house()
    raw["version"] = 1
    del raw["furniture"], raw["site"]
    out, fixes = migrate_v1(raw)
    assert out["version"] == 2 and out["furniture"] == []
    assert out["site"] == {"environment": "suburb", "north_deg": 0}
    assert len(fixes) == 1 and raw["version"] == 1  # no muta la entrada


def test_migrate_v1_no_toca_v3():
    raw = raw_house()
    assert migrate_v1(raw) == (raw, [])


def test_migrate_v2_a_v3_solo_cambia_la_version():
    raw = raw_house()
    raw["version"] = 2
    out, fixes = migrate_v2(raw)
    assert out["version"] == 3 and raw["version"] == 2
    assert {k: v for k, v in out.items() if k != "version"} == {k: v for k, v in raw.items() if k != "version"}
    assert [f.code for f in fixes] == ["migrate_v2"]
    assert migrate_v2(out) == (out, [])


def test_fill_wall_heights_usa_el_default():
    raw = raw_house(walls=[wall("w1", (0, 0), (4, 0)), wall("w2", (4, 0), (4, 3))])
    del raw["walls"][1]["height"]
    raw["meta"]["default_wall_height"] = 2.7
    out, fixes = fill_wall_heights(raw)
    assert out["walls"][1]["height"] == 2.7 and out["walls"][0]["height"] == 2.6
    assert fixes[0].ids == ["w2"] and "height" not in raw["walls"][1]


# --- Unir extremos ---


def test_merge_endpoints_une_al_promedio():
    h = make_house(walls=[wall("w1", (0, 0), (4, 0)), wall("w2", (4.04, 0.02), (4, 3))])
    out, fixes = merge_endpoints(h, 0.10)
    assert tuple(by_id(out.walls, "w1").end) == (4.02, 0.01)
    assert tuple(by_id(out.walls, "w2").start) == (4.02, 0.01)
    assert fixes[0].code == "merge_endpoints" and fixes[0].ids == ["w1", "w2"]
    assert tuple(h.walls[1].start) == (4.04, 0.02)  # entrada intacta


def test_merge_endpoints_respeta_la_tolerancia():
    h = make_house(walls=[wall("w1", (0, 0), (4, 0)), wall("w2", (4.2, 0), (4.2, 3))])
    out, fixes = merge_endpoints(h, 0.10)
    assert fixes == [] and out.walls == h.walls


def test_mover_el_start_conserva_la_posicion_de_las_aberturas():
    h = make_house(
        walls=[wall("w4", (0, 3), (0, 0)), wall("w1", (0.06, 0), (4, 0))],
        openings=[opening("o1", "w1", 1.44)],
    )
    before = point_at(h.walls[1], 1.44)
    out, _ = merge_endpoints(h, 0.10)
    w1 = by_id(out.walls, "w1")
    assert w1.start[0] == pytest.approx(0.03)
    assert point_at(w1, out.openings[0].offset) == pytest.approx(before)


# --- Grilla ---


def test_snap_a_grilla_paredes_rooms_y_sitio_pero_no_muebles():
    h = make_house(
        walls=[wall("w1", (0.02, 0), (3.98, 0))],
        rooms=[room("r1", [(0.1, 0.1), (3.93, 0.1), (3.93, 2.9)])],
        furniture=[item("f1", "chair", (1.23, 1.37))],
        site={"environment": "city", "north_deg": 0, "lot": [(-2.02, -3), (10, -3), (10, 12)]},
    )
    out, fixes = snap_to_grid(h, 0.05)
    assert tuple(out.walls[0].start) == (0.0, 0.0) and tuple(out.walls[0].end) == (4.0, 0.0)
    assert tuple(out.rooms[0].polygon[1]) == (3.95, 0.1)
    assert tuple(out.site.lot[0]) == (-2.0, -3.0)
    assert tuple(out.furniture[0].position) == (1.23, 1.37)
    assert {f.ids[0] for f in fixes} == {"w1", "r1", "site"}


def test_snap_con_grilla_cero_no_hace_nada():
    h = make_house(walls=[wall("w1", (0.02, 0), (3.98, 0))])
    assert snap_to_grid(h, 0) == (h, [])


# --- Paredes cortas ---


def test_remove_short_walls():
    h = make_house(walls=[wall("w1", (0, 0), (4, 0)), wall("w2", (4, 0), (4, 0.04))])
    out, fixes = remove_short_walls(h)
    assert [w.id for w in out.walls] == ["w1"]
    assert fixes[0].code == "remove_short_wall" and fixes[0].ids == ["w2"]


# --- Encuentros en T ---


def t_house(stem_end=(4, 0), openings=()):
    """Pasante w1 de (0,0) a (8,0); tallo w9 que baja desde (4,5)."""
    return make_house(
        walls=[wall("w1", (0, 0), (8, 0)), wall("w9", (4, 5), stem_end, thickness=0.14, kind="interior")],
        openings=list(openings),
    )


def test_split_t_parte_la_pasante_y_reasigna_aberturas():
    h = t_house(openings=[opening("o1", "w1", 1.0), opening("o2", "w1", 6.0, width=1.2)])
    out, fixes, errors = split_t_junctions(h, 0.10)
    assert errors == []
    w1, w10 = by_id(out.walls, "w1"), by_id(out.walls, "w10")
    assert tuple(w1.end) == (4.0, 0.0) and tuple(w10.start) == (4.0, 0.0) and tuple(w10.end) == (8.0, 0.0)
    assert (w10.thickness, w10.kind, w10.status) == (w1.thickness, w1.kind, w1.status)
    o1, o2 = by_id(out.openings, "o1"), by_id(out.openings, "o2")
    assert (o1.wall, o1.offset) == ("w1", 1.0)
    assert (o2.wall, o2.offset) == ("w10", 2.0)
    assert fixes[0].code == "split_t" and fixes[0].ids == ["w9", "w1", "w10"]


def test_split_t_extiende_un_tallo_dibujado_hasta_la_cara():
    out, fixes, _ = split_t_junctions(t_house(stem_end=(4, 0.1)), 0.05)
    assert tuple(by_id(out.walls, "w9").end) == (4.0, 0.0)
    assert "extendida 0.100 m" in fixes[0].message


def test_split_t_abertura_que_cruza_el_nodo_es_error():
    out, _, errors = split_t_junctions(t_house(openings=[opening("o1", "w1", 3.5)]), 0.10)
    assert [e.code for e in errors] == ["opening_crosses_t"] and errors[0].ids == ["o1"]
    assert out.openings == []


def test_split_t_no_toca_esquinas_ni_colineales():
    h = make_house(walls=box_walls() + [wall("w5", (4, 0), (6, 0))])
    out, fixes, errors = split_t_junctions(h, 0.10)
    assert fixes == [] and errors == [] and len(out.walls) == 5


def test_split_t_es_idempotente():
    once, _, _ = split_t_junctions(t_house(), 0.10)
    twice, fixes, _ = split_t_junctions(once, 0.10)
    assert fixes == [] and twice.walls == once.walls


# --- Polígonos ---


def test_normalize_polygons_orienta_y_quita_el_cierre():
    cw_closed = [(0, 0), (0, 3), (4, 3), (4, 0), (0, 0)]
    h = make_house(
        rooms=[room("r1", cw_closed)],
        site={"environment": "suburb", "north_deg": 0, "lot": cw_closed},
    )
    out, fixes = normalize_polygons(h)
    assert [tuple(p) for p in out.rooms[0].polygon] == [(4, 0), (4, 3), (0, 3), (0, 0)]
    assert [tuple(p) for p in out.site.lot] == [(4, 0), (4, 3), (0, 3), (0, 0)]
    assert {f.ids[0] for f in fixes} == {"r1", "site.lot"}
    assert "antihorario" in fixes[0].message and "cierre" in fixes[0].message


def test_normalize_polygons_no_toca_uno_correcto():
    h = make_house(rooms=[room("r1", [(0, 0), (4, 0), (4, 3), (0, 3)])])
    out, fixes = normalize_polygons(h)
    assert fixes == [] and out.rooms == h.rooms
