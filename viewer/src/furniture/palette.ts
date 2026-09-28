import { Color, MeshStandardMaterial } from 'three';

// Los modelos de Kenney traen colores de juguete con nombres fijos (carpet, wood, metal...).
// Se reemplazan por una paleta realista tomada del Idea Book: roble, nogal, telas gris cálido, loza.
// Un nombre que no está acá se dibuja con FALLBACK.
interface Finish {
  color: string;
  roughness: number;
  metalness?: number;
  opacity?: number; // < 1: transparente (vidrios)
  fabric?: boolean; // recibe el color opcional del mueble (FurnitureItem.color)
}

export const PALETTE: Record<string, Finish> = {
  carpet: { color: '#9b948a', roughness: 0.95, fabric: true }, // tapizado gris cálido
  carpetBlue: { color: '#a39c92', roughness: 0.95, fabric: true }, // línea "design" (sofás del living)
  carpetDarker: { color: '#7d7266', roughness: 0.95, fabric: true },
  carpetWhite: { color: '#ece8df', roughness: 0.9 }, // ropa de cama
  wood: { color: '#a57c52', roughness: 0.7 }, // roble
  woodDark: { color: '#6b4a33', roughness: 0.7 }, // nogal
  metal: { color: '#a3a6a8', roughness: 0.4, metalness: 0.5 },
  metalLight: { color: '#dfe1e0', roughness: 0.35, metalness: 0.3 }, // electrodomésticos
  metalMedium: { color: '#8d9195', roughness: 0.4, metalness: 0.4 },
  metalDark: { color: '#34373a', roughness: 0.5, metalness: 0.3 },
  glass: { color: '#c8dde3', roughness: 0.05, opacity: 0.3 },
  plant: { color: '#56794a', roughness: 0.85 },
  lamp: { color: '#efe6d2', roughness: 0.9 }, // pantalla
  _defaultMat: { color: '#f0efeb', roughness: 0.5 },
  // Reasignaciones por clave (catalog.ts)
  porcelain: { color: '#f4f3ef', roughness: 0.15 },
  porcelainInner: { color: '#d8d7d2', roughness: 0.15 },
  stone: { color: '#e3ddd3', roughness: 0.45 }, // mesada
  teak: { color: '#6e5440', roughness: 0.8 },
  outdoorFabric: { color: '#d9d2c5', roughness: 0.95, fabric: true },
  brick: { color: '#9a5b43', roughness: 0.9 }, // parrillero
};
const FALLBACK: Finish = { color: '#b5ada3', roughness: 0.85 };

export const finish = (name: string): Finish => PALETTE[name] ?? FALLBACK;
export const isFabric = (name: string) => finish(name).fabric === true;

// Color de instancia de una tela: el shader multiplica el color del material por el de la instancia,
// así que para que la tela quede del color del mueble se divide por el de la paleta. Sin color: blanco.
// (Las telas no tienen textura: como en materials.ts, el color del schema se usa directo.)
export function fabricInstanceColor(name: string, color: string | undefined): Color {
  const out = new Color(1, 1, 1);
  if (!color) return out;
  const base = new Color(finish(name).color);
  const target = new Color(color);
  return out.setRGB(target.r / Math.max(base.r, 0.01), target.g / Math.max(base.g, 0.01), target.b / Math.max(base.b, 0.01));
}

// Un material por nombre de la paleta; se liberan con dispose().
export class PaletteMaterials {
  private materials = new Map<string, MeshStandardMaterial>();

  get(name: string): MeshStandardMaterial {
    let m = this.materials.get(name);
    if (m) return m;
    const f = finish(name);
    m = new MeshStandardMaterial({ color: f.color, roughness: f.roughness, metalness: f.metalness ?? 0 });
    if (f.opacity !== undefined) {
      m.transparent = true;
      m.opacity = f.opacity;
      m.depthWrite = false;
    }
    this.materials.set(name, m);
    return m;
  }

  dispose() {
    this.materials.forEach((m) => m.dispose());
    this.materials.clear();
  }
}
