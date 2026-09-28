import { roofOutlines } from '../geometry/contour.ts';
import { filterByView } from '../geometry/filterByView.ts';
import { pointInPolygon } from '../geometry/furnitureEdit.ts';
import type { House, Point, Room, Site } from '../model/schema.ts';

// Zona donde el entorno nunca pone nada: el terreno (site.lot) si existe; si no, el contorno de la casa
// más todos los ambientes (galerías, pérgolas y porches quedan fuera del contorno) con 3 m de margen.
export const HOUSE_MARGIN = 3;

export interface KeepOut {
  polygons: Point[][];
  margin: number; // distancia libre alrededor de los polígonos
}

export interface Rect {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function keepOut(site: Site | undefined, outlines: Point[][], rooms: Room[]): KeepOut {
  if (site?.lot && site.lot.length >= 3) return { polygons: [site.lot], margin: 0 };
  return { polygons: [...outlines, ...rooms.map((r) => r.polygon)].filter((p) => p.length >= 3), margin: HOUSE_MARGIN };
}

// La de la casa: contornos de las dos vistas (actual y reforma) y todos los ambientes, así el entorno
// no cambia al pasar de una vista a la otra.
export function houseKeepOut(house: House): KeepOut {
  const outlines = (['reforma', 'actual'] as const).flatMap((m) => roofOutlines(filterByView(house, m).walls));
  return keepOut(house.site, outlines, house.rooms);
}

function distToSegment([px, py]: Point, [ax, ay]: Point, [bx, by]: Point): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(ax + dx * t - px, ay + dy * t - py);
}

// Distancia al borde del polígono, negativa adentro.
export function signedDistance(p: Point, poly: Point[]): number {
  const d = Math.min(...poly.map((a, i) => distToSegment(p, a, poly[(i + 1) % poly.length])));
  return pointInPolygon(p, poly) ? -d : d;
}

// Cuánto espacio libre queda alrededor de p fuera de la zona prohibida (negativo = adentro).
export function clearance(p: Point, k: KeepOut): number {
  return Math.min(...k.polygons.map((poly) => signedDistance(p, poly))) - k.margin;
}

export const isFree = (p: Point, radius: number, k: KeepOut) => clearance(p, k) >= radius;

// Un rectángulo rotado (edificio, casa, cerco) libre: sus bordes fuera del margen y ningún vértice
// de la zona prohibida adentro.
export function rectFree(center: Point, w: number, d: number, angle: number, k: KeepOut): boolean {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const at = (u: number, v: number): Point => [center[0] + u * cos - v * sin, center[1] + u * sin + v * cos];
  const samples: Point[] = [];
  for (let i = 0; i <= 4; i++) {
    const u = -w / 2 + (w * i) / 4;
    samples.push(at(u, -d / 2), at(u, d / 2));
  }
  for (let j = 1; j < 4; j++) {
    const v = -d / 2 + (d * j) / 4;
    samples.push(at(-w / 2, v), at(w / 2, v));
  }
  if (!samples.every((p) => isFree(p, 0, k))) return false;
  const rect = [at(-w / 2, -d / 2), at(w / 2, -d / 2), at(w / 2, d / 2), at(-w / 2, d / 2)];
  return !k.polygons.some((poly) => poly.some((v) => pointInPolygon(v, rect)));
}

export function keepOutBounds(k: KeepOut): Rect {
  const pts = k.polygons.flat();
  return {
    minX: Math.min(...pts.map((p) => p[0])),
    maxX: Math.max(...pts.map((p) => p[0])),
    minY: Math.min(...pts.map((p) => p[1])),
    maxY: Math.max(...pts.map((p) => p[1])),
  };
}
