import { Shape, ShapeGeometry, Vector2 } from 'three';
import type { Point, Room } from '../model/schema.ts';

export function polygonArea(polygon: Point[]): number {
  let a = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x0, y0] = polygon[i];
    const [x1, y1] = polygon[(i + 1) % polygon.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2; // positiva si es antihorario
}

export function roomProblem(room: Room): string | null {
  const poly = room.polygon;
  if (!Array.isArray(poly) || poly.length < 3) return 'polígono con menos de 3 puntos';
  const ok = poly.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => Number.isFinite(n)));
  if (!ok) return 'coordenadas inválidas';
  if (Math.abs(polygonArea(poly)) < 1e-4) return 'polígono de área nula';
  return null;
}

// Shape con los puntos del plano, rotada -π/2 en X: (x, y) → (x, 0, -y) con la normal hacia +Y.
// ShapeGeometry invierte los polígonos horarios, así que la normal queda hacia arriba igual.
export function floorGeometry(polygon: Point[]): ShapeGeometry {
  const shape = new Shape(polygon.map(([x, y]) => new Vector2(x, y)));
  const geometry = new ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}
