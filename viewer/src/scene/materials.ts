import { Color, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, TextureLoader, type Side, type Texture } from 'three';
import type { MaterialKind, MaterialRef } from '../model/schema.ts';
import { assets } from './runtime.ts';

// Texturas PBR (ambientCG, CC0) en public/textures/<carpeta>/{color,normal,roughness}.jpg.
// Las baja viewer/scripts/fetch_assets.py; si faltan, el material queda en color plano.
export type Usage = 'floor' | 'surface' | 'roof'; // roof: la losa provisoria va en color plano

const FOLDER: Partial<Record<MaterialKind, string>> = {
  brick: 'brick',
  plaster: 'plaster',
  stone: 'stone',
  concrete: 'concrete',
  wood: 'wood',
  tile: 'tile',
  ceramic: 'ceramic',
  metal: 'metal',
};
// Metros que cubre una repetición de cada textura (las UV están en metros).
const TILE_METERS: Record<string, number> = {
  brick: 1.2,
  plaster: 2,
  stone: 1.5,
  concrete: 2,
  wood_floor: 1.6,
  wood: 1.2,
  tile: 1.6,
  ceramic: 0.6,
  metal: 1,
  // Terreno de los entornos
  grass: 2.5,
  forest_floor: 3,
  asphalt: 2.5,
  sidewalk: 3.5,
  sand: 3,
};
export const TINT = 0.35; // con textura, el color del schema tiñe suavemente (lerp desde blanco)

interface TextureSet {
  map: Texture;
  normalMap: Texture;
  roughnessMap: Texture;
}

const loader = new TextureLoader();
const sets = new Map<string, Promise<TextureSet | null>>();
let anisotropy = 4;

export function setMaxAnisotropy(n: number) {
  anisotropy = Math.min(8, n);
}

export function folderFor(kind: MaterialKind, usage: Usage): string | null {
  if (usage === 'roof') return null;
  if (kind === 'wood' && usage === 'floor') return 'wood_floor';
  return FOLDER[kind] ?? null;
}

export function tint(color: string, factor = TINT): Color {
  return new Color('#ffffff').lerp(new Color(color), factor);
}

function loadSet(folder: string): Promise<TextureSet | null> {
  let set = sets.get(folder);
  if (set) return set;
  const base = `${import.meta.env.BASE_URL}textures/${folder}/`;
  const size = TILE_METERS[folder] ?? 1;
  const one = (file: string, srgb: boolean) =>
    new Promise<Texture>((resolve, reject) =>
      loader.load(
        base + file,
        (t) => {
          t.wrapS = t.wrapT = RepeatWrapping;
          t.repeat.set(1 / size, 1 / size);
          t.anisotropy = anisotropy;
          if (srgb) t.colorSpace = SRGBColorSpace; // normal y roughness quedan lineales
          resolve(t);
        },
        undefined,
        reject,
      ),
    );
  assets.pending += 1;
  set = Promise.all([one('color.jpg', true), one('normal.jpg', false), one('roughness.jpg', false)])
    .then(([map, normalMap, roughnessMap]) => ({ map, normalMap, roughnessMap }))
    .catch(() => {
      console.info(`[texturas] falta ${folder}: color plano (correr viewer/scripts/fetch_assets.py)`);
      return null;
    })
    .finally(() => {
      assets.pending -= 1;
    });
  sets.set(folder, set);
  return set;
}

// Un material por MaterialRef + uso: color plano de entrada y texturas cuando cargan.
export class MaterialCache {
  private materials = new Map<string, MeshStandardMaterial>();

  get(ref: MaterialRef, usage: Usage, side?: Side): MeshStandardMaterial {
    const key = `${ref.material}|${ref.color}|${usage}|${side ?? ''}`;
    let m = this.materials.get(key);
    if (m) return m;
    const metallic = ref.material === 'metal' || ref.material === 'aluminum';
    m = new MeshStandardMaterial({ color: ref.color, roughness: metallic ? 0.4 : 0.85, metalness: metallic ? 0.6 : 0 });
    if (side !== undefined) m.side = side;
    if (usage === 'floor') {
      // Pisos a 1 mm del suelo exterior: sin este desplazamiento pelean en profundidad a pocos metros.
      m.polygonOffset = true;
      m.polygonOffsetFactor = -1;
      m.polygonOffsetUnits = -4;
    }
    const folder = folderFor(ref.material, usage);
    const target = m;
    if (folder) {
      loadSet(folder).then((set) => {
        if (!set) return;
        target.map = set.map;
        target.normalMap = set.normalMap;
        target.roughnessMap = set.roughnessMap;
        target.roughness = 1;
        target.color.copy(tint(ref.color));
        target.needsUpdate = true;
      });
    }
    this.materials.set(key, m);
    return m;
  }

  // Terreno y calle de los entornos: con textura, el color del preset la tiñe suave (como en muros y pisos);
  // sin textura, es el color plano.
  // `lift` sube el material en profundidad (polygonOffset) para capas casi coplanares: suelo < calle < marcas.
  terrain(folder: string, color: string, lift = 0): MeshStandardMaterial {
    const key = `terrain|${folder}|${color}|${lift}`;
    let m = this.materials.get(key);
    if (m) return m;
    m = new MeshStandardMaterial({ color, roughness: 1 });
    if (lift) {
      m.polygonOffset = true;
      m.polygonOffsetFactor = -lift;
      m.polygonOffsetUnits = -4 * lift;
    }
    const target = m;
    loadSet(folder).then((set) => {
      if (!set) return;
      target.map = set.map;
      target.normalMap = set.normalMap;
      target.roughnessMap = set.roughnessMap;
      target.color.copy(tint(color));
      target.needsUpdate = true;
    });
    this.materials.set(key, m);
    return m;
  }

  dispose() {
    this.materials.forEach((m) => m.dispose()); // las texturas se comparten entre casas: no se liberan
    this.materials.clear();
  }
}
