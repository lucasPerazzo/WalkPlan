import { CATALOG } from '../furniture/catalog.ts';
import type { FurnitureItem, House, Point, Room } from '../model/schema.ts';

// Operaciones del editor en planta. Todas devuelven un array nuevo (el estado de React no se muta)
// y marcan lo tocado con source "user". Nunca tocan la geometría de la casa.

export const ROTATE_STEP = 15;

const round = (v: number, digits: number) => Number(v.toFixed(digits));

// Huella rotada en el plano, antihoraria: ancho × profundidad × scale; con rotation 0 el frente mira a -y.
// Igual que furniture_footprint del validador.
export function footprint(item: FurnitureItem): Point[] {
  const entry = CATALOG[item.catalog];
  if (!entry) return [];
  const s = item.scale ?? 1;
  const hw = (entry.width * s) / 2;
  const hd = (entry.depth * s) / 2;
  const r = (item.rotation * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const [x, y] = item.position;
  const corner = (u: number, v: number): Point => [x + u * cos - v * sin, y + u * sin + v * cos];
  return [corner(-hw, -hd), corner(hw, -hd), corner(hw, hd), corner(-hw, hd)];
}

// Dirección del frente en el plano.
export function frontOf(rotation: number): Point {
  const r = (rotation * Math.PI) / 180;
  return [Math.sin(r), -Math.cos(r)];
}

export function pointInPolygon([px, py]: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const area = (poly: Point[]) =>
  Math.abs(poly.reduce((a, [x0, y0], i) => {
    const [x1, y1] = poly[(i + 1) % poly.length];
    return a + x0 * y1 - x1 * y0;
  }, 0)) / 2;

// El mueble bajo el punto; si hay varios (alfombra bajo la mesa), el de huella más chica.
export function hitFurniture(p: Point, items: FurnitureItem[]): string | null {
  let best: { id: string; area: number } | null = null;
  for (const item of items) {
    const poly = footprint(item);
    if (poly.length === 0 || !pointInPolygon(p, poly)) continue;
    const a = area(poly);
    if (!best || a < best.area) best = { id: item.id, area: a };
  }
  return best?.id ?? null;
}

// Ambiente que contiene el punto (el más chico si se superponen); undefined = exterior.
export function roomAt(p: Point, rooms: Room[]): string | undefined {
  let best: { id: string; area: number } | undefined;
  for (const r of rooms) {
    if (r.polygon.length < 3 || !pointInPolygon(p, r.polygon)) continue;
    const a = area(r.polygon);
    if (!best || a < best.area) best = { id: r.id, area: a };
  }
  return best?.id;
}

export function nextFurnitureId(items: FurnitureItem[]): string {
  const max = items.reduce((m, f) => Math.max(m, Number(/^f(\d+)$/.exec(f.id)?.[1] ?? 0)), 0);
  return `f${max + 1}`;
}

export const normalizeAngle = (deg: number) => round(((deg % 360) + 360) % 360, 1);
export const snapAngle = (deg: number, step = ROTATE_STEP) => normalizeAngle(Math.round(deg / step) * step);

function withRoom(item: FurnitureItem, rooms: Room[]): FurnitureItem {
  const out = { ...item };
  const room = roomAt(item.position, rooms);
  if (room) out.room = room;
  else delete out.room; // ausente = exterior
  return out;
}

const update = (items: FurnitureItem[], id: string, change: (f: FurnitureItem) => FurnitureItem) =>
  items.map((f) => (f.id === id ? { ...change(f), source: 'user' as const } : f));

export function moveFurniture(items: FurnitureItem[], id: string, to: Point, rooms: Room[]): FurnitureItem[] {
  return update(items, id, (f) => withRoom({ ...f, position: [round(to[0], 3), round(to[1], 3)] }, rooms));
}

export function rotateFurniture(items: FurnitureItem[], id: string, rotation: number): FurnitureItem[] {
  return update(items, id, (f) => ({ ...f, rotation: normalizeAngle(rotation) }));
}

export function addFurniture(items: FurnitureItem[], catalog: string, at: Point, rooms: Room[]): { items: FurnitureItem[]; id: string } {
  const id = nextFurnitureId(items);
  const item = withRoom(
    { id, catalog, position: [round(at[0], 3), round(at[1], 3)], rotation: 0, status: 'new', source: 'user' },
    rooms,
  );
  return { items: [...items, item], id };
}

export function deleteFurniture(items: FurnitureItem[], id: string): FurnitureItem[] {
  return items.filter((f) => f.id !== id);
}

// house.json con el bloque furniture del editor; el resto queda como se cargó.
export function exportHouse(house: House, furniture: FurnitureItem[]): string {
  return `${JSON.stringify({ ...house, furniture }, null, 2)}\n`;
}
