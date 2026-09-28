from catalog import parse_catalog


def test_catalogo_real_completo(catalog):
    assert len(catalog) == 42
    sofa = catalog["sofa_3"]
    assert (sofa.width, sofa.depth, sofa.height) == (2.10, 0.90, 0.85)
    assert catalog["kitchen_upper"].base == 1.5
    assert catalog["rug"].collider is False
    assert catalog["bed_double"].collider is True and catalog["bed_double"].base == 0.0


def test_ignora_encabezado_separador_y_texto():
    text = """
# Título
| Clave | Ancho | Prof. | Alto | Notas |
|---|---|---|---|---|
| foo | 1.00 | 0.50 | 0.40 | colgante, base a 1,20 m |
Texto suelto | con barras
"""
    cat = parse_catalog(text)
    assert list(cat) == ["foo"]
    assert cat["foo"].base == 1.2
