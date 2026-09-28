// Medidas nominales del catálogo de muebles (ancho = x local, prof. = z local, alto), en metros.
// Copia de .claude/skills/house-schema/references/furniture-catalog.md: el contrato manda.
// catalog.test.ts verifica que coincidan.
//
// Cada clave dice de dónde sale su modelo 3D:
// - kenney: public/models/kenney/<archivo>.glb (Kenney Furniture Kit 2.0, CC0; lo baja fetch_assets.py).
//   `yaw` gira el archivo para que su frente quede hacia +Z antes de escalarlo a las medidas nominales.
//   `materials` reasigna nombres de material del archivo a otros de la paleta (palette.ts).
// - procedural: se arma en código con las medidas nominales (procedural.ts).

export type ProceduralModel = 'bidet' | 'bbq' | 'lounger';

export type ModelSource =
  | { source: 'kenney'; file: string; yaw: number; materials?: Record<string, string> }
  | { source: 'procedural'; name: ProceduralModel };

export interface CatalogEntry {
  width: number;
  depth: number;
  height: number;
  base: number; // altura de montaje (kitchen_upper cuelga a 1.50)
  collider: boolean; // rug: sin collider
  model: ModelSource;
}

export const SOURCES = {
  kenney: { name: 'Kenney Furniture Kit 2.0', license: 'CC0 1.0', url: 'https://kenney.nl/assets/furniture-kit' },
  procedural: { name: 'Modelo en código (src/furniture/procedural.ts)', license: 'propio', url: '' },
} as const;

const k = (file: string, yaw = 0, materials?: Record<string, string>): ModelSource => ({ source: 'kenney', file, yaw, materials });
const p = (name: ProceduralModel): ModelSource => ({ source: 'procedural', name });

// Loza sanitaria: el kit usa "carpetWhite" para sábanas y para loza.
const CERAMIC = { carpetWhite: 'porcelain', _defaultMat: 'porcelain' };
// Exterior: madera oscura tratada y tela de exterior.
const OUTDOOR = { wood: 'teak', carpetBlue: 'outdoorFabric', metal: 'metalDark' };
// Muebles bajos y altos de cocina: el kit usa "metal" para la mesada (y las manijas); va en piedra clara.
const KITCHEN = { metal: 'stone' };

const e = (width: number, depth: number, height: number, model: ModelSource, base = 0, collider = true): CatalogEntry => ({
  width,
  depth,
  height,
  base,
  collider,
  model,
});

export const CATALOG: Record<string, CatalogEntry> = {
  sofa_2: e(1.6, 0.9, 0.85, k('loungeDesignSofa')), // línea "design": recta, sin chaise (loungeSofaLong la trae)
  sofa_3: e(2.1, 0.9, 0.85, k('loungeDesignSofa')),
  armchair: e(0.85, 0.85, 0.85, k('loungeDesignChair')),
  coffee_table: e(1.1, 0.6, 0.45, k('tableCoffee')),
  tv_unit: e(1.8, 0.45, 0.55, k('cabinetTelevision')),
  rug: e(2.0, 1.4, 0.01, k('rugRectangle'), 0.0, false),
  table_dining_4: e(1.2, 0.8, 0.75, k('table')),
  table_dining_6: e(1.8, 0.9, 0.75, k('table')),
  chair: e(0.45, 0.5, 0.9, k('chairCushion')),
  bed_single: e(0.9, 2.0, 0.55, k('bedSingle')),
  bed_double: e(1.4, 2.0, 0.55, k('bedDouble')),
  bed_queen: e(1.6, 2.0, 0.55, k('bedDouble')),
  nightstand: e(0.45, 0.4, 0.55, k('sideTableDrawers')),
  wardrobe: e(1.2, 0.6, 2.1, k('bookcaseClosedDoors')),
  desk: e(1.2, 0.6, 0.75, k('desk')),
  desk_chair: e(0.6, 0.6, 1.0, k('chairDesk')),
  shelf: e(0.8, 0.35, 1.8, k('bookcaseOpen')),
  kitchen_counter: e(0.6, 0.6, 0.9, k('kitchenCabinetDrawer', 0, KITCHEN)),
  kitchen_upper: e(0.6, 0.35, 0.7, k('kitchenCabinetUpper', 0, KITCHEN), 1.5),
  fridge: e(0.7, 0.7, 1.8, k('kitchenFridgeLarge')),
  stove: e(0.6, 0.6, 0.9, k('kitchenStove')),
  sink_kitchen: e(0.8, 0.6, 0.9, k('kitchenSink')),
  toilet: e(0.4, 0.7, 0.8, k('toilet', 0, CERAMIC)),
  sink_bath: e(0.6, 0.45, 0.85, k('bathroomSink', 0, CERAMIC)),
  shower: e(0.9, 0.9, 2.0, k('shower', 0, CERAMIC)),
  bathtub: e(1.7, 0.75, 0.55, k('bathtub', 0, CERAMIC)),
  washing_machine: e(0.6, 0.6, 0.85, k('washer')),
  plant: e(0.5, 0.5, 1.2, k('pottedPlant')),
  lamp_floor: e(0.4, 0.4, 1.6, k('lampRoundFloor')),
  outdoor_table: e(1.6, 0.9, 0.75, k('tableCross', 0, OUTDOOR)),
  outdoor_chair: e(0.55, 0.55, 0.85, k('chairModernFrameCushion', 0, OUTDOOR)),
  lounger: e(0.7, 1.9, 0.4, p('lounger')),
  bbq: e(1.2, 0.6, 1.0, p('bbq')),
  sofa_4: e(3.0, 0.95, 0.85, k('loungeDesignSofa')),
  bed_king: e(1.8, 2.0, 0.55, k('bedDouble')),
  table_dining_8: e(2.4, 1.0, 0.75, k('table')),
  kitchen_island: e(2.1, 0.65, 0.9, k('kitchenBar', 0, KITCHEN)),
  stool: e(0.4, 0.4, 0.65, k('stoolBar')),
  sideboard: e(1.6, 0.5, 0.85, k('cabinetTelevisionDoors')),
  tall_cabinet: e(0.6, 0.6, 2.1, k('kitchenFridgeBuiltIn')),
  bidet: e(0.4, 0.55, 0.4, p('bidet')),
  bench: e(1.2, 0.45, 0.45, k('bench')),
};

export const CATALOG_KEYS = Object.keys(CATALOG).sort();
