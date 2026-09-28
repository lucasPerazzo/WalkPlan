"""Descarga texturas PBR (ambientCG, CC0), el HDRI de iluminación (Poly Haven, CC0) y los
modelos de muebles (Kenney Furniture Kit, CC0) a public/.

Uso, desde la raíz o desde viewer/:  python viewer/scripts/fetch_assets.py [--force]
Deja public/textures/<carpeta>/{color,normal,roughness}.jpg, public/hdri/<nombre>.hdr,
public/models/kenney/<modelo>.glb y los CREDITS.md.
Es idempotente: lo que ya está se saltea. Los archivos no se commitean (ver .gitignore).
"""

import argparse
import io
import re
import sys
import urllib.request
import zipfile
from pathlib import Path

PUBLIC = Path(__file__).resolve().parents[1] / "public"
UA = {"User-Agent": "walkthrough-viewer/0.1 (fetch_assets)"}

# carpeta -> assetId de ambientCG (1K-JPG). Las carpetas coinciden con src/scene/materials.ts.
TEXTURES = {
    "brick": "Bricks097",
    "plaster": "Plaster001",
    "stone": "Bricks075A",
    "concrete": "Concrete034",
    "wood_floor": "WoodFloor051",
    "wood": "Wood094",
    "tile": "Tiles141",
    "ceramic": "Tiles107",
    "metal": "Metal049A",
    # Terreno de los entornos (fase 5)
    "grass": "Grass004",
    "forest_floor": "Ground037",
    "asphalt": "Asphalt033",
    "sidewalk": "PavingStones128",
    "sand": "Ground080",
}
MAPS = {"_Color.jpg": "color.jpg", "_NormalGL.jpg": "normal.jpg", "_Roughness.jpg": "roughness.jpg"}

# nombre -> id de Poly Haven (1k .hdr). "sky" es el de respaldo; los demás, uno por preset de entorno
# (src/environment/presets.ts): solo iluminan y reflejan, el cielo visible es el procedural que sigue al sol.
HDRIS = {
    "sky": "kloofendal_48d_partly_cloudy_puresky",
    "forest": "epping_forest_01",
    "city": "wide_street_01",
    "suburb": "stuttgart_suburbs",
    "countryside": "belfast_open_field",
    "beach": "fish_hoek_beach",
}

# Kenney Furniture Kit 2.0: se extraen los 140 .glb (1.9 MB); src/furniture/catalog.ts elige cuáles usa.
KENNEY_PAGE = "https://kenney.nl/assets/furniture-kit"
KENNEY_ZIP = "https://kenney.nl/media/pages/assets/furniture-kit/440e0608a4-1677580847/kenney_furniture-kit.zip"
KENNEY_GLB_DIR = "Models/GLTF format/"


def get(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
        return r.read()


def fetch_texture(folder: str, asset: str, force: bool) -> str:
    dest = PUBLIC / "textures" / folder
    if not force and all((dest / name).exists() for name in MAPS.values()):
        return "ya estaba"
    data = get(f"https://ambientcg.com/get?file={asset}_1K-JPG.zip")
    dest.mkdir(parents=True, exist_ok=True)
    found = 0
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for info in z.infolist():
            for suffix, name in MAPS.items():
                if info.filename.endswith(suffix):
                    (dest / name).write_bytes(z.read(info))
                    found += 1
    if found != len(MAPS):
        raise RuntimeError(f"{asset}: faltan mapas en el zip ({found}/{len(MAPS)})")
    return f"{len(data) // 1024} KB"


def fetch_hdri(name: str, asset: str, force: bool) -> str:
    dest = PUBLIC / "hdri" / f"{name}.hdr"
    if dest.exists() and not force:
        return "ya estaba"
    data = get(f"https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/{asset}_1k.hdr")
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return f"{len(data) // 1024} KB"


def fetch_kenney(force: bool) -> str:
    dest = PUBLIC / "models" / "kenney"
    if not force and (dest / "License.txt").exists():
        return "ya estaba"
    # El link del zip lleva un hash que cambia con cada versión del kit: se toma de la página si se puede.
    try:
        found = re.search(rb'https://kenney\.nl/media/pages/assets/furniture-kit/[^"]+\.zip', get(KENNEY_PAGE))
        url = found.group(0).decode() if found else KENNEY_ZIP
    except Exception:
        url = KENNEY_ZIP
    data = get(url)
    dest.mkdir(parents=True, exist_ok=True)
    count = 0
    license_text = b"Kenney Furniture Kit - CC0 1.0 (www.kenney.nl)\n"
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for info in z.infolist():
            if info.filename.startswith(KENNEY_GLB_DIR) and info.filename.endswith(".glb"):
                (dest / info.filename.rsplit("/", 1)[-1]).write_bytes(z.read(info))
                count += 1
            elif info.filename.endswith("License.txt"):
                license_text = z.read(info)
    if count == 0:
        raise RuntimeError("el zip no trae modelos .glb")
    (dest / "License.txt").write_bytes(license_text)
    return f"{count} modelos, {len(data) // 1024} KB"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="volver a descargar todo")
    args = ap.parse_args()
    failed = False
    for folder, asset in TEXTURES.items():
        try:
            print(f"textura {folder:<11} {asset:<12} {fetch_texture(folder, asset, args.force)}")
        except Exception as exc:  # seguir con el resto: el visor usa color plano si falta una
            failed = True
            print(f"textura {folder:<11} {asset:<12} ERROR {exc}")
    for name, asset in HDRIS.items():
        try:
            print(f"hdri    {name:<11} {asset} {fetch_hdri(name, asset, args.force)}")
        except Exception as exc:
            failed = True
            print(f"hdri    {name:<11} {asset} ERROR {exc}")
    try:
        print(f"modelos kenney      furniture-kit {fetch_kenney(args.force)}")
    except Exception as exc:  # sin modelos el visor dibuja cajas con la clave
        failed = True
        print(f"modelos kenney      furniture-kit ERROR {exc}")

    (PUBLIC / "textures" / "CREDITS.md").write_text(
        "# Texturas\n\nTodas de [ambientCG](https://ambientcg.com), licencia CC0 1.0 (dominio público). "
        "Resolución 1K; se usan color, normal (GL) y roughness.\n\n| Carpeta | Asset |\n|---|---|\n"
        + "".join(f"| {f} | [{a}](https://ambientcg.com/view?id={a}) |\n" for f, a in TEXTURES.items()),
        encoding="utf-8",
    )
    (PUBLIC / "hdri").mkdir(parents=True, exist_ok=True)
    (PUBLIC / "hdri" / "CREDITS.md").write_text(
        "# HDRI\n\nDe [Poly Haven](https://polyhaven.com), licencia CC0 1.0. Resolución 1k.\n\n| Archivo | Asset |\n|---|---|\n"
        + "".join(f"| {n}.hdr | [{a}](https://polyhaven.com/a/{a}) |\n" for n, a in HDRIS.items()),
        encoding="utf-8",
    )
    (PUBLIC / "models").mkdir(parents=True, exist_ok=True)
    (PUBLIC / "models" / "CREDITS.md").write_text(
        "# Modelos de muebles\n\n"
        f"`kenney/`: [Furniture Kit 2.0]({KENNEY_PAGE}) de Kenney (www.kenney.nl), licencia CC0 1.0 "
        "(ver `kenney/License.txt`). El visor los recolorea por nombre de material (src/furniture/palette.ts).\n\n"
        "`bidet`, `bbq` y `lounger` no tienen modelo en el kit: se arman en código (src/furniture/procedural.ts).\n",
        encoding="utf-8",
    )
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
