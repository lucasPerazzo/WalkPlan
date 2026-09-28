import type { Point, Room, Wall } from '../model/schema.ts';

// Rectángulo en coordenadas del plano.
export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function houseBounds(walls: Wall[], rooms: Room[]): Bounds {
  const b: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const grow = ([x, y]: Point, pad = 0) => {
    b.minX = Math.min(b.minX, x - pad);
    b.minY = Math.min(b.minY, y - pad);
    b.maxX = Math.max(b.maxX, x + pad);
    b.maxY = Math.max(b.maxY, y + pad);
  };
  for (const w of walls) {
    grow(w.start, w.thickness / 2);
    grow(w.end, w.thickness / 2);
  }
  for (const r of rooms) r.polygon.forEach((p) => grow(p));
  if (!Number.isFinite(b.minX)) return { minX: -1, minY: -1, maxX: 1, maxY: 1 };
  return b;
}

export const boundsCenter = (b: Bounds): Point => [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
export const boundsSize = (b: Bounds): Point => [b.maxX - b.minX, b.maxY - b.minY];
