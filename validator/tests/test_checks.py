from conftest import box_walls, item, make_house, opening, room, wall

import checks

BOX_ROOM = room("r1", [(0.1, 0.1), (3.9, 0.1), (3.9, 2.9), (0.1, 2.9)])


def codes(issues):
    return [i.code for i in issues]


# --- Errores ---


def test_ids_repetidos():
    h = make_house(walls=[wall("w1", (0, 0), (4, 0)), wall("w1", (4, 0), (4, 3))])
    assert codes(checks.check_unique_ids(h)) == ["duplicate_id"]
    assert checks.check_unique_ids(make_house(walls=box_walls())) == []


def test_abertura_en_pared_inexistente():
    h = make_house(walls=box_walls(), openings=[opening("o1", "w9", 1)])
    issues = checks.check_opening_walls(h)
    assert codes(issues) == ["opening_wall_missing"] and issues[0].ids == ["o1"]


def test_abertura_fuera_de_rango():
    ok = opening("o1", "w1", 3.1)  # 3.1 + 0.9 = 4.0: justo
    out = opening("o2", "w2", 2.5)  # w2 mide 3
    neg = opening("o3", "w3", -0.1)
    issues = checks.check_opening_ranges(make_house(walls=box_walls(), openings=[ok, out, neg]))
    assert [i.ids[0] for i in issues] == ["o2", "o3"]


def test_aberturas_superpuestas_salvo_demolish_con_new():
    h = make_house(
        walls=box_walls(),
        openings=[
            opening("o1", "w1", 1.0),
            opening("o2", "w1", 1.5),
            opening("o3", "w3", 1.0, status="demolish"),
            opening("o4", "w3", 1.0, status="new"),
        ],
    )
    issues = checks.check_opening_overlaps(h)
    assert len(issues) == 1 and issues[0].ids == ["o1", "o2"]


def test_abertura_mas_alta_que_la_pared_y_puerta_con_antepecho():
    h = make_house(
        walls=box_walls(),
        openings=[
            opening("o1", "w1", 1.0, type="window", sill=1.0, height=1.8),
            opening("o2", "w2", 1.0, sill=0.1, height=2.0),
        ],
    )
    assert [i.ids[0] for i in checks.check_opening_heights(h)] == ["o1"]
    assert [i.ids[0] for i in checks.check_door_sills(h)] == ["o2"]


def test_poligonos_de_ambientes():
    h = make_house(
        rooms=[
            BOX_ROOM,
            room("r2", [(0, 0), (0.5, 0), (0.5, 0.5), (0, 0.5)]),  # 0.25 m²
            room("r3", [(0, 0), (2, 2), (2, 0), (0, 2)]),  # moño: se autointersecta
            room("r4", [(0, 0), (0, 2), (2, 2), (2, 0)]),  # horario
        ]
    )
    issues = checks.check_room_polygons(h)
    assert [(i.code, i.ids[0]) for i in issues] == [
        ("room_area", "r2"),
        ("room_polygon", "r3"),
        ("room_orientation", "r4"),
    ]


def test_paredes_duplicadas_salvo_demolish_con_new():
    base = [wall("w1", (0, 0), (4, 0))]
    dup = make_house(walls=base + [wall("w2", (4, 0), (1, 0), thickness=0.3)])
    assert codes(checks.check_duplicate_walls(dup)) == ["duplicate_wall"]
    rebuilt = make_house(walls=[wall("w1", (0, 0), (4, 0), status="demolish"), wall("w2", (0, 0), (4, 0), status="new")])
    assert checks.check_duplicate_walls(rebuilt) == []
    chained = make_house(walls=base + [wall("w2", (4, 0), (8, 0))])  # colineales que solo se tocan
    assert checks.check_duplicate_walls(chained) == []


def test_lot_contiene_la_casa():
    inside = {"environment": "suburb", "north_deg": 0, "lot": [(-1, -1), (5, -1), (5, 4), (-1, 4)]}
    on_edge = {"environment": "suburb", "north_deg": 0, "lot": [(0, 0), (4, 0), (4, 3), (0, 3)]}  # medianeras
    small = {"environment": "suburb", "north_deg": 0, "lot": [(0, 0), (3, 0), (3, 3), (0, 3)]}
    assert checks.check_lot_contains_house(make_house(walls=box_walls(), site=inside)) == []
    assert checks.check_lot_contains_house(make_house(walls=box_walls(), site=on_edge)) == []
    issues = checks.check_lot_contains_house(make_house(walls=box_walls(), site=small))
    assert codes(issues) == ["lot_excludes_house"] and issues[0].ids == ["w1", "w2", "w3"]


def test_referencias_de_muebles(catalog):
    h = make_house(
        rooms=[BOX_ROOM],
        furniture=[item("f1", "sofa_3", (2, 1), room_id="r1"), item("f2", "trono", (2, 1)), item("f3", "chair", (1, 1), room_id="r9")],
    )
    issues = checks.check_furniture_refs(h, catalog)
    assert [(i.code, i.ids[0]) for i in issues] == [("furniture_catalog", "f2"), ("furniture_room", "f3")]


# --- Warnings ---


def test_extremos_sueltos_y_contorno_abierto():
    closed = make_house(walls=box_walls())
    assert checks.check_loose_exterior_ends(closed) == [] and checks.check_exterior_contour(closed) == []
    open_ = make_house(walls=box_walls()[:3])
    assert sorted(i.ids[0] for i in checks.check_loose_exterior_ends(open_)) == ["w1", "w3"]
    assert codes(checks.check_exterior_contour(open_)) == ["exterior_contour_open"]


def test_ambiente_fuera_del_contorno():
    near = room("r1", [(0, 0), (4.25, 0), (4.25, 3), (0, 3)])  # 0.25 afuera: tolerado
    far = room("r2", [(0, 0), (5, 0), (5, 3), (0, 3)])
    issues = checks.check_rooms_inside_contour(make_house(walls=box_walls(), rooms=[near, far]))
    assert [i.ids[0] for i in issues] == ["r2"]


def test_espesor_y_altura_fuera_de_rango():
    h = make_house(walls=[wall("w1", (0, 0), (4, 0), thickness=0.5), wall("w2", (4, 0), (4, 3), height=4.5)])
    assert [i.ids[0] for i in checks.check_wall_thickness(h)] == ["w1"]
    assert [i.ids[0] for i in checks.check_wall_height(h)] == ["w2"]


def test_abertura_nueva_en_pared_que_se_demuele():
    h = make_house(walls=[wall("w1", (0, 0), (4, 0), status="demolish")], openings=[opening("o1", "w1", 1, status="new")])
    assert codes(checks.check_new_openings_in_demolished_walls(h)) == ["new_opening_in_demolished_wall"]


def test_mueble_fuera_de_su_ambiente(catalog):
    inside = item("f1", "chair", (2, 1.5), room_id="r1")
    touching = item("f2", "chair", (3.7, 1.5), room_id="r1")  # sobresale 0.025: tolerado
    outside = item("f3", "sofa_3", (3.5, 1.5), room_id="r1")
    issues = checks.check_furniture_in_rooms(make_house(rooms=[BOX_ROOM], furniture=[inside, touching, outside]), catalog)
    assert [i.ids[0] for i in issues] == ["f3"]


def test_muebles_rotados_usan_la_huella_rotada(catalog):
    # wardrobe 1.20 × 0.60: a 90° ocupa 0.60 en x; contra la cara de w2 (x = 3.9) no choca.
    h = make_house(walls=box_walls(), furniture=[item("f1", "wardrobe", (3.6, 1.5), rotation=90)])
    assert checks.check_furniture_overlaps(h, catalog) == []
    h0 = make_house(walls=box_walls(), furniture=[item("f1", "wardrobe", (3.6, 1.5), rotation=0)])
    assert codes(checks.check_furniture_overlaps(h0, catalog)) == ["furniture_wall_overlap"]


def test_superposicion_de_muebles(catalog):
    h = make_house(
        furniture=[
            item("f1", "sofa_3", (2, 2)),
            item("f2", "armchair", (2.5, 2.2)),  # choca con el sofá
            item("f3", "rug", (2, 2)),  # sin collider
            item("f4", "kitchen_counter", (6, 2)),
            item("f5", "kitchen_upper", (6, 2.1)),  # colgada a 1.50: no choca con la mesada
            item("f6", "chair", (9, 2), status="demolish"),
            item("f7", "chair", (9, 2), status="new"),  # reemplaza a f6: no se ven juntas
        ]
    )
    issues = checks.check_furniture_overlaps(h, catalog)
    assert [i.ids for i in issues] == [["f1", "f2"]]


def test_mueble_en_el_barrido_de_una_puerta(catalog):
    walls = box_walls()
    door = opening("o1", "w1", 1.5)  # x 1.5–2.4 sobre y = 0
    blocked = item("f1", "chair", (1.95, 0.5))  # adentro
    blocked_out = item("f2", "chair", (1.95, -0.5))  # afuera: se consideran ambos lados
    free = item("f3", "chair", (1.95, 1.4))
    rug = item("f4", "rug", (1.95, 0.5))
    h = make_house(walls=walls, openings=[door], furniture=[blocked, blocked_out, free, rug])
    issues = checks.check_furniture_door_swings(h, catalog)
    assert [i.ids[0] for i in issues] == ["f1", "f2"]


def test_ventanas_no_tienen_barrido(catalog):
    win = opening("o1", "w1", 1.5, type="window", sill=0.9, height=1.1)
    h = make_house(walls=box_walls(), openings=[win], furniture=[item("f1", "chair", (1.95, 0.5))])
    assert checks.check_furniture_door_swings(h, catalog) == []
