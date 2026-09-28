import type { Point } from '../model/schema.ts';
import type { WallBuild } from './walls.ts';

// Medición en planta: los extremos de una cota se enganchan a esquinas y caras de muro cercanas,
// así "de pared a pared" da la medida exacta aunque el clic caiga unos centímetros al lado.

export const SNAP_TOLERANCE = 0.1; // metros

export interface SnapTargets {
  corners: Point[];
  faces: [Point, Point][];
}

export interface Snapped {
  point: Point;
  kind: 'corner' | 'face' | null;
}

// Esquinas y caras de los tramos que corta el plano de corte (lo que se ve lleno en planta).
export function snapTargets(walls: WallBuild[], cutHeight: number): SnapTargets {
  const corners: Point[] = [];
  const faces: [Point, Point][] = [];
  for (const w of walls) {
    const [dx, dy] = w.frame.dir;
    const n: Point = [dy, -dx];
    const h = w.wall.thickness / 2;
    const P = (u: number, off: number): Point => [w.wall.start[0] + dx * u + n[0] * off, w.wall.start[1] + dy * u + n[1] * off];
    for (const s of w.segments) {
      if (s.v0 > cutHeight || s.v1 < cutHeight) continue;
      for (const off of [h, -h]) {
        corners.push(P(s.u0, off), P(s.u1, off));
        faces.push([P(s.u0, off), P(s.u1, off)]);
      }
    }
  }
  // Esquinas interiores y encuentros en T: donde se cruzan dos caras (no son extremo de ningún tramo).
  for (let i = 0; i < faces.length; i++) {
    for (let j = i + 1; j < faces.length; j++) {
      const x = crossing(faces[i], faces[j]);
      if (x) corners.push(x);
    }
  }
  return { corners, faces };
}

// Intersección de dos segmentos no paralelos (con 1 mm de tolerancia en los extremos).
function crossing([a, b]: [Point, Point], [c, d]: [Point, Point]): Point | null {
  const r: Point = [b[0] - a[0], b[1] - a[1]];
  const s: Point = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const qp: Point = [c[0] - a[0], c[1] - a[1]];
  const t = (qp[0] * s[1] - qp[1] * s[0]) / den;
  const u = (qp[0] * r[1] - qp[1] * r[0]) / den;
  const lr = Math.hypot(...r);
  const ls = Math.hypot(...s);
  const tol = 1e-3;
  if (t * lr < -tol || (t - 1) * lr > tol || u * ls < -tol || (u - 1) * ls > tol) return null;
  return [a[0] + r[0] * t, a[1] + r[1] * t];
}

function closestOnSegment(p: Point, [a, b]: [Point, Point]): Point {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  return [a[0] + dx * t, a[1] + dy * t];
}

export const distance = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);

// Esquina si hay una a menos de la tolerancia; si no, la cara más cercana; si no, el punto tal cual.
export function snapPoint(p: Point, targets: SnapTargets, tolerance = SNAP_TOLERANCE): Snapped {
  let best: Snapped | null = null;
  let bestD = tolerance;
  for (const c of targets.corners) {
    const d = distance(p, c);
    if (d <= bestD) {
      bestD = d;
      best = { point: c, kind: 'corner' };
    }
  }
  if (best) return best;
  for (const f of targets.faces) {
    const q = closestOnSegment(p, f);
    const d = distance(p, q);
    if (d <= bestD) {
      bestD = d;
      best = { point: q, kind: 'face' };
    }
  }
  return best ?? { point: p, kind: null };
}

// Shift: cota horizontal o vertical (manda el eje con más recorrido).
export function constrainAxis(a: Point, b: Point): Point {
  return Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? [b[0], a[1]] : [a[0], b[1]];
}

export const formatMeters = (d: number) => `${d.toFixed(2).replace('.', ',')} m`;
