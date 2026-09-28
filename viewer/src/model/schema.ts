// Copia de .claude/skills/house-schema/references/schema.ts (fuente de verdad).
// Si cambia el schema, se actualiza allá primero y después se copia acá.

// house.json — schema v3
// Unidades: metros. Colores: hex "#rrggbb". Ángulos: grados, antihorario visto en planta.
// Coordenadas del plano: origen en la esquina inferior izquierda del contorno
// exterior de la casa; x hacia la derecha, y hacia arriba de la lámina.
// Mapeo a Three.js: (x, y) → (x, altura, -y).
//
// Cambios v1 → v2: se agregan `furniture` y `site`.
// Cambios v2 → v3: se agrega `site.latitude` (opcional). Un JSON v2 se migra solo cambiando version.

export type Status = "existing" | "new" | "demolish";

export type MaterialKind =
  | "brick" | "plaster" | "stone" | "concrete" | "wood" | "tile"
  | "ceramic" | "metal" | "glass" | "pvc" | "aluminum";

export interface MaterialRef {
  material: MaterialKind;
  color: string;          // "#rrggbb", estimado en zonas bien iluminadas
  notes?: string;         // detalle libre, ej: "ladrillo visto, junta rehundida"
}

export type Point = [number, number];

export interface Wall {
  id: string;             // "w1", "w2"...
  start: Point;           // sobre el EJE de la pared
  end: Point;
  thickness: number;
  height: number;
  kind: "exterior" | "interior";
  status: Status;
}

export interface Opening {
  id: string;             // "o1", "o2"...
  wall: string;           // id de la pared que la contiene
  type: "door" | "window" | "sliding_door" | "opening"; // opening = vano sin carpintería
  offset: number;         // desde wall.start hasta el borde del vano más cercano, sobre el eje
  width: number;
  height: number;
  sill: number;           // antepecho; 0 en door / sliding_door
  status: Status;
}

export interface Room {
  id: string;             // "r1", "r2"...
  name: string;           // nombre tal como figura en el plano
  polygon: Point[];       // antihorario, sin repetir el primer punto
  floor: MaterialRef;
  status: Status;
}

export interface FurnitureItem {
  id: string;             // "f1", "f2"...
  room?: string;          // id del room; ausente = exterior
  catalog: string;        // clave de references/furniture-catalog.md
  position: Point;        // centro de la huella, en coordenadas del plano
  rotation: number;       // grados antihorario. 0 = el frente del mueble mira hacia -y del plano (abajo en la lámina)
  scale?: number;         // default 1; usar solo si el mueble real difiere mucho de las medidas nominales
  color?: string;         // tinte opcional "#rrggbb"
  status: Status;         // existing = mueble que ya tenés y queda; new = propuesto
  source: "plan" | "render" | "suggested" | "user";
}

export type EnvironmentPreset = "forest" | "city" | "suburb" | "countryside" | "beach";

export interface Site {
  environment: EnvironmentPreset; // entorno por defecto al abrir el visor (se puede cambiar en runtime)
  north_deg: number;              // norte medido antihorario desde +y del plano (0 = norte arriba de la lámina)
  latitude?: number;              // grados, negativa al sur del ecuador; orienta el recorrido del sol
  street_edge?: [Point, Point];   // límite frontal del terreno sobre la calle (la calle queda del lado derecho de start→end)
  lot?: Point[];                  // polígono del terreno, antihorario
}

export interface Uncertainty {
  element_id?: string;    // id afectado, si aplica
  note: string;           // qué se asumió y por qué
  confidence: "low" | "medium";
}

export interface ImageCalibration {
  sheet: string;          // nombre de la lámina / archivo de imagen
  px_per_m: number;
  origin_px: [number, number]; // píxel (x, y) de la imagen que corresponde al origen del plano
}

export interface Style {
  facade: MaterialRef;
  facade_secondary?: MaterialRef;
  interior_walls: MaterialRef;
  window_frames: MaterialRef;
  doors: MaterialRef;
  roof: { type: "flat" | "gable" | "hip" | "shed"; material: MaterialRef };
  exterior_floor?: MaterialRef;
}

export interface House {
  version: 3;
  meta: {
    source: string;              // láminas usadas
    scale_reference: string;     // cota usada para escalar, ej "frente 8.40 m"
    default_wall_height: number;
    image_calibration?: ImageCalibration;
    uncertainties: Uncertainty[];
  };
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  furniture: FurnitureItem[];    // puede ser [] (casa sin amueblar)
  site: Site;
  style: Style;
}
