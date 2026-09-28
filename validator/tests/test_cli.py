import json
import subprocess
import sys

import matplotlib.pyplot as plt
import numpy as np
from conftest import EXAMPLE_PATH, ROOT, VALIDATOR

from validate_house import main, validate


def write(path, data):
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


def read_report(out):
    return json.loads((out.parent / "report.json").read_text(encoding="utf-8"))


def test_ejemplo_sin_errores_ni_warnings(tmp_path):
    out = tmp_path / "house.json"
    assert main([str(EXAMPLE_PATH), "--out", str(out)]) == 0
    report = read_report(out)
    assert report["ok"] and report["errors"] == [] and report["warnings"] == []
    assert report["output"] == str(out)
    assert json.loads(out.read_text(encoding="utf-8"))["version"] == 3


def test_validar_la_salida_no_genera_correcciones(tmp_path, example_raw, catalog):
    out = tmp_path / "house.json"
    main([str(EXAMPLE_PATH), "--out", str(out)])
    house, report = validate(json.loads(out.read_text(encoding="utf-8")), catalog)
    assert report.ok and report.corrections == [] and report.warnings == []


def test_con_errores_sale_1_y_no_escribe_out(tmp_path, example_raw):
    example_raw["openings"][2]["offset"] = 4.5  # o3 se sale de w7 (5 m)
    out = tmp_path / "house.json"
    assert main([str(write(tmp_path / "in.json", example_raw)), "--out", str(out)]) == 1
    assert not out.exists()
    report = read_report(out)
    assert not report["ok"] and report["output"] is None
    assert [(e["code"], e["ids"][0]) for e in report["errors"]] == [("opening_out_of_range", "o3")]


def test_error_de_schema_con_ruta_e_id(tmp_path, example_raw):
    example_raw["walls"][3]["thickness"] = -1
    out = tmp_path / "house.json"
    assert main([str(write(tmp_path / "in.json", example_raw)), "--out", str(out)]) == 1
    error = read_report(out)["errors"][0]
    assert error["code"] == "schema" and error["ids"] == ["w4"]
    assert error["message"].startswith("walls[3].thickness:")


def test_un_v1_y_un_v2_se_migran_hasta_v3(tmp_path, example_raw):
    for version in (1, 2):
        raw = dict(example_raw, version=version)
        if version == 1:
            del raw["furniture"], raw["site"]
        out = tmp_path / f"house{version}.json"
        assert main([str(write(tmp_path / f"in{version}.json", raw)), "--out", str(out)]) == 0
        assert json.loads(out.read_text(encoding="utf-8"))["version"] == 3


def test_latitud_fuera_de_rango_es_error(tmp_path, example_raw):
    example_raw["site"]["latitude"] = -134.9
    out = tmp_path / "house.json"
    assert main([str(write(tmp_path / "in.json", example_raw)), "--out", str(out)]) == 1
    assert read_report(out)["errors"][0]["message"].startswith("site.latitude")


def test_json_roto(tmp_path):
    bad = tmp_path / "in.json"
    bad.write_text('{"version": 2,', encoding="utf-8")
    out = tmp_path / "house.json"
    assert main([str(bad), "--out", str(out)]) == 1
    assert read_report(out)["errors"][0]["code"] == "read_error"


def test_warnings_salen_0(tmp_path, example_raw):
    example_raw["walls"][0]["thickness"] = 0.5
    out = tmp_path / "house.json"
    assert main([str(write(tmp_path / "in.json", example_raw)), "--out", str(out)]) == 0
    assert out.exists() and read_report(out)["warnings"][0]["code"] == "wall_thickness"


def test_preview_sobre_la_lamina(tmp_path, example_raw):
    image = tmp_path / "planta.png"
    plt.imsave(image, np.ones((400, 600, 3)))
    example_raw["meta"]["image_calibration"] = {"sheet": "planta.png", "px_per_m": 50, "origin_px": [80, 350]}
    overlay = tmp_path / "overlay.png"
    args = [str(write(tmp_path / "in.json", example_raw)), "--out", str(tmp_path / "house.json")]
    assert main(args + ["--preview", str(image), "--preview-out", str(overlay)]) == 0
    drawn = plt.imread(overlay)
    assert drawn.shape[:2] == (400, 600)
    assert drawn[:, :, :3].std() > 0.01  # se dibujó algo sobre la imagen en blanco


def test_preview_sin_calibracion_avisa_y_no_falla(tmp_path, capsys):
    image = tmp_path / "planta.png"
    plt.imsave(image, np.ones((10, 10, 3)))
    overlay = tmp_path / "overlay.png"
    args = [str(EXAMPLE_PATH), "--out", str(tmp_path / "house.json"), "--preview", str(image), "--preview-out", str(overlay)]
    assert main(args) == 0
    assert "Preview no generado" in capsys.readouterr().out and not overlay.exists()


def test_se_puede_correr_como_script_desde_la_raiz(tmp_path):
    out = tmp_path / "house.json"
    result = subprocess.run(
        [sys.executable, str(VALIDATOR / "validate_house.py"), str(EXAMPLE_PATH), "--out", str(out)],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert out.exists()
